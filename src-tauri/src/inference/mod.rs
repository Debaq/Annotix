pub mod ort_runner;
pub mod runner;
pub mod scripts;

use serde::{Deserialize, Serialize};

/// Configuración para ejecutar inferencia
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceConfig {
    /// Umbral de confianza mínima (0.0 - 1.0)
    pub confidence_threshold: f64,
    /// Tamaño de entrada del modelo (override)
    pub input_size: Option<u32>,
    /// Dispositivo: "cpu", "0", "cuda:0", "mps"
    pub device: String,
    /// Modo IOU threshold para NMS
    #[serde(default = "default_iou_threshold")]
    pub iou_threshold: f64,
}

fn default_iou_threshold() -> f64 {
    0.45
}

/// Evento de progreso de inferencia
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceProgressEvent {
    pub job_id: String,
    pub current: usize,
    pub total: usize,
    pub image_id: String,
    pub predictions_count: usize,
}

/// Infiere el tipo de anotación basado en la estructura de data
pub fn infer_annotation_type(data: &serde_json::Value) -> String {
    if data.get("points").is_some() {
        "polygon".to_string()
    } else if data.get("angle").is_some() {
        "obb".to_string()
    } else {
        "bbox".to_string()
    }
}

