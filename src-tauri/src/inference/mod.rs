pub mod ort_runner;
pub mod runner;
pub mod sam;
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
    /// Preprocesamiento opcional (CLAHE / fundus crop). Si None, sin preproc.
    #[serde(default)]
    pub preprocess: Option<PreprocessConfig>,
}

fn default_iou_threshold() -> f64 {
    0.45
}

/// Configuración de preprocesamiento aplicado antes de la inferencia.
/// Debe coincidir con el preproc del entrenamiento para no degradar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessConfig {
    /// Aplicar CLAHE
    #[serde(default)]
    pub clahe: bool,
    /// clipLimit de cv2.createCLAHE (def 2.0)
    #[serde(default = "default_clip_limit")]
    pub clip_limit: f64,
    /// tileGridSize (cuadrada). Def 8
    #[serde(default = "default_tile_grid")]
    pub tile_grid: u32,
    /// Canal sobre el que aplicar CLAHE: "l_lab" | "all_bgr" | "gray"
    #[serde(default = "default_channel")]
    pub channel: String,
    /// Recortar círculo (fundus crop) como en el notebook de entrenamiento
    #[serde(default)]
    pub fundus_crop: bool,
}

fn default_clip_limit() -> f64 { 2.0 }
fn default_tile_grid() -> u32 { 8 }
fn default_channel() -> String { "l_lab".to_string() }

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

