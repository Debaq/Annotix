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

/// Resultado de inferencia por imagen
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceImageResult {
    pub image_id: String,
    pub predictions: Vec<InferencePrediction>,
    pub inference_time_ms: f64,
}

/// Predicción individual del modelo
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferencePrediction {
    pub class_id: usize,
    pub class_name: String,
    pub confidence: f64,
    pub data: serde_json::Value,
}
