pub mod format_detector;
pub mod yolo;
pub mod coco;
pub mod pascal_voc;
pub mod csv_import;
pub mod unet_masks;
pub mod folders_by_class;
pub mod tix;

use serde::{Deserialize, Serialize};
use crate::store::project_file::{ClassDef, AnnotationEntry};
use crate::store::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionResult {
    pub format: String,
    pub project_type: String,
    pub confidence: f64,
    pub class_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStats {
    pub images_count: usize,
    pub classes_count: usize,
    pub annotations_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub project_id: String,
    pub stats: ImportStats,
}

/// Resultado interno de un importador: clases + datos de imágenes.
pub struct ImportData {
    pub classes: Vec<ClassDef>,
    pub images: Vec<ImageImportData>,
}

pub struct ImageImportData {
    pub name: String,
    pub data: Vec<u8>,
    #[allow(dead_code)]
    pub width: u32,
    #[allow(dead_code)]
    pub height: u32,
    pub annotations: Vec<AnnotationEntry>,
}

/// Colores por defecto para clases
const DEFAULT_COLORS: &[&str] = &[
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
    "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B88B", "#82E0AA",
];

pub fn generate_color(index: usize) -> String {
    DEFAULT_COLORS[index % DEFAULT_COLORS.len()].to_string()
}

pub fn create_class(id: i64, name: &str, color: Option<&str>) -> ClassDef {
    ClassDef {
        id,
        name: name.to_string(),
        color: color.map(|c| c.to_string()).unwrap_or_else(|| generate_color(id as usize)),
    }
}

pub fn create_annotation(class_id: i64, ann_type: &str, data: serde_json::Value) -> AnnotationEntry {
    AnnotationEntry {
        id: uuid::Uuid::new_v4().to_string(),
        annotation_type: ann_type.to_string(),
        class_id,
        data,
        source: "user".to_string(),
        confidence: None,
        model_class_name: None,
    }
}

/// Detectar formato de un archivo ZIP.
pub fn detect_format(file_path: &str) -> Result<DetectionResult, String> {
    let file = std::fs::File::open(file_path)
        .map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Error leyendo ZIP: {}", e))?;

    format_detector::detect(&mut archive)
}

/// Importar un dataset completo desde un archivo ZIP.
pub fn import_dataset(
    state: &AppState,
    file_path: &str,
    project_name: &str,
    app_handle: &tauri::AppHandle,
) -> Result<ImportResult, String> {
    use tauri::Emitter;

    let emit_progress = |progress: f64| {
        let _ = app_handle.emit("import:progress", progress);
    };

    // Detectar formato
    emit_progress(5.0);
    let detection = detect_format(file_path)?;

    // Abrir ZIP
    emit_progress(15.0);
    let file = std::fs::File::open(file_path)
        .map_err(|e| format!("Error abriendo archivo: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Error leyendo ZIP: {}", e))?;

    // Importar datos según formato
    emit_progress(25.0);
    let import_data = match detection.format.as_str() {
        "yolo-detection" | "yolo-segmentation" => {
            let is_seg = detection.format == "yolo-segmentation";
            yolo::import_data(&mut archive, &detection.project_type, is_seg)?
        }
        "coco" => coco::import_data(&mut archive, &detection.project_type)?,
        "pascal-voc" => pascal_voc::import_data(&mut archive)?,
        "csv-detection" | "csv-classification" | "csv-keypoints" | "csv-landmarks" => {
            let csv_type = detection.format.strip_prefix("csv-").unwrap_or("detection");
            csv_import::import_data(&mut archive, csv_type)?
        }
        "unet-masks" => unet_masks::import_data(&mut archive)?,
        "folders-by-class" => folders_by_class::import_data(&mut archive)?,
        "tix" => tix::import_data(&mut archive, &detection.project_type)?,
        _ => return Err(format!("Formato no soportado: {}", detection.format)),
    };

    if import_data.classes.is_empty() {
        return Err("No se encontraron clases en el dataset".to_string());
    }
    if import_data.images.is_empty() {
        return Err("No se encontraron imágenes en el dataset".to_string());
    }

    // Crear proyecto usando AppState
    emit_progress(50.0);
    let project_id = state.create_project(
        project_name,
        &detection.project_type,
        &import_data.classes,
    )?;

    // Guardar imágenes
    let total = import_data.images.len() as f64;
    let mut total_annotations = 0;

    for (i, img) in import_data.images.iter().enumerate() {
        total_annotations += img.annotations.len();

        // Guardar imagen usando upload_image_bytes de AppState
        state.upload_image_bytes(
            &project_id,
            &img.name,
            &img.data,
            &img.annotations,
            None, // video_id
            None, // frame_index
        )?;

        emit_progress(50.0 + ((i + 1) as f64 / total) * 45.0);
    }

    emit_progress(100.0);

    Ok(ImportResult {
        project_id,
        stats: ImportStats {
            images_count: import_data.images.len(),
            classes_count: import_data.classes.len(),
            annotations_count: total_annotations,
        },
    })
}
