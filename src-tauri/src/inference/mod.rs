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

fn default_clip_limit() -> f64 {
    2.0
}
fn default_tile_grid() -> u32 {
    8
}
fn default_channel() -> String {
    "l_lab".to_string()
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

/// Acumulador de latencias por trabajo de inferencia, para el evento
/// `infer.run` del modo estudio (sección 3.8). Vive aquí y no en el runner
/// porque lo alimentan tanto la ruta ONNX nativa como la de Python.
pub struct StudyLatencies {
    backend: &'static str,
    model_path: std::path::PathBuf,
    samples: Vec<f64>,
}

impl StudyLatencies {
    pub fn new(backend: &'static str, model_path: impl Into<std::path::PathBuf>) -> Self {
        Self {
            backend,
            model_path: model_path.into(),
            samples: Vec::new(),
        }
    }

    pub fn push(&mut self, latency_ms: f64) {
        if crate::study::is_active() {
            self.samples.push(latency_ms);
        }
    }

    /// Percentil por rango más cercano: el menor valor que deja al menos un
    /// `p` de la muestra por debajo. Es el mismo criterio que usa
    /// `tools/study_analysis/analyze.py`.
    fn percentile(sorted: &[f64], p: f64) -> f64 {
        if sorted.is_empty() {
            return 0.0;
        }
        let rank = (p * sorted.len() as f64).ceil() as usize;
        sorted[rank.max(1) - 1]
    }

    /// Emite `infer.run` con los percentiles del trabajo completo.
    pub fn finish(mut self) {
        if self.samples.is_empty() {
            return;
        }
        self.samples.sort_by(|a, b| a.total_cmp(b));
        let model_hash = crate::study::verify::file_hash(&self.model_path).unwrap_or_default();
        crate::study::emit_quiet(
            crate::study::events::INFER_RUN,
            serde_json::json!({
                "backend": self.backend,
                "model_hash": model_hash,
                "n_items": self.samples.len(),
                "latency_ms_p50": Self::percentile(&self.samples, 0.50).round() as u64,
                "latency_ms_p95": Self::percentile(&self.samples, 0.95).round() as u64,
            }),
        );
    }
}

#[cfg(test)]
mod study_latency_tests {
    use super::StudyLatencies;

    #[test]
    fn percentiles_sobre_una_muestra_conocida() {
        let sorted: Vec<f64> = (1..=100).map(|v| v as f64).collect();
        assert_eq!(StudyLatencies::percentile(&sorted, 0.50), 50.0);
        assert_eq!(StudyLatencies::percentile(&sorted, 0.95), 95.0);
        assert_eq!(StudyLatencies::percentile(&[], 0.5), 0.0);
        assert_eq!(StudyLatencies::percentile(&[7.0], 0.95), 7.0);
    }
}
