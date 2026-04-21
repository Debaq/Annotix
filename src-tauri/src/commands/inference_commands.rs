use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
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
    output_format: Option<String>,
    metadata: Option<serde_json::Value>,
) -> Result<InferenceModelEntry, String> {
    state.upload_inference_model(
        &project_id,
        &source_path,
        &name,
        &format,
        &task,
        class_names,
        input_size,
        output_format,
        metadata,
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
    output_format: Option<String>,
    class_names: Option<Vec<String>>,
    metadata_patch: Option<serde_json::Value>,
) -> Result<(), String> {
    state.update_model_config(&project_id, &model_id, class_mapping, input_size, task, output_format, class_names, metadata_patch)
}

// ─── Detección de metadatos ──────────────────────────────────────────────────

#[tauri::command]
pub fn detect_model_metadata(
    model_path: String,
) -> Result<serde_json::Value, String> {
    // Para .onnx: inspección nativa con ort (metadata + shape). Si arroja algo útil,
    // retornar sin invocar Python.
    let is_onnx = model_path.to_lowercase().ends_with(".onnx");
    if is_onnx {
        if let Ok(insp) = crate::inference::ort_runner::inspect_onnx(&model_path) {
            let names: Vec<String> = match (&insp.class_names, insp.num_classes) {
                (Some(names), _) if !names.is_empty() => names.clone(),
                (_, Some(nc)) if nc > 0 => (0..nc).map(|i| format!("class_{}", i)).collect(),
                _ => Vec::new(),
            };
            if !names.is_empty() {
                log::info!(
                    "[ORT] Inspección nativa: {} clases, input_size={:?}, format={:?}",
                    names.len(), insp.input_size, insp.output_format
                );
                return Ok(serde_json::json!({
                    "task": "detect",
                    "classNames": names,
                    "inputSize": insp.input_size,
                    "outputFormat": insp.output_format,
                }));
            }
        }
    }

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

/// Parsea nombres de clases desde archivos .txt, .yaml o .json
#[tauri::command]
pub fn parse_class_names(
    file_path: String,
    format: String,
) -> Result<Vec<String>, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;

    match format.as_str() {
        "txt" => {
            Ok(content
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect())
        }
        "json" => {
            // Extraer nombres de clases del JSON rico
            let parsed = parse_model_config_json_internal(&content)?;
            Ok(parsed.class_names)
        }
        "yaml" | "yml" => {
            let mut names = Vec::new();
            let mut in_names = false;
            for line in content.lines() {
                let trimmed = line.trim();

                if trimmed.starts_with("names:") {
                    let after = trimmed.strip_prefix("names:").unwrap().trim();
                    if after.starts_with('[') {
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
                        break;
                    }
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

/// Resultado del parseo de un JSON de configuración de modelo
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfigResult {
    pub class_names: Vec<String>,
    pub display_names: Vec<String>,
    pub task: Option<String>,
    pub input_size: Option<u32>,
    /// Hint de formato ONNX: "yolov5", "yolov8", "yolov10", "classification"
    pub output_format: Option<String>,
    /// Colores por technical_name: { "hemorrhage": "#ef4444", ... }
    pub colors: std::collections::HashMap<String, String>,
    /// Clases marcadas como currently_detected
    pub detected_classes: Vec<usize>,
    /// Categorías por clase: { "hemorrhage": "lesion", ... }
    pub categories: std::collections::HashMap<String, String>,
    /// Metadata completa del JSON original
    pub raw_metadata: serde_json::Value,
}

/// Parsea internamente el JSON de configuración de modelo
fn parse_model_config_json_internal(content: &str) -> Result<ModelConfigResult, String> {
    let json: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;

    // Extraer clases
    let classes = json.get("classes")
        .and_then(|c| c.as_array())
        .ok_or("El JSON no contiene un array 'classes'")?;

    let mut class_names = Vec::new();
    let mut display_names = Vec::new();
    let mut detected_classes = Vec::new();
    let mut categories = std::collections::HashMap::new();

    for cls in classes {
        let tech_name = cls.get("technical_name")
            .and_then(|n| n.as_str())
            .unwrap_or("unknown")
            .to_string();

        // Intentar display_name_es, luego display_name_en, luego technical_name
        let display = cls.get("display_name_es")
            .or_else(|| cls.get("display_name_en"))
            .and_then(|n| n.as_str())
            .unwrap_or(&tech_name)
            .to_string();

        let index = cls.get("index")
            .and_then(|i| i.as_u64())
            .unwrap_or(class_names.len() as u64) as usize;

        let detected = cls.get("currently_detected")
            .and_then(|d| d.as_bool())
            .unwrap_or(true);

        if detected {
            detected_classes.push(index);
        }

        if let Some(cat) = cls.get("category").and_then(|c| c.as_str()) {
            categories.insert(tech_name.clone(), cat.to_string());
        }

        class_names.push(tech_name);
        display_names.push(display);
    }

    // Extraer colores
    let colors: std::collections::HashMap<String, String> = json.get("color_palette")
        .and_then(|p| serde_json::from_value(p.clone()).ok())
        .unwrap_or_default();

    // Extraer task desde model_info.type
    let task = json.get("model_info")
        .and_then(|mi| mi.get("type"))
        .and_then(|t| t.as_str())
        .map(|t| {
            let lower = t.to_lowercase();
            if lower.contains("detect") { "detect".to_string() }
            else if lower.contains("segment") { "segment".to_string() }
            else if lower.contains("classif") { "classify".to_string() }
            else if lower.contains("pose") { "pose".to_string() }
            else if lower.contains("obb") { "obb".to_string() }
            else { "detect".to_string() }
        });

    // Extraer input_size desde model_info.input_size
    let input_size = json.get("model_info")
        .and_then(|mi| mi.get("input_size"))
        .and_then(|is| {
            if let Some(arr) = is.as_array() {
                arr.first().and_then(|v| v.as_u64()).map(|v| v as u32)
            } else {
                is.as_u64().map(|v| v as u32)
            }
        });

    // Extraer output_format desde model_info.output_format
    let output_format = json.get("model_info")
        .and_then(|mi| mi.get("output_format"))
        .and_then(|f| f.as_str())
        .map(|s| s.to_string());

    Ok(ModelConfigResult {
        class_names,
        display_names,
        task,
        input_size,
        output_format,
        colors,
        detected_classes,
        categories,
        raw_metadata: json,
    })
}

/// Parsea un JSON de configuración de modelo y devuelve toda la metadata rica
#[tauri::command]
pub fn parse_model_config(
    file_path: String,
) -> Result<ModelConfigResult, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Error leyendo archivo: {}", e))?;
    parse_model_config_json_internal(&content)
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
