use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};

use crate::store::AppState;
use crate::store::project_file::PredictionEntry;
use super::{InferenceConfig, InferenceProgressEvent};
use super::scripts;

/// Gestor de procesos de inferencia activos
pub struct InferenceProcessManager {
    processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl InferenceProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
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
        let python = crate::training::python_env::venv_python()?;
        if !python.exists() {
            return Err("Entorno Python no configurado. Ejecuta setup primero.".to_string());
        }

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

        // Generar script según formato del modelo
        let script_content = match model_info.format.as_str() {
            "pt" => scripts::generate_pt_inference_script(
                &model_path,
                &image_paths,
                &config,
                &model_info.task,
            ),
            "onnx" => scripts::generate_onnx_inference_script(
                &model_path,
                &image_paths,
                &config,
                &model_info.class_names,
                &model_info.task,
            ),
            _ => return Err(format!("Formato de modelo no soportado: {}", model_info.format)),
        };

        // Escribir script temporal
        let script_dir = state.data_dir.join("inference").join(&job_id);
        std::fs::create_dir_all(&script_dir)
            .map_err(|e| format!("Error creando directorio de inferencia: {}", e))?;
        let script_path = script_dir.join("infer.py");
        std::fs::write(&script_path, &script_content)
            .map_err(|e| format!("Error escribiendo script de inferencia: {}", e))?;

        // Spawn proceso Python
        let mut cmd = Command::new(&python);
        cmd.args(["-u", &script_path.to_string_lossy()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        crate::training::hide_console_window(&mut cmd);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Error iniciando inferencia: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Registrar proceso
        {
            let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
            procs.insert(job_id.clone(), child);
        }

        // Thread para leer stdout y parsear eventos
        let app_clone = app.clone();
        let processes = self.processes.clone();
        let job_id_thread = job_id.clone();
        let model_id_owned = model_id.to_string();
        let project_dir = state.project_dir(project_id)?;

        std::thread::spawn(move || {
            if let Some(stdout) = stdout {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    if let Some(json_str) = line.strip_prefix("ANNOTIX_EVENT:") {
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
                            handle_inference_event(
                                &app_clone,
                                &job_id_thread,
                                &model_id_owned,
                                &project_dir,
                                &event,
                            );
                        }
                    }
                }
            }

            // Esperar a que termine el proceso
            {
                let mut procs = processes.lock().unwrap();
                if let Some(mut child) = procs.remove(&job_id_thread) {
                    let status = child.wait();
                    let success = status.map(|s| s.success()).unwrap_or(false);

                    if !success {
                        if let Some(stderr) = stderr {
                            let reader = BufReader::new(stderr);
                            let stderr_lines: Vec<String> =
                                reader.lines().map_while(Result::ok).collect();
                            let error_msg = stderr_lines.join("\n");

                            let _ = app_clone.emit(
                                "inference:error",
                                serde_json::json!({
                                    "jobId": &job_id_thread,
                                    "error": error_msg,
                                }),
                            );
                        }
                    }
                }
            }

            // Limpiar directorio temporal
            let script_dir = std::path::PathBuf::from(format!(
                "{}/inference/{}",
                directories::ProjectDirs::from("com", "tecmedhub", "annotix")
                    .map(|p| p.data_dir().to_string_lossy().to_string())
                    .unwrap_or_default(),
                &job_id_thread
            ));
            let _ = std::fs::remove_dir_all(&script_dir);
        });

        Ok(job_id)
    }

    /// Cancela una inferencia activa
    pub fn cancel_inference(&self, job_id: &str) -> Result<(), String> {
        let mut procs = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = procs.remove(job_id) {
            child
                .kill()
                .map_err(|e| format!("Error cancelando inferencia: {}", e))?;
            Ok(())
        } else {
            Err("No se encontró proceso de inferencia activo".to_string())
        }
    }

    /// Verifica si un job está ejecutándose
    pub fn is_running(&self, job_id: &str) -> bool {
        let procs = self.processes.lock().unwrap();
        procs.contains_key(job_id)
    }
}

/// Maneja eventos emitidos por el script de inferencia
fn handle_inference_event(
    app: &AppHandle,
    job_id: &str,
    model_id: &str,
    project_dir: &std::path::PathBuf,
    event: &serde_json::Value,
) {
    let event_type = event["type"].as_str().unwrap_or("");

    match event_type {
        "result" => {
            let image_id = event["imageId"].as_str().unwrap_or("").to_string();
            let current = event["current"].as_u64().unwrap_or(0) as usize;
            let total = event["total"].as_u64().unwrap_or(0) as usize;
            let inference_time = event["inferenceTimeMs"].as_f64().unwrap_or(0.0);

            // Parsear predicciones
            let predictions: Vec<PredictionEntry> = event["predictions"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| {
                            Some(PredictionEntry {
                                id: uuid::Uuid::new_v4().to_string(),
                                model_id: model_id.to_string(),
                                class_id: p["classId"].as_u64()? as usize,
                                class_name: p["className"].as_str()?.to_string(),
                                confidence: p["confidence"].as_f64()?,
                                data: p["data"].clone(),
                                status: "pending".to_string(),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            let pred_count = predictions.len();

            // Guardar predicciones en project.json
            save_predictions_to_project(project_dir, &image_id, predictions);

            // Emitir evento de progreso
            let progress = InferenceProgressEvent {
                job_id: job_id.to_string(),
                current,
                total,
                image_id: image_id.clone(),
                predictions_count: pred_count,
            };

            let _ = app.emit("inference:progress", &progress);

            // Emitir resultado individual
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
            let image_id = event["imageId"].as_str().unwrap_or("");
            let error = event["error"].as_str().unwrap_or("Error desconocido");
            let _ = app.emit(
                "inference:error",
                serde_json::json!({
                    "jobId": job_id,
                    "imageId": image_id,
                    "error": error,
                }),
            );
        }
        "completed" => {
            let _ = app.emit(
                "inference:completed",
                serde_json::json!({
                    "jobId": job_id,
                }),
            );
        }
        _ => {}
    }
}

/// Guarda predicciones directamente en project.json (para uso desde threads)
fn save_predictions_to_project(
    project_dir: &std::path::PathBuf,
    image_id: &str,
    predictions: Vec<PredictionEntry>,
) {
    if let Ok(mut pf) = crate::store::io::read_project(project_dir) {
        if let Some(img) = pf.images.iter_mut().find(|i| i.id == image_id) {
            // Agregar predicciones (no reemplazar, acumular)
            img.predictions.extend(predictions);
        }
        let _ = crate::store::io::write_project(project_dir, &pf);
    }
}
