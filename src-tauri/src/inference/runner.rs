use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::store::AppState;
use crate::store::project_file::AnnotationEntry;
use super::{InferenceConfig, InferenceProgressEvent};
use super::scripts;

/// Gestor de procesos de inferencia activos
pub struct InferenceProcessManager {
    /// Procesos Python activos (para .pt)
    processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Flags de cancelación para jobs nativos (ONNX)
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl InferenceProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Ejecuta inferencia batch sobre varias imágenes
    pub fn start_inference(
        &self,
        state: &AppState,
        app: &AppHandle,
        project_id: &str,
        model_id: &str,
        image_ids: &[String],
        config: InferenceConfig,
    ) -> Result<String, String> {
        let job_id = uuid::Uuid::new_v4().to_string();

        // Obtener info del modelo
        let model_info = state.with_project(project_id, |pf| {
            pf.inference_models
                .iter()
                .find(|m| m.id == model_id)
                .cloned()
        })?;

        let model_info = model_info.ok_or("Modelo de inferencia no encontrado")?;

        // Obtener ruta del modelo
        let model_path = state.get_model_file_path(project_id, model_id)?;

        // Obtener rutas de imágenes
        let images_dir = state.project_images_dir(project_id)?;
        let image_paths: Vec<(String, String)> = state.with_project(project_id, |pf| {
            image_ids
                .iter()
                .filter_map(|id| {
                    pf.images.iter().find(|i| i.id == *id).map(|img| {
                        (
                            img.id.clone(),
                            images_dir.join(&img.file).to_string_lossy().to_string(),
                        )
                    })
                })
                .collect()
        })?;

        if image_paths.is_empty() {
            return Err("No se encontraron imágenes válidas para inferencia".to_string());
        }

        match model_info.format.as_str() {
            "onnx" => self.start_onnx_native(
                app, &job_id, &model_path, &model_info.class_names,
                &image_paths, &config,
                model_id, project_id,
                &model_info.task,
                model_info.output_format.as_deref(),
            ),
            "pt" => self.start_python_inference(
                state, app, &job_id, &model_path, &model_info,
                &image_paths, &config, project_id,
            ),
            _ => Err(format!("Formato no soportado: {}", model_info.format)),
        }?;

        Ok(job_id)
    }

    /// Inferencia ONNX nativa con el crate `ort`
    fn start_onnx_native(
        &self,
        app: &AppHandle,
        job_id: &str,
        model_path: &str,
        class_names: &[String],
        image_paths: &[(String, String)],
        config: &InferenceConfig,
        model_id: &str,
        project_id: &str,
        task: &str,
        output_format: Option<&str>,
    ) -> Result<(), String> {
        // Cargar modelo (validar antes de lanzar el thread)
        let mut session = super::ort_runner::load_model(model_path)?;
        let input_size = config.input_size.unwrap_or(640);
        let num_classes = class_names.len();

        // Flag de cancelación
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut flags = self.cancel_flags.lock().map_err(|e| e.to_string())?;
            flags.insert(job_id.to_string(), cancel.clone());
        }

        let app_clone = app.clone();
        let job_id_owned = job_id.to_string();
        let class_names_owned: Vec<String> = class_names.to_vec();
        let image_paths_owned: Vec<(String, String)> = image_paths.to_vec();
        let conf_threshold = config.confidence_threshold;
        let iou_threshold = config.iou_threshold;
        let project_id_owned = project_id.to_string();
        let cancel_flags = self.cancel_flags.clone();
        let task_owned = task.to_string();
        let output_format_owned = output_format.map(|s| s.to_string());
        let model_id_owned = model_id.to_string();

        std::thread::spawn(move || {
            let total = image_paths_owned.len();

            for (idx, (image_id, image_path)) in image_paths_owned.iter().enumerate() {
                if cancel.load(Ordering::Relaxed) {
                    break;
                }

                let start = std::time::Instant::now();

                // Leer dimensiones de la imagen original para denormalizar coordenadas
                let img_dims = image::image_dimensions(image_path).ok();

                match super::ort_runner::run_inference(
                    &mut session,
                    image_path,
                    conf_threshold,
                    iou_threshold,
                    input_size,
                    num_classes,
                    &task_owned,
                    output_format_owned.as_deref(),
                ) {
                    Ok(result) => {
                        let ai_annotations = match result {
                            super::ort_runner::InferenceResult::Detections(detections) => {
                                detections_to_annotations(
                                    &detections, &class_names_owned,
                                    &app_clone, &project_id_owned,
                                    &model_id_owned, img_dims,
                                )
                            }
                            super::ort_runner::InferenceResult::Classifications(classifications) => {
                                classifications_to_annotations(
                                    &classifications, &class_names_owned,
                                    &app_clone, &project_id_owned,
                                    &model_id_owned,
                                )
                            }
                        };

                        let ann_count = ai_annotations.len();
                        let elapsed = start.elapsed().as_millis() as f64;

                        log::info!(
                            "[ONNX Inference] image={} annotations={} time={:.0}ms",
                            image_id, ann_count, elapsed
                        );

                        save_ai_annotations(
                            &app_clone, &project_id_owned, image_id, ai_annotations,
                        );

                        let _ = app_clone.emit(
                            "inference:progress",
                            &InferenceProgressEvent {
                                job_id: job_id_owned.clone(),
                                current: idx + 1,
                                total,
                                image_id: image_id.clone(),
                                predictions_count: ann_count,
                            },
                        );

                        let _ = app_clone.emit(
                            "inference:result",
                            serde_json::json!({
                                "jobId": &job_id_owned,
                                "imageId": image_id,
                                "predictionsCount": ann_count,
                                "inferenceTimeMs": elapsed,
                                "current": idx + 1,
                                "total": total,
                            }),
                        );
                    }
                    Err(err) => {
                        let _ = app_clone.emit(
                            "inference:error",
                            serde_json::json!({
                                "jobId": &job_id_owned,
                                "imageId": image_id,
                                "error": err,
                            }),
                        );
                    }
                }
            }

            let _ = app_clone.emit(
                "inference:completed",
                serde_json::json!({ "jobId": &job_id_owned }),
            );

            if let Ok(mut flags) = cancel_flags.lock() {
                flags.remove(&job_id_owned);
            }
        });

        Ok(())
    }

    /// Inferencia con Python (para modelos .pt)
    fn start_python_inference(
        &self,
        state: &AppState,
        app: &AppHandle,
        job_id: &str,
        model_path: &str,
        model_info: &crate::store::project_file::InferenceModelEntry,
        image_paths: &[(String, String)],
        config: &InferenceConfig,
        project_id: &str,
    ) -> Result<(), String> {
        let python = crate::training::python_env::venv_python()?;
        if !python.exists() {
            return Err("Entorno Python no configurado. Ejecuta setup primero.".to_string());
        }

        let script_content = scripts::generate_pt_inference_script(
            model_path,
            image_paths,
            config,
            &model_info.task,
        );

        // Escribir script temporal
        let script_dir = state.data_dir.join("inference").join(job_id);
        std::fs::create_dir_all(&script_dir)
            .map_err(|e| format!("Error creando directorio de inferencia: {e}"))?;
        let script_path = script_dir.join("infer.py");
        std::fs::write(&script_path, &script_content)
            .map_err(|e| format!("Error escribiendo script: {e}"))?;

        // Spawn proceso Python
        let mut cmd = Command::new(&python);
        cmd.args(["-u", &script_path.to_string_lossy()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        crate::training::hide_console_window(&mut cmd);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Error iniciando inferencia Python: {e}"))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
            procs.insert(job_id.to_string(), child);
        }

        let app_clone = app.clone();
        let processes = self.processes.clone();
        let job_id_thread = job_id.to_string();
        let model_id_owned = model_info.id.clone();
        let project_id_owned = project_id.to_string();

        std::thread::spawn(move || {
            if let Some(stdout) = stdout {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    if let Some(json_str) = line.strip_prefix("ANNOTIX_EVENT:") {
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
                            handle_python_event(
                                &app_clone,
                                &job_id_thread,
                                &model_id_owned,
                                &project_id_owned,
                                &event,
                            );
                        }
                    }
                }
            }

            // Esperar fin del proceso
            {
                let mut procs = processes.lock().unwrap();
                if let Some(mut child) = procs.remove(&job_id_thread) {
                    let status = child.wait();
                    let success = status.map(|s| s.success()).unwrap_or(false);

                    if !success {
                        if let Some(stderr) = stderr {
                            let reader = BufReader::new(stderr);
                            let lines: Vec<String> =
                                reader.lines().map_while(Result::ok).collect();
                            let _ = app_clone.emit(
                                "inference:error",
                                serde_json::json!({
                                    "jobId": &job_id_thread,
                                    "error": lines.join("\n"),
                                }),
                            );
                        }
                    }
                }
            }

            // Limpiar script temporal
            let script_dir = std::path::PathBuf::from(format!(
                "{}/inference/{}",
                directories::ProjectDirs::from("com", "tecmedhub", "annotix")
                    .map(|p| p.data_dir().to_string_lossy().to_string())
                    .unwrap_or_default(),
                &job_id_thread
            ));
            let _ = std::fs::remove_dir_all(&script_dir);
        });

        Ok(())
    }

    /// Cancela una inferencia activa (Python o ONNX nativo)
    pub fn cancel_inference(&self, job_id: &str) -> Result<(), String> {
        // Intentar cancelar proceso Python
        {
            let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
            if let Some(mut child) = procs.remove(job_id) {
                child.kill().map_err(|e| format!("Error cancelando: {e}"))?;
                return Ok(());
            }
        }

        // Intentar cancelar job ONNX nativo
        {
            let flags = self.cancel_flags.lock().map_err(|e| e.to_string())?;
            if let Some(flag) = flags.get(job_id) {
                flag.store(true, Ordering::Relaxed);
                return Ok(());
            }
        }

        Err("No se encontró proceso de inferencia activo".to_string())
    }
}

/// Maneja eventos del script Python de inferencia
fn handle_python_event(
    app: &AppHandle,
    job_id: &str,
    _model_id: &str,
    project_id: &str,
    event: &serde_json::Value,
) {
    let event_type = event["type"].as_str().unwrap_or("");

    match event_type {
        "result" => {
            let image_id = event["imageId"].as_str().unwrap_or("").to_string();
            let current = event["current"].as_u64().unwrap_or(0) as usize;
            let total = event["total"].as_u64().unwrap_or(0) as usize;
            let inference_time = event["inferenceTimeMs"].as_f64().unwrap_or(0.0);

            let ai_annotations: Vec<AnnotationEntry> = event["predictions"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| {
                            let class_name = p["className"].as_str()?.to_string();
                            let confidence = p["confidence"].as_f64()?;

                            // Buscar clase del proyecto por nombre
                            let project_class_id = {
                                use tauri::Manager;
                                let state = app.state::<AppState>();
                                state.with_project(project_id, |pf| {
                                    pf.classes.iter()
                                        .find(|c| c.name.eq_ignore_ascii_case(&class_name))
                                        .map(|c| c.id)
                                }).ok().flatten()
                            };

                            let class_id = project_class_id?;

                            Some(AnnotationEntry {
                                id: uuid::Uuid::new_v4().to_string(),
                                annotation_type: super::infer_annotation_type(&p["data"]),
                                class_id,
                                data: p["data"].clone(),
                                source: "ai".to_string(),
                                confidence: Some(confidence),
                                model_class_name: Some(class_name),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            let pred_count = ai_annotations.len();
            save_ai_annotations(app, project_id, &image_id, ai_annotations);

            let _ = app.emit(
                "inference:progress",
                &InferenceProgressEvent {
                    job_id: job_id.to_string(),
                    current,
                    total,
                    image_id: image_id.clone(),
                    predictions_count: pred_count,
                },
            );

            let _ = app.emit(
                "inference:result",
                serde_json::json!({
                    "jobId": job_id,
                    "imageId": image_id,
                    "predictionsCount": pred_count,
                    "inferenceTimeMs": inference_time,
                    "current": current,
                    "total": total,
                }),
            );
        }
        "error" => {
            let _ = app.emit(
                "inference:error",
                serde_json::json!({
                    "jobId": job_id,
                    "imageId": event["imageId"].as_str().unwrap_or(""),
                    "error": event["error"].as_str().unwrap_or("Error desconocido"),
                }),
            );
        }
        "completed" => {
            let _ = app.emit(
                "inference:completed",
                serde_json::json!({ "jobId": job_id }),
            );
        }
        _ => {}
    }
}

/// Resuelve el class_id del proyecto para una detección.
///
/// Estrategia (en orden de prioridad):
/// 1. Mapping manual del usuario en `class_mapping` (máxima prioridad).
/// 2. Match exacto por nombre (case-insensitive) con clases del proyecto.
/// 3. Single-class fallback: solo si modelo y proyecto tienen exactamente 1 clase.
/// 4. Auto-crear clase en el proyecto y persistir mapping en el modelo.
fn resolve_project_class(
    app: &AppHandle,
    project_id: &str,
    model_class_name: &str,
    model_class_id: usize,
    model_id: &str,
) -> Option<i64> {
    use tauri::Manager;
    let state = app.state::<AppState>();

    // Intento rápido read-only: 1, 2, 3.
    let fast = state.with_project(project_id, |pf| {
        let model = pf.inference_models.iter().find(|m| m.id == model_id);

        if let Some(model) = model {
            if let Some(mapping) = model.class_mapping.iter().find(|m| m.model_class_id == model_class_id) {
                if let Some(ref pid) = mapping.project_class_id {
                    if let Ok(id) = pid.parse::<i64>() {
                        if pf.classes.iter().any(|c| c.id == id) {
                            return Some(id);
                        }
                    }
                }
            }
        }

        if !model_class_name.is_empty() {
            if let Some(cls) = pf.classes.iter().find(|c| c.name.eq_ignore_ascii_case(model_class_name)) {
                return Some(cls.id);
            }
        }

        let model_single = model.map(|m| m.class_names.len() == 1).unwrap_or(false);
        if model_single && pf.classes.len() == 1 {
            return Some(pf.classes[0].id);
        }

        None
    }).ok().flatten();

    if let Some(id) = fast {
        return Some(id);
    }

    // Fallback: auto-crear clase en proyecto + persistir mapping en modelo.
    state.with_project_mut_ret(project_id, |pf| {
        // Re-check por carrera (otro frame puede haberla creado)
        if !model_class_name.is_empty() {
            if let Some(cls) = pf.classes.iter().find(|c| c.name.eq_ignore_ascii_case(model_class_name)) {
                let id = cls.id;
                persist_mapping(pf, model_id, model_class_id, model_class_name, id);
                return id;
            }
        }

        let name = if model_class_name.is_empty() {
            format!("class_{}", model_class_id)
        } else {
            model_class_name.to_string()
        };
        let new_id = pf.classes.len() as i64;
        let color = crate::import::generate_color(new_id as usize);
        pf.classes.push(crate::store::project_file::ClassDef {
            id: new_id,
            name: name.clone(),
            color,
            description: Some(format!("Auto-creada desde modelo {}", model_id)),
        });
        persist_mapping(pf, model_id, model_class_id, &name, new_id);
        log::info!(
            "[Inference] Auto-creada clase '{}' (id={}) desde modelo {} (model_class_id={})",
            name, new_id, model_id, model_class_id
        );
        new_id
    }).ok()
}

fn persist_mapping(
    pf: &mut crate::store::project_file::ProjectFile,
    model_id: &str,
    model_class_id: usize,
    model_class_name: &str,
    project_class_id: i64,
) {
    use crate::store::project_file::ClassMapping;
    if let Some(m) = pf.inference_models.iter_mut().find(|m| m.id == model_id) {
        while m.class_names.len() <= model_class_id {
            m.class_names.push(format!("class_{}", m.class_names.len()));
        }
        if !model_class_name.is_empty() {
            m.class_names[model_class_id] = model_class_name.to_string();
        }
        let pid_str = project_class_id.to_string();
        let resolved_name = m.class_names[model_class_id].clone();
        if let Some(existing) = m.class_mapping.iter_mut().find(|x| x.model_class_id == model_class_id) {
            existing.model_class_name = resolved_name;
            existing.project_class_id = Some(pid_str);
        } else {
            m.class_mapping.push(ClassMapping {
                model_class_id,
                model_class_name: resolved_name,
                project_class_id: Some(pid_str),
            });
        }
    }
}

/// Convierte detecciones ONNX a AnnotationEntry, determinando el tipo según los campos.
/// Las coordenadas se denormalizan de (0..1) a píxeles absolutos para compatibilidad
/// con el sistema de anotaciones del canvas.
fn detections_to_annotations(
    detections: &[super::ort_runner::Detection],
    class_names: &[String],
    app: &AppHandle,
    project_id: &str,
    model_id: &str,
    img_dims: Option<(u32, u32)>,
) -> Vec<AnnotationEntry> {
    let (img_w, img_h) = img_dims
        .map(|(w, h)| (w as f64, h as f64))
        .unwrap_or((1.0, 1.0)); // fallback: mantener normalizado

    let mut mapped = 0usize;
    let mut unmapped = 0usize;

    let result: Vec<AnnotationEntry> = detections
        .iter()
        .filter_map(|det| {
            let class_name = class_names
                .get(det.class_id)
                .cloned()
                .unwrap_or_else(|| det.class_id.to_string());

            let class_id = match resolve_project_class(
                app, project_id, &class_name, det.class_id, model_id,
            ) {
                Some(id) => {
                    mapped += 1;
                    id
                }
                None => {
                    unmapped += 1;
                    return None;
                }
            };

            // Denormalizar coordenadas a píxeles absolutos
            let px = det.x * img_w;
            let py = det.y * img_h;
            let pw = det.width * img_w;
            let ph = det.height * img_h;

            let mut data = serde_json::json!({
                "x": px,
                "y": py,
                "width": pw,
                "height": ph,
            });

            let annotation_type;

            if let Some(ref polygon) = det.polygon {
                annotation_type = "polygon".to_string();
                let points: Vec<serde_json::Value> = polygon
                    .iter()
                    .map(|(pt_x, pt_y)| serde_json::json!({"x": pt_x * img_w, "y": pt_y * img_h}))
                    .collect();
                data["points"] = serde_json::Value::Array(points);
            } else if let Some(angle) = det.angle {
                annotation_type = "obb".to_string();
                data["angle"] = serde_json::json!(angle);
            } else if let Some(ref keypoints) = det.keypoints {
                annotation_type = "keypoints".to_string();
                let kpts: Vec<serde_json::Value> = keypoints
                    .iter()
                    .map(|kp| serde_json::json!({
                        "x": kp.x * img_w,
                        "y": kp.y * img_h,
                        "confidence": kp.confidence,
                    }))
                    .collect();
                data["keypoints"] = serde_json::Value::Array(kpts);
            } else {
                annotation_type = "bbox".to_string();
            }

            Some(AnnotationEntry {
                id: uuid::Uuid::new_v4().to_string(),
                annotation_type,
                class_id,
                data,
                source: "ai".to_string(),
                confidence: Some(det.confidence),
                model_class_name: Some(class_name),
            })
        })
        .collect();

    if unmapped > 0 {
        log::warn!(
            "[Inference] {} detecciones mapeadas, {} descartadas (error al auto-crear clase)",
            mapped, unmapped
        );
    } else {
        log::info!("[Inference] {} detecciones mapeadas a clases del proyecto", mapped);
    }

    result
}

/// Convierte clasificaciones ONNX a AnnotationEntry
fn classifications_to_annotations(
    classifications: &[super::ort_runner::Classification],
    class_names: &[String],
    app: &AppHandle,
    project_id: &str,
    model_id: &str,
) -> Vec<AnnotationEntry> {
    let top = match classifications.first() {
        Some(c) => c,
        None => return vec![],
    };

    let class_name = class_names
        .get(top.class_id)
        .cloned()
        .unwrap_or_else(|| top.class_id.to_string());

    let class_id = resolve_project_class(
        app, project_id, &class_name, top.class_id, model_id,
    );

    match class_id {
        Some(id) => vec![AnnotationEntry {
            id: uuid::Uuid::new_v4().to_string(),
            annotation_type: "bbox".to_string(),
            class_id: id,
            data: serde_json::json!({
                "x": 0.0,
                "y": 0.0,
                "width": 1.0,
                "height": 1.0,
            }),
            source: "ai".to_string(),
            confidence: Some(top.confidence),
            model_class_name: Some(class_name),
        }],
        None => {
            log::warn!("[Inference] Clasificación descartada: proyecto sin clases definidas");
            vec![]
        }
    }
}

/// Borra anotaciones AI previas de la imagen y agrega las nuevas
fn save_ai_annotations(
    app: &AppHandle,
    project_id: &str,
    image_id: &str,
    annotations: Vec<AnnotationEntry>,
) {
    use tauri::Manager;
    let state = app.state::<AppState>();
    let _ = state.with_project_mut(project_id, |pf| {
        if let Some(img) = pf.images.iter_mut().find(|i| i.id == image_id) {
            // Eliminar anotaciones AI previas
            img.annotations.retain(|a| a.source != "ai");
            // Agregar nuevas
            img.annotations.extend(annotations);
            // Actualizar status
            if !img.annotations.is_empty() {
                img.status = "annotated".to_string();
            }
        }
    });
    // Notificar al frontend que las anotaciones cambiaron
    let _ = app.emit("db:images-changed", project_id);
}
