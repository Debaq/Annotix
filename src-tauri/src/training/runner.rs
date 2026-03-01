use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

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

        let pf = state.read_project_file(project_id)?;

        // Actualizar estado a training
        state.with_project_mut(project_id, |pf| {
            if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
                job.status = "training".to_string();
                job.updated_at = js_timestamp();
            }
        })?;

        // Preparar directorio del dataset
        let dataset_dir = state.data_dir
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

        // Filtrar imágenes con anotaciones válidas
        let images: Vec<ImageEntry> = pf.images.iter().cloned().map(|mut img| {
            img.annotations.retain(|ann| {
                pf.classes.iter().any(|c| c.id == ann.class_id)
            });
            img
        }).collect();

        // Preparar dataset en disco
        let data_yaml_path = dataset::prepare_dataset(
            &images_dir, &pf, &images, &dataset_dir,
            config.val_split, &config.task,
        )?;

        // Generar script
        let script_content = scripts::generate_train_script(&config, &data_yaml_path);
        let script_path = dataset_dir.join("train.py");
        std::fs::write(&script_path, &script_content)
            .map_err(|e| format!("Error escribiendo train.py: {}", e))?;

        // Actualizar job con rutas
        let ds_str = dataset_dir.to_string_lossy().to_string();
        let result_str = dataset_dir.join("train").to_string_lossy().to_string();
        state.with_project_mut(project_id, |pf| {
            if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id_owned) {
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
                    if let Some(json_str) = line.strip_prefix("ANNOTIX_EVENT:") {
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
                            handle_event(&app_clone, &job_id_thread, &event, &project_dir_clone);
                        }
                    } else if !line.trim().is_empty() {
                        logs.push(line.clone());
                        let _ = app_clone.emit("training:log", serde_json::json!({
                            "jobId": &job_id_thread,
                            "message": line,
                        }));

                        // Actualizar logs periódicamente (cada 10 líneas)
                        if logs.len() % 10 == 0 {
                            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                                job.logs = logs.clone();
                                job.updated_at = js_timestamp();
                            });
                        }
                    }
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

        let dataset_dir = state.data_dir
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

        let images: Vec<crate::store::project_file::ImageEntry> = pf.images.iter().cloned().map(|mut img| {
            img.annotations.retain(|ann| {
                pf.classes.iter().any(|c| c.id == ann.class_id)
            });
            img
        }).collect();

        // Prepare dataset using backend router
        let dataset_path = dataset::prepare_dataset_for_backend(
            &images_dir, &pf, &images, &dataset_dir,
            request.val_split, &request.task, &request.backend,
        )?;

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
                    if let Some(json_str) = line.strip_prefix("ANNOTIX_EVENT:") {
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
                            handle_event(&app_clone, &job_id_thread, &event, &project_dir_clone);
                        }
                    } else if !line.trim().is_empty() {
                        logs.push(line.clone());
                        let _ = app_clone.emit("training:log", serde_json::json!({
                            "jobId": &job_id_thread,
                            "message": line,
                        }));

                        if logs.len() % 10 == 0 {
                            update_job_in_project(&project_dir_clone, &job_id_thread, |job| {
                                job.logs = logs.clone();
                                job.updated_at = js_timestamp();
                            });
                        }
                    }
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

fn handle_event(app: &AppHandle, job_id: &str, event: &serde_json::Value, project_dir: &PathBuf) {
    let event_type = event["type"].as_str().unwrap_or("");

    match event_type {
        "epoch" => {
            let progress_event = TrainingProgressEvent {
                job_id: job_id.to_string(),
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

            update_job_in_project(project_dir, job_id, |job| {
                job.progress = progress;
                if let Some(m) = metrics_json {
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
