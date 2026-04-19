//! Segment Anything Model (SAM) — integración
//!
//! Estructura:
//! - `encoder`  — sesión ONNX encoder, devuelve embedding
//! - `decoder`  — sesión ONNX decoder, ejecuta prompts batched
//! - `preprocess`  — resize 1024 lado largo, normalización, transform coords
//! - `postprocess` — upscale bilinear + threshold logits → bitmap binario
//! - `conversion`  — bitmap → BBox / OBB / Polygon (DP simplify vía `geo`)
//! - `amg`         — Automatic Mask Generator (grilla + filtros + NMS)
//!
//! PR1: solo esqueleto y tipos. Implementación en PRs siguientes.

pub mod amg;
pub mod conversion;
pub mod decoder;
pub mod encoder;
pub mod postprocess;
pub mod preprocess;
pub mod state;

use serde::{Deserialize, Serialize};

// ─── Prompts (modo manual / refinamiento) ───────────────────────────────────

/// Un punto-prompt. `label`: 1 = positivo (incluir), 0 = negativo (excluir).
/// Coords en píxeles sobre la imagen original.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamPoint {
    pub x: f32,
    pub y: f32,
    pub label: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamPrompts {
    #[serde(default)]
    pub points: Vec<SamPoint>,
    /// `[x1, y1, x2, y2]` en píxeles sobre la imagen original.
    #[serde(default)]
    pub bbox: Option<[f32; 4]>,
    /// Si true, decoder devuelve las 3 máscaras candidatas; si false, solo la best.
    #[serde(default)]
    pub multimask_output: bool,
}

/// Resultado de `sam_predict` manual.
/// Las máscaras vienen como logits uint8 (256 lado largo) para consistencia
/// con `SamMask` de AMG. Frontend upscalea al aceptar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamPrediction {
    pub masks_lowres: Vec<Vec<u8>>,
    pub scores: Vec<f32>,
    pub best_index: usize,
    pub lowres_size: (u32, u32),
    pub orig_size: (u32, u32),
}

// ─── AMG ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AmgConfig {
    /// Grilla `N x N` de puntos-prompt. Default 16.
    pub points_per_side: u32,
    /// Umbral IoU predicho por el decoder (descarta máscaras poco confiables).
    pub pred_iou_thresh: f32,
    /// Umbral estabilidad (diferencia entre threshold alto/bajo sobre los logits).
    pub stability_score_thresh: f32,
    /// NMS sobre bboxes.
    pub box_nms_thresh: f32,
    /// Descarta máscaras con menos de N píxeles.
    pub min_mask_region_area: u32,
    /// Descarta máscaras cuyo bbox solapa > thresh con anotaciones existentes.
    pub overlap_with_existing_thresh: f32,
}

impl Default for AmgConfig {
    fn default() -> Self {
        Self {
            points_per_side: 16,
            pred_iou_thresh: 0.7,
            stability_score_thresh: 0.85,
            box_nms_thresh: 0.7,
            min_mask_region_area: 100,
            overlap_with_existing_thresh: 0.5,
        }
    }
}

/// Una máscara candidata del AMG. Efímera: nunca se persiste en project.json.
///
/// Guarda las 3 salidas multimask del decoder como logits uint8 a 256 lado
/// largo. El slider "granularidad" elige entre ellas sin re-correr el decoder.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamMask {
    pub id: String,
    /// Las 3 máscaras multimask. Cada una: `lowres_size.0 * lowres_size.1` bytes.
    /// Logits reescalados a uint8 (0..=255). Threshold de aceptación = 128 (equiv. 0.0).
    pub masks_lowres: [Vec<u8>; 3],
    pub scores: [f32; 3],
    /// BBox precalculado sobre la imagen original (best index). `[x, y, w, h]`.
    pub bbox: [f32; 4],
    pub orig_size: (u32, u32),
    pub lowres_size: (u32, u32),
    /// Hash estable del id para colorear consistentemente en el overlay.
    pub color_seed: u32,
}

// ─── Info ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamEncodeInfo {
    pub image_id: String,
    pub orig_size: (u32, u32),
    pub cached: bool,
}

/// Fase del pipeline AMG para progreso.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SamAmgPhase {
    Encoding,
    DecodingBatch,
    Filtering,
    Done,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAmgProgress {
    pub phase: SamAmgPhase,
    pub current: usize,
    pub total: usize,
    pub image_id: String,
}

/// Enum de conversión: a qué formato de anotación transformar una máscara.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MaskTarget {
    Bbox,
    Obb,
    Polygon,
    Mask,
}
