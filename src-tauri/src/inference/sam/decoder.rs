//! Decoder ONNX de SAM.
//!
//! Expone dos funciones:
//! - `load_decoder` — carga sesión ONNX
//! - `run_decoder`  — ejecuta el decoder con prompts y devuelve `(masks, shape, ious)`
//!
//! Inputs esperados (nombres estándar del export oficial de SAM / MobileSAM):
//!   image_embeddings  [1, 256, 64, 64]    f32
//!   point_coords      [1, N, 2]           f32   (coords en SAM input space 0..1024)
//!   point_labels      [1, N]              f32   (1=pos, 0=neg, 2/3=bbox TL/BR, -1=padding)
//!   mask_input        [1, 1, 256, 256]    f32   (ceros si no hay máscara previa)
//!   has_mask_input    [1]                 f32   (0.0 si no hay máscara previa)
//!   orig_im_size      [2]                 f32   ([h, w] originales)
//!
//! Outputs:
//!   masks     [1, M, H, W]   f32   (logits, upscaladas a `orig_im_size`)
//!   scores    [1, M]         f32   (IoU predicho por máscara)
//!   — donde `M` ∈ {1, 3} según el export. Asumimos que output 4D = masks,
//!     output ≤ 2D = scores (no dependemos de nombres para ser compatibles con
//!     MobileSAM, SAM ViT y SAM2).

use ort::session::Session;
use ort::value::Tensor;

/// Shape fija del embedding para SAM ViT-B/L/H y MobileSAM.
pub const EMBEDDING_SHAPE: [i64; 4] = [1, 256, 64, 64];
pub const EMBEDDING_LEN: usize = 256 * 64 * 64;

/// Shape del `mask_input` (entrada opcional; en v1 siempre ceros).
const MASK_INPUT_H: i64 = 256;
const MASK_INPUT_W: i64 = 256;

pub fn load_decoder(model_path: &str) -> Result<Session, String> {
    crate::inference::ort_runner::new_configured_builder()?
        .commit_from_file(model_path)
        .map_err(|e| format!("Error cargando decoder ONNX: {e}"))
}

/// Salida del decoder. `mask_shape = [B, M, H, W]`.
pub struct DecoderRun {
    pub masks: Vec<f32>,
    pub mask_shape: [usize; 4],
    pub scores: Vec<f32>,
}

/// Ejecuta el decoder con `N` puntos-prompt (y/o bbox codificada como 2 puntos
/// con labels 2/3). Batch fijo a 1: llamar varias veces para múltiples grupos
/// de prompts independientes.
///
/// - `point_coords`: `[N, 2]` en coords **SAM input space** (`0..1024`).
/// - `point_labels`: `[N]` con convención `{1,0,2,3,-1}`.
/// - `orig_im_size`: `(h, w)` — dimensiones donde el decoder upscala las máscaras.
pub fn run_decoder(
    session: &mut Session,
    embedding: &[f32],
    point_coords: &[f32],
    point_labels: &[f32],
    num_points: usize,
    orig_im_size_hw: (u32, u32),
) -> Result<DecoderRun, String> {
    if embedding.len() != EMBEDDING_LEN {
        return Err(format!(
            "decoder: embedding len inesperada ({} f32, esperado {})",
            embedding.len(),
            EMBEDDING_LEN
        ));
    }
    if num_points == 0 {
        return Err("decoder: num_points=0".to_string());
    }
    if point_coords.len() != num_points * 2 {
        return Err(format!(
            "decoder: point_coords len {} ≠ num_points*2 ({})",
            point_coords.len(),
            num_points * 2
        ));
    }
    if point_labels.len() != num_points {
        return Err(format!(
            "decoder: point_labels len {} ≠ num_points ({})",
            point_labels.len(),
            num_points
        ));
    }

    let n = num_points as i64;

    let emb = Tensor::from_array((EMBEDDING_SHAPE, embedding.to_vec()))
        .map_err(|e| format!("tensor image_embeddings: {e}"))?;
    let coords = Tensor::from_array(([1i64, n, 2], point_coords.to_vec()))
        .map_err(|e| format!("tensor point_coords: {e}"))?;
    let labels = Tensor::from_array(([1i64, n], point_labels.to_vec()))
        .map_err(|e| format!("tensor point_labels: {e}"))?;
    let mask_input = Tensor::from_array((
        [1i64, 1, MASK_INPUT_H, MASK_INPUT_W],
        vec![0f32; (MASK_INPUT_H * MASK_INPUT_W) as usize],
    ))
    .map_err(|e| format!("tensor mask_input: {e}"))?;
    let has_mask_input = Tensor::from_array(([1i64], vec![0f32]))
        .map_err(|e| format!("tensor has_mask_input: {e}"))?;
    let orig_im_size = Tensor::from_array((
        [2i64],
        vec![orig_im_size_hw.0 as f32, orig_im_size_hw.1 as f32],
    ))
    .map_err(|e| format!("tensor orig_im_size: {e}"))?;

    let outputs = session
        .run(ort::inputs![
            "image_embeddings" => emb,
            "point_coords" => coords,
            "point_labels" => labels,
            "mask_input" => mask_input,
            "has_mask_input" => has_mask_input,
            "orig_im_size" => orig_im_size,
        ])
        .map_err(|e| format!("Error ejecutando decoder: {e}"))?;

    // Identificar outputs por rango (robusto frente a variaciones de nombre
    // entre MobileSAM / SAM ViT / SAM2).
    let mut masks_data: Option<Vec<f32>> = None;
    let mut mask_shape: Option<[usize; 4]> = None;
    let mut scores: Option<Vec<f32>> = None;

    for (_name, value) in outputs.iter() {
        let Ok((shape, slice)) = value.try_extract_tensor::<f32>() else {
            continue;
        };
        match shape.len() {
            4 => {
                if masks_data.is_none() {
                    mask_shape = Some([
                        shape[0] as usize,
                        shape[1] as usize,
                        shape[2] as usize,
                        shape[3] as usize,
                    ]);
                    masks_data = Some(slice.to_vec());
                }
            }
            1 | 2 => {
                if scores.is_none() {
                    scores = Some(slice.to_vec());
                }
            }
            _ => {}
        }
    }

    let masks = masks_data.ok_or_else(|| "decoder: no se encontró output 4D (masks)".to_string())?;
    let shape = mask_shape.ok_or_else(|| "decoder: shape inválida".to_string())?;
    let scores = scores.ok_or_else(|| "decoder: no se encontró output scores".to_string())?;

    Ok(DecoderRun {
        masks,
        mask_shape: shape,
        scores,
    })
}
