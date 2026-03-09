use std::process::{Command, Stdio};

use tauri::{AppHandle, State};

use crate::inference::runner::InferenceProcessManager;
use crate::inference::InferenceConfig;
use crate::store::project_file::{ClassMapping, InferenceModelEntry, PredictionEntry};
use crate::store::AppState;
use crate::training;

// ─── Gestión de modelos ──────────────────────────────────────────────────────

#[tauri::command]
pub fn upload_inference_model(
    state: State<'_, AppState>,
    project_id: String,
    source_path: String,
    name: String,
    format: String,
    task: String,
    class_names: Vec<String>,
    input_size: Option<u32>,
) -> Result<InferenceModelEntry, String> {
    state.upload_inference_model(
        &project_id,
        &source_path,
        &name,
        &format,
        &task,
        class_names,
        input_size,
    )
}

#[tauri::command]
pub fn delete_inference_model(
    state: State<'_, AppState>,
    project_id: String,
    model_id: String,
) -> Result<(), String> {
    state.delete_inference_model(&project_id, &model_id)
}

#[tauri::command]
pub fn list_inference_models(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<InferenceModelEntry>, String> {
    state.list_inference_models(&project_id)
}

#[tauri::command]
pub fn update_model_config(
    state: State<'_, AppState>,
    project_id: String,
    model_id: String,
    class_mapping: Vec<ClassMapping>,
    input_size: Option<u32>,
    task: Option<String>,
) -> Result<(), String> {
    state.update_model_config(&project_id, &model_id, class_mapping, input_size, task)
}

// ─── Detección de metadatos ──────────────────────────────────────────────────

#[tauri::command]
pub fn detect_model_metadata(
    model_path: String,
) -> Result<serde_json::Value, String> {
    let python = training::python_env::venv_python()?;
    if !python.exists() {
        return Err("Entorno Python no configurado".to_string());
    }

    let script = crate::inference::scripts::generate_detect_metadata_script(&model_path);

    // Escribir script temporal
    let tmp_dir = tempfile::tempdir()
        .map_err(|e| format!("Error creando directorio temporal: {}", e))?;
    let script_path = tmp_dir.path().join("detect_meta.py");
    std::fs::write(&script_path, &script)
        .map_err(|e| format!("Error escribiendo script: {}", e))?;

    let mut cmd = Command::new(&python);
    cmd.args(["-u", &script_path.to_string_lossy()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    training::hide_console_window(&mut cmd);

    let output = cmd
        .output()
        .map_err(|e| format!("Error ejecutando detección de metadatos: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Buscar ANNOTIX_EVENT en la salida
    for line in stdout.lines() {
        if let Some(json_str) = line.strip_prefix("ANNOTIX_EVENT:") {
            return serde_json::from_str(json_str)
                .map_err(|e| format!("Error parseando metadatos: {}", e));
        }
    }

    Err("No se pudieron detectar metadatos del modelo".to_string())
}

#[tauri::command]
pub fn parse_class_names(
    file_path: String,
    format: String,
) -> Result<Vec<String>, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;

    match format.as_str() {
        "txt" => {
            // Una clase por línea
            Ok(content
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect())
        }
        "yaml" | "yml" => {
            // Formato YOLO data.yaml con 'names: [...]' o 'names:\n  0: clase1\n  ...'
            let mut names = Vec::new();

            // Intentar parsear YAML simple
            let mut in_names = false;
            for line in content.lines() {
                let trimmed = line.trim();

                if trimmed.starts_with("names:") {
                    let after = trimmed.strip_prefix("names:").unwrap().trim();
                    if after.starts_with('[') {
                        // Formato inline: names: ['a', 'b', 'c']
                        let inner = after
                            .trim_start_matches('[')
                            .trim_end_matches(']');
                        for name in inner.split(',') {
                            let clean = name.trim().trim_matches('\'').trim_matches('"');
                            if !clean.is_empty() {
                                names.push(clean.to_string());
                            }
                        }
                        break;
                    }
                    in_names = true;
                    continue;
                }

                if in_names {
                    if !line.starts_with(' ') && !line.starts_with('\t') {
                        break; // Fin de la sección names
                    }
                    // Formato: '  0: nombre' o '  - nombre'
                    if let Some(name) = trimmed.strip_prefix("- ") {
                        names.push(name.trim_matches('\'').trim_matches('"').to_string());
                    } else if let Some((_idx, name)) = trimmed.split_once(':') {
                        let clean = name.trim().trim_matches('\'').trim_matches('"');
                        if !clean.is_empty() {
                            names.push(clean.to_string());
                        }
                    }
                }
            }

            Ok(names)
        }
        _ => Err(format!("Formato no soportado: {}", format)),
    }
}

// ─── Ejecución de inferencia ─────────────────────────────────────────────────

#[tauri::command]
pub fn start_batch_inference(
    app: AppHandle,
    state: State<'_, AppState>,
    inference_mgr: State<'_, InferenceProcessManager>,
    project_id: String,
    model_id: String,
    image_ids: Vec<String>,
    config: InferenceConfig,
) -> Result<String, String> {
    inference_mgr.start_inference(&state, &app, &project_id, &model_id, &image_ids, config)
}

#[tauri::command]
pub fn cancel_inference(
    inference_mgr: State<'_, InferenceProcessManager>,
    job_id: String,
) -> Result<(), String> {
    inference_mgr.cancel_inference(&job_id)
}

#[tauri::command]
pub fn run_single_inference(
    app: AppHandle,
    state: State<'_, AppState>,
    inference_mgr: State<'_, InferenceProcessManager>,
    project_id: String,
    model_id: String,
    image_id: String,
    config: InferenceConfig,
) -> Result<String, String> {
    inference_mgr.start_inference(
        &state,
        &app,
        &project_id,
        &model_id,
        &[image_id],
        config,
    )
}

// ─── Gestión de predicciones ─────────────────────────────────────────────────

#[tauri::command]
pub fn get_predictions(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> Result<Vec<PredictionEntry>, String> {
    state.with_project(&project_id, |pf| {
        pf.images
            .iter()
            .find(|i| i.id == image_id)
            .map(|i| i.predictions.clone())
            .unwrap_or_default()
    })
}

#[tauri::command]
pub fn clear_predictions(
    state: State<'_, AppState>,
    project_id: String,
    image_id: Option<String>,
) -> Result<(), String> {
    state.clear_predictions(&project_id, image_id.as_deref())
}

#[tauri::command]
pub fn accept_prediction(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
    prediction_id: String,
) -> Result<(), String> {
    state.accept_prediction(&project_id, &image_id, &prediction_id)
}

#[tauri::command]
pub fn reject_prediction(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
    prediction_id: String,
) -> Result<(), String> {
    state.reject_prediction(&project_id, &image_id, &prediction_id)
}

#[tauri::command]
pub fn convert_predictions(
    state: State<'_, AppState>,
    project_id: String,
    image_id: String,
) -> Result<usize, String> {
    // Obtener mapeo del primer modelo que tenga predicciones
    let class_mapping = state.with_project(&project_id, |pf| {
        // Buscar el model_id de la primera predicción
        let model_id = pf
            .images
            .iter()
            .find(|i| i.id == image_id)
            .and_then(|img| img.predictions.first())
            .map(|p| p.model_id.clone());

        match model_id {
            Some(mid) => pf
                .inference_models
                .iter()
                .find(|m| m.id == mid)
                .map(|m| m.class_mapping.clone())
                .unwrap_or_default(),
            None => vec![],
        }
    })?;

    state.convert_predictions_to_annotations(&project_id, &image_id, &class_mapping)
}
