use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter};

use crate::store::AppState;
use crate::store::project_file::ImageEntry;
use super::{TrainingConfig, TrainingRequest, TrainingProgressEvent, TrainingResult, ExportedModel, TrainingEpochMetrics};
use super::python_env;
use super::dataset;
use super::scripts;

pub struct TrainingProcessManager {
    processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl TrainingProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Inicia un entrenamiento: prepara dataset, genera script, spawna proceso
    pub fn start_training(
        &self,
        state: &AppState,
        app: &AppHandle,
        project_id: &str,
        job_id: &str,
        config: TrainingConfig,
    ) -> Result<(), String> {
        let python = python_env::venv_python()?;
        if !python.exists() {
            return Err("Entorno Python no configurado. Ejecuta setup primero.".to_string());
        }

        // Leer proyecto e imágenes antes de spawn
        let project_dir = state.project_dir(project_id)?;
        let images_dir = state.project_images_dir(project_id)?;
        let job_id_owned = job_id.to_string();

        let mut pf = state.read_project_file(project_id)?;

        // Preparar directorio del dataset (dentro del proyecto)
        let dataset_dir = project_dir
            .join("training")
            .join(format!("job_{}", job_id));
        std::fs::create_dir_all(&dataset_dir)
            .map_err(|e| format!("Error creando directorio de training: {}", e))?;

        if pf.images.is_empty() {
            state.with_project_mut(project_id, |pf| {
                if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                    job.status = "failed".to_string();
                    job.updated_at = js_timestamp();
                }
            })?;
            return Err("No hay imágenes en el proyecto".to_string());
        }

        // Filtrar anotaciones huérfanas: HashSet O(1) lookup, drain para evitar 2do clone
        let class_ids: HashSet<i64> = pf.classes.iter().map(|c| c.id).collect();
        let raw_images = std::mem::take(&mut pf.images);
        let images: Vec<ImageEntry> = raw_images.into_iter().map(|mut img| {
            img.annotations.retain(|ann| class_ids.contains(&ann.class_id));
            img
        }).collect();

        // Preparar dataset en disco
        let data_yaml_path = dataset::prepare_dataset(
            &images_dir, &pf, &images, &dataset_dir,
            config.val_split, config.test_split, &config.task,
        )?;

        // Generar script
        let script_content = scripts::generate_train_script(&config, &data_yaml_path);
        let script_path = dataset_dir.join("train.py");
        std::fs::write(&script_path, &script_content)
            .map_err(|e| format!("Error escribiendo train.py: {}", e))?;

        // Batch: status→training + rutas en un solo flush
        let ds_str = dataset_dir.to_string_lossy().to_string();
        let result_str = dataset_dir.join("train").to_string_lossy().to_string();
        state.with_project_mut(project_id, |pf| {
            if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                job.status = "training".to_string();
                job.dataset_dir = Some(ds_str);
                job.result_dir = Some(result_str);
                job.updated_at = js_timestamp();
            }
        })?;

        // Spawn proceso Python
        let mut cmd = Command::new(&python);
        cmd.args(["-u", &script_path.to_string_lossy()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        super::hide_console_window(&mut cmd);
        let mut child = cmd.spawn()
            .map_err(|e| format!("Error iniciando entrenamiento: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Registrar proceso
        {
            let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
            procs.insert(job_id.to_string(), child);
        }

        // Threads para leer stdout y stderr
        let app_clone = app.clone();
        let processes = self.processes.clone();
        let project_dir_clone = project_dir.clone();
        let job_id_thread = job_id.to_string();

        std::thread::spawn(move || {
            let mut logs: Vec<String> = Vec::new();

            // Leer stdout
            if let Some(stdout) = stdout {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    process_log_line(&app_clone, &job_id_thread, &line, &mut logs, &project_dir_clone);
                }
            }

            // Esperar a que el proceso termine
            {
                let mut procs = processes.lock().unwrap();
                if let Some(mut child) = procs.remove(&job_id_thread) {
                    let status = child.wait();
                    let success = status.map(|s| s.success()).unwrap_or(false);

                    if !success {
                        // Leer stderr si falló
                        if let Some(stderr) = stderr {
                            let reader = BufReader::new(stderr);
                            let stderr_lines: Vec<String> = reader.lines()
                                .map_while(Result::ok)
                                .collect();
                            let error_msg = stderr_lines.join("\n");

                            flush_log_throttle(&app_clone, &job_id_thread);
                            let _ = app_clone.emit("training:error", serde_json::json!({
                                "jobId": &job_id_thread,
                                "error": error_msg,
                            }));

                            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                                job.status = "failed".to_string();
                                job.updated_at = js_timestamp();
                            });
                        }
                    }
                }
            }

            // Guardar logs finales
            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                job.logs = logs;
                job.updated_at = js_timestamp();
            });
        });

        Ok(())
    }

    /// Inicia entrenamiento multi-backend con TrainingRequest
    pub fn start_training_v2(
        &self,
        state: &AppState,
        app: &AppHandle,
        project_id: &str,
        job_id: &str,
        request: TrainingRequest,
    ) -> Result<(), String> {
        let python = python_env::venv_python()?;
        if !python.exists() {
            return Err("Entorno Python no configurado. Ejecuta setup primero.".to_string());
        }

        let project_dir = state.project_dir(project_id)?;
        let images_dir = state.project_images_dir(project_id)?;
        let job_id_owned = job_id.to_string();

        let pf = state.read_project_file(project_id)?;

        state.with_project_mut(project_id, |pf| {
            if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                job.status = "training".to_string();
                job.updated_at = js_timestamp();
            }
        })?;

        let dataset_dir = project_dir
            .join("training")
            .join(format!("job_{}", job_id));
        std::fs::create_dir_all(&dataset_dir)
            .map_err(|e| format!("Error creando directorio de training: {}", e))?;

        let is_tabular = request.backend == super::TrainingBackend::Sklearn;

        if !is_tabular && pf.images.is_empty() {
            state.with_project_mut(project_id, |pf| {
                if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                    job.status = "failed".to_string();
                    job.updated_at = js_timestamp();
                }
            })?;
            return Err("No hay imágenes en el proyecto".to_string());
        }

        // For tabular projects, copy the CSV to the dataset dir
        if is_tabular {
            if let Some(tabular_entry) = pf.tabular_data.first() {
                let tabular_dir = state.project_dir(project_id)?.join("tabular");
                let src = tabular_dir.join(&tabular_entry.file);
                if src.exists() {
                    let dest = dataset_dir.join("data.csv");
                    std::fs::copy(&src, &dest)
                        .map_err(|e| format!("Error copiando CSV para training: {}", e))?;
                }
            } else {
                state.with_project_mut(project_id, |pf| {
                    if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                        job.status = "failed".to_string();
                        job.updated_at = js_timestamp();
                    }
                })?;
                return Err("No hay datos tabulares en el proyecto".to_string());
            }
        }

        let images: Vec<crate::store::project_file::ImageEntry> = pf.images.iter().cloned().map(|mut img| {
            img.annotations.retain(|ann| {
                pf.classes.iter().any(|c| c.id == ann.class_id)
            });
            img
        }).collect();

        // Prepare dataset using backend router
        let dataset_path = if is_tabular {
            dataset_dir.to_string_lossy().replace('\\', "/")
        } else {
            dataset::prepare_dataset_for_backend(
                &images_dir, &pf, &images, &dataset_dir,
                request.val_split, request.test_split, &request.task, &request.backend,
            )?
        };

        // Generate scripts
        let num_classes = pf.classes.len();
        let script_files = scripts::generate_train_script_for_backend(&request, &dataset_path, num_classes);

        // Write all generated files
        for (filename, content) in &script_files {
            let path = dataset_dir.join(filename);
            std::fs::write(&path, content)
                .map_err(|e| format!("Error escribiendo {}: {}", filename, e))?;
        }

        let script_path = dataset_dir.join("train.py");

        let ds_str = dataset_dir.to_string_lossy().to_string();
        let result_str = dataset_dir.join("train").to_string_lossy().to_string();
        state.with_project_mut(project_id, |pf| {
            if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                job.dataset_dir = Some(ds_str);
                job.result_dir = Some(result_str);
                job.updated_at = js_timestamp();
            }
        })?;

        // Spawn Python
        let mut cmd = Command::new(&python);
        cmd.args(["-u", &script_path.to_string_lossy()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        super::hide_console_window(&mut cmd);
        let mut child = cmd.spawn()
            .map_err(|e| format!("Error iniciando entrenamiento: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
            procs.insert(job_id.to_string(), child);
        }

        let app_clone = app.clone();
        let processes = self.processes.clone();
        let project_dir_clone = project_dir.clone();
        let job_id_thread = job_id.to_string();

        std::thread::spawn(move || {
            let mut logs: Vec<String> = Vec::new();

            if let Some(stdout) = stdout {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    process_log_line(&app_clone, &job_id_thread, &line, &mut logs, &project_dir_clone);
                }
            }

            {
                let mut procs = processes.lock().unwrap();
                if let Some(mut child) = procs.remove(&job_id_thread) {
                    let status = child.wait();
                    let success = status.map(|s| s.success()).unwrap_or(false);

                    if !success {
                        if let Some(stderr) = stderr {
                            let reader = BufReader::new(stderr);
                            let stderr_lines: Vec<String> = reader.lines()
                                .map_while(Result::ok)
                                .collect();
                            let error_msg = stderr_lines.join("\n");

                            flush_log_throttle(&app_clone, &job_id_thread);
                            let _ = app_clone.emit("training:error", serde_json::json!({
                                "jobId": &job_id_thread,
                                "error": error_msg,
                            }));

                            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                                job.status = "failed".to_string();
                                job.updated_at = js_timestamp();
                            });
                        }
                    }
                }
            }

            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                job.logs = logs;
                job.updated_at = js_timestamp();
            });
        });

        Ok(())
    }

    /// Reanuda un entrenamiento YOLO/RT-DETR existente usando `resume=True`
    /// (mismo run dir, last.pt + args.yaml originales, épocas continuas).
    pub fn resume_training(
        &self,
        state: &AppState,
        app: &AppHandle,
        project_id: &str,
        job_id: &str,
    ) -> Result<(), String> {
        let python = python_env::venv_python()?;
        if !python.exists() {
            return Err("Entorno Python no configurado".to_string());
        }

        let project_dir = state.project_dir(project_id)?;
        let pf = state.read_project_file(project_id)?;
        let job = pf.training_jobs.iter().find(|j| j.id == job_id)
            .ok_or("Job no encontrado")?;

        // Ubicar last.pt
        let result_dir = job.result_dir.as_ref()
            .ok_or("Job sin result_dir. No se puede reanudar (requiere run previo).")?;
        let last_pt = PathBuf::from(result_dir).join("weights").join("last.pt");
        if !last_pt.exists() {
            return Err(format!("No existe last.pt en {:?}", last_pt));
        }

        let dataset_dir = job.dataset_dir.as_ref()
            .ok_or("Job sin dataset_dir")?;
        let dataset_dir = PathBuf::from(dataset_dir);

        // Generar script de resume en el dataset_dir
        let script = scripts::generate_yolo_resume_script(&last_pt.to_string_lossy());
        let script_path = dataset_dir.join("train_resume.py");
        std::fs::write(&script_path, &script)
            .map_err(|e| format!("Error escribiendo train_resume.py: {}", e))?;

        // Hidratar metrics_history desde results.csv si está vacío (jobs legacy
        // o que crashearon antes de este fix). Idempotente: no toca si ya hay datos.
        let hydrated = hydrate_history_from_results_csv(&PathBuf::from(result_dir));

        // Marcar job como training otra vez
        let job_id_owned = job_id.to_string();
        state.with_project_mut(project_id, |pf| {
            if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                job.status = "training".to_string();
                if job.metrics_history.is_empty() {
                    if let Some(ref h) = hydrated {
                        job.metrics_history = h.clone();
                    }
                }
                job.updated_at = js_timestamp();
            }
        })?;
        let _ = state.flush_project(project_id);

        // Spawn Python
        let mut cmd = Command::new(&python);
        cmd.args(["-u", &script_path.to_string_lossy()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        super::hide_console_window(&mut cmd);
        let mut child = cmd.spawn()
            .map_err(|e| format!("Error reanudando entrenamiento: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        {
            let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
            procs.insert(job_id.to_string(), child);
        }

        let app_clone = app.clone();
        let processes = self.processes.clone();
        let project_dir_clone = project_dir.clone();
        let job_id_thread = job_id.to_string();

        std::thread::spawn(move || {
            let mut logs: Vec<String> = Vec::new();

            if let Some(stdout) = stdout {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    process_log_line(&app_clone, &job_id_thread, &line, &mut logs, &project_dir_clone);
                }
            }

            {
                let mut procs = processes.lock().unwrap();
                if let Some(mut child) = procs.remove(&job_id_thread) {
                    let status = child.wait();
                    let success = status.map(|s| s.success()).unwrap_or(false);
                    if !success {
                        if let Some(stderr) = stderr {
                            let reader = BufReader::new(stderr);
                            let error_msg: String = reader.lines().map_while(Result::ok).collect::<Vec<_>>().join("\n");
                            flush_log_throttle(&app_clone, &job_id_thread);
                            let _ = app_clone.emit("training:error", serde_json::json!({
                                "jobId": &job_id_thread,
                                "error": error_msg,
                            }));
                            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                                job.status = "failed".to_string();
                                job.updated_at = js_timestamp();
                            });
                        }
                    }
                }
            }

            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                job.logs = logs;
                job.updated_at = js_timestamp();
            });
        });

        Ok(())
    }

    /// Cancela un entrenamiento activo
    pub fn cancel_training(&self, job_id: &str) -> Result<(), String> {
        let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = procs.remove(job_id) {
            child.kill().map_err(|e| format!("Error cancelando proceso: {}", e))?;
            Ok(())
        } else {
            Err("No se encontró proceso de entrenamiento activo".to_string())
        }
    }

    /// Verifica si un job está activamente ejecutándose
    pub fn is_running(&self, job_id: &str) -> bool {
        let procs = self.processes.lock().unwrap();
        procs.contains_key(job_id)
    }
}

/// Strip ANSI CSI/OSC escape sequences from text produced por procesos Python
/// (ultralytics colorea con códigos `\x1b[...m`).
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\x1b' {
            out.push(c);
            continue;
        }
        match chars.peek().copied() {
            Some('[') => {
                chars.next();
                while let Some(nc) = chars.next() {
                    if ('@'..='~').contains(&nc) { break; }
                }
            }
            Some(']') => {
                chars.next();
                while let Some(nc) = chars.next() {
                    if nc == '\x07' { break; }
                    if nc == '\x1b' {
                        if let Some(&'\\') = chars.peek() { chars.next(); }
                        break;
                    }
                }
            }
            Some(_) => { chars.next(); }
            None => {}
        }
    }
    out
}

/// Convierte una línea cruda (potencialmente con `\r` de progress-bars y ANSI)
/// en una o varias líneas limpias, aptas para log viewer.
fn sanitize_log_line(line: &str) -> Vec<String> {
    line.split('\r')
        .map(strip_ansi)
        .map(|s| s.trim_end().to_string())
        .filter(|s| !s.trim().is_empty())
        .collect()
}

/// Procesa una línea de stdout del trainer: si es un evento estructurado
/// (`ANNOTIX_EVENT:`) lo despacha; en caso contrario la sanea y emite/guarda
/// como log legible.
/// Estado por-job para throttle de emisiones de log.
/// Si llegan muchas líneas en <100ms, las acumula y emite el batch en la
/// siguiente ventana (max 10 emit/seg). Siempre se emite el último batch al
/// terminar el job (caller hace flush manual).
#[derive(Default)]
struct LogThrottle {
    last_emit: Option<Instant>,
    pending: Vec<String>,
}

thread_local! {
    static LOG_THROTTLE: std::cell::RefCell<HashMap<String, LogThrottle>> = std::cell::RefCell::new(HashMap::new());
}

fn emit_log_throttled(app: &AppHandle, job_id: &str, message: String) {
    LOG_THROTTLE.with(|cell| {
        let mut map = cell.borrow_mut();
        let entry = map.entry(job_id.to_string()).or_default();
        entry.pending.push(message);
        let now = Instant::now();
        let should_emit = match entry.last_emit {
            None => true,
            Some(t) => now.duration_since(t).as_millis() >= 100,
        };
        if should_emit {
            let batch: Vec<String> = std::mem::take(&mut entry.pending);
            entry.last_emit = Some(now);
            let combined = batch.join("\n");
            let _ = app.emit("training:log", serde_json::json!({
                "jobId": job_id,
                "message": combined,
            }));
        }
    });
}

fn process_log_line(
    app: &AppHandle,
    job_id: &str,
    line: &str,
    logs: &mut Vec<String>,
    project_dir: &PathBuf,
) {
    if let Some(json_str) = line.strip_prefix("ANNOTIX_EVENT:") {
        if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
            handle_event(app, job_id, &event, project_dir);
        }
        return;
    }
    for clean in sanitize_log_line(line) {
        logs.push(clean.clone());
        emit_log_throttled(app, job_id, clean);
        if logs.len() % 10 == 0 {
            update_job_in_project(project_dir, job_id, |job| {
                job.logs = logs.clone();
                job.updated_at = js_timestamp();
            });
        }
    }
}

/// Fuerza la emisión del último batch de logs pendientes para un job.
/// Debe llamarse al terminar/fallar el job para no perder el último burst.
pub fn flush_log_throttle(app: &AppHandle, job_id: &str) {
    LOG_THROTTLE.with(|cell| {
        let mut map = cell.borrow_mut();
        if let Some(entry) = map.get_mut(job_id) {
            if !entry.pending.is_empty() {
                let batch: Vec<String> = std::mem::take(&mut entry.pending);
                let combined = batch.join("\n");
                let _ = app.emit("training:log", serde_json::json!({
                    "jobId": job_id,
                    "message": combined,
                }));
            }
            map.remove(job_id);
        }
    });
}

/// Lee `results.csv` de ultralytics y reconstruye `metrics_history`.
/// Devuelve `None` si no hay csv o no se puede parsear.
fn hydrate_history_from_results_csv(result_dir: &PathBuf) -> Option<Vec<serde_json::Value>> {
    let csv_path = result_dir.join("results.csv");
    let content = std::fs::read_to_string(&csv_path).ok()?;
    let mut lines = content.lines();
    let header = lines.next()?;
    let cols: Vec<&str> = header.split(',').map(|s| s.trim()).collect();
    let idx = |name: &str| cols.iter().position(|c| *c == name);
    let i_epoch = idx("epoch")?;
    let i_p = idx("metrics/precision(B)");
    let i_r = idx("metrics/recall(B)");
    let i_m50 = idx("metrics/mAP50(B)");
    let i_m5095 = idx("metrics/mAP50-95(B)");
    let i_box = idx("train/box_loss");
    let i_cls = idx("train/cls_loss");
    let i_dfl = idx("train/dfl_loss");
    let mut out: Vec<serde_json::Value> = Vec::new();
    for line in lines {
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() <= i_epoch { continue; }
        let epoch: u64 = match parts[i_epoch].parse() { Ok(v) => v, Err(_) => continue };
        let get = |i: Option<usize>| -> Option<f64> {
            i.and_then(|i| parts.get(i)).and_then(|s| s.parse().ok())
        };
        let mut m = serde_json::Map::new();
        if let Some(v) = get(i_p) { m.insert("precision".into(), v.into()); }
        if let Some(v) = get(i_r) { m.insert("recall".into(), v.into()); }
        if let Some(v) = get(i_m50) { m.insert("mAP50".into(), v.into()); }
        if let Some(v) = get(i_m5095) { m.insert("mAP50_95".into(), v.into()); }
        if let Some(v) = get(i_box) { m.insert("boxLoss".into(), v.into()); }
        if let Some(v) = get(i_cls) { m.insert("clsLoss".into(), v.into()); }
        if let Some(v) = get(i_dfl) { m.insert("dflLoss".into(), v.into()); }
        out.push(serde_json::json!({
            "epoch": epoch,
            "metrics": serde_json::Value::Object(m),
            "ts": 0.0,
            "fromCsv": true,
        }));
    }
    if out.is_empty() { None } else { Some(out) }
}

fn handle_event(app: &AppHandle, job_id: &str, event: &serde_json::Value, project_dir: &PathBuf) {
    let event_type = event["type"].as_str().unwrap_or("");

    match event_type {
        "epoch" => {
            let project_id = project_dir.file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string());
            let progress_event = TrainingProgressEvent {
                job_id: job_id.to_string(),
                project_id,
                epoch: event["epoch"].as_u64().unwrap_or(0) as u32,
                total_epochs: event["totalEpochs"].as_u64().unwrap_or(0) as u32,
                progress: event["progress"].as_f64().unwrap_or(0.0),
                metrics: parse_metrics(&event["metrics"]),
                phase: "training".to_string(),
            };

            let _ = app.emit("training:progress", &progress_event);

            // Actualizar progreso y métricas en project.json
            let progress = progress_event.progress;
            let metrics_json = serde_json::to_value(&progress_event.metrics).ok();

            let epoch_num = progress_event.epoch;
            let total_num = progress_event.total_epochs;
            update_job_in_project(project_dir, job_id, |job| {
                job.progress = progress;
                if let Some(m) = metrics_json {
                    // Append al historial (dedup por epoch: si reaparece, sustituye).
                    let entry = serde_json::json!({
                        "epoch": epoch_num,
                        "totalEpochs": total_num,
                        "metrics": &m,
                        "ts": js_timestamp(),
                    });
                    if let Some(idx) = job.metrics_history.iter().position(|e| {
                        e.get("epoch").and_then(|v| v.as_u64()) == Some(epoch_num as u64)
                    }) {
                        job.metrics_history[idx] = entry;
                    } else {
                        job.metrics_history.push(entry);
                    }
                    job.metrics = Some(m);
                }
                job.updated_at = js_timestamp();
            });
        }
        "completed" => {
            let result = TrainingResult {
                best_model_path: event["bestModelPath"].as_str().map(|s| s.to_string()),
                last_model_path: event["lastModelPath"].as_str().map(|s| s.to_string()),
                results_dir: event["resultsDir"].as_str().map(|s| s.to_string()),
                final_metrics: event.get("finalMetrics").and_then(parse_metrics),
                exported_models: event["exportedModels"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|e| {
                                Some(ExportedModel {
                                    format: e["format"].as_str()?.to_string(),
                                    path: e["path"].as_str()?.to_string(),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            };

            // Asegurar que el último batch de logs del entrenamiento llegue al frontend.
            flush_log_throttle(app, job_id);

            let _ = app.emit("training:completed", serde_json::json!({
                "jobId": job_id,
                "result": &result,
            }));

            // Actualizar project.json
            let best = result.best_model_path.clone();
            let final_metrics = result.final_metrics.clone();
            update_job_in_project(project_dir, job_id, |job| {
                job.status = "completed".to_string();
                job.progress = 100.0;
                if let Some(best) = best {
                    job.best_model_path = Some(best);
                }
                if let Some(metrics) = final_metrics {
                    if let Ok(m) = serde_json::to_value(metrics) {
                        job.metrics = Some(m);
                    }
                }
                job.updated_at = js_timestamp();
            });
        }
        _ => {}
    }
}

fn parse_metrics(v: &serde_json::Value) -> Option<TrainingEpochMetrics> {
    if v.is_null() || !v.is_object() {
        return None;
    }
    Some(TrainingEpochMetrics {
        train_loss: v["trainLoss"].as_f64(),
        val_loss: v["valLoss"].as_f64(),
        box_loss: v["boxLoss"].as_f64(),
        cls_loss: v["clsLoss"].as_f64(),
        dfl_loss: v["dflLoss"].as_f64(),
        precision: v["precision"].as_f64(),
        recall: v["recall"].as_f64(),
        map50: v["mAP50"].as_f64(),
        map50_95: v["mAP50_95"].as_f64(),
        lr: v["lr"].as_f64(),
        mean_iou: v["meanIoU"].as_f64(),
        mean_accuracy: v["meanAccuracy"].as_f64(),
        dice_loss: v["diceLoss"].as_f64(),
        seg_loss: v["segLoss"].as_f64(),
        mask_ap: v["maskAP"].as_f64(),
        keypoint_ap: v["keypointAP"].as_f64(),
        accuracy: v["accuracy"].as_f64(),
        f1_score: v["f1Score"].as_f64(),
        mae: v["mae"].as_f64(),
        rmse: v["rmse"].as_f64(),
        auc_roc: v["aucRoc"].as_f64(),
        silhouette_score: v["silhouetteScore"].as_f64(),
        r2_score: v["r2Score"].as_f64(),
        mse: v["mse"].as_f64(),
        roc_auc: v["rocAuc"].as_f64(),
    })
}

/// Actualiza un training job dentro de project.json directamente (para uso desde threads)
fn update_job_in_project<F>(project_dir: &PathBuf, job_id: &str, f: F)
where
    F: FnOnce(&mut crate::store::project_file::TrainingJobEntry),
{
    if let Ok(mut pf) = crate::store::io::read_project(project_dir) {
        if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id) {
            f(job);
        }
        let _ = crate::store::io::write_project(project_dir, &pf);
    }
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
