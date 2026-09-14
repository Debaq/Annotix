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

/// Qué firma habla este decodificador.
///
/// Hay dos exports de SAM en circulación y no son intercambiables. El del
/// repositorio oficial —que es el que asumía este módulo— y el que produce
/// Transformers.js, que es el **único** que existe para MedSAM. Se detecta por
/// los nombres de las entradas en vez de pedírselo al usuario: quien sube un
/// `.onnx` no tiene por qué saber con qué herramienta lo exportaron.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecoderVariant {
    /// `point_coords`, `point_labels`, `mask_input`, `has_mask_input`,
    /// `orig_im_size`. Devuelve las máscaras ya escaladas al tamaño original.
    Oficial,
    /// `input_points`, `input_labels`, `image_positional_embeddings`. Devuelve
    /// las máscaras en baja resolución y sin escalar: el escalado lo hace la app
    /// al aceptar, que es lo que ya hacía de todos modos.
    Transformers,
}

/// Mira las entradas del modelo y decide qué firma habla.
pub fn detectar_variante(session: &Session) -> DecoderVariant {
    let tiene = |nombre: &str| session.inputs().iter().any(|i| i.name() == nombre);
    if tiene("input_points") || tiene("image_positional_embeddings") {
        DecoderVariant::Transformers
    } else {
        DecoderVariant::Oficial
    }
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
    positional: Option<&[f32]>,
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

    if detectar_variante(session) == DecoderVariant::Transformers {
        return run_decoder_transformers(
            session,
            embedding,
            positional,
            point_coords,
            point_labels,
            n,
        );
    }

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

    let masks =
        masks_data.ok_or_else(|| "decoder: no se encontró output 4D (masks)".to_string())?;
    let shape = mask_shape.ok_or_else(|| "decoder: shape inválida".to_string())?;
    let scores = scores.ok_or_else(|| "decoder: no se encontró output scores".to_string())?;

    Ok(DecoderRun {
        masks,
        mask_shape: shape,
        scores,
    })
}

/// Ejecuta un decodificador exportado con Transformers.js.
///
/// Diferencias con el oficial, todas obligadas por cómo se exportó:
///
/// - Los puntos van en `[1, 1, N, 2]` —hay una dimensión de «grupo de prompts»
///   entre el batch y los puntos— y las etiquetas en `[1, 1, N]` como enteros.
/// - Exige el **embedding posicional** del encoder. Sin él no se puede ejecutar,
///   y devolver una máscara vacía sería peor que decirlo.
/// - No recibe `orig_im_size`: devuelve las máscaras a 256×256 sin escalar. La
///   app ya trabajaba con máscaras en baja resolución y las escala al aceptar,
///   así que esto encaja sin tocar nada más.
/// - La salida de máscaras es de rango 5 `[1, 1, M, 256, 256]`, no de rango 4.
fn run_decoder_transformers(
    session: &mut Session,
    embedding: &[f32],
    positional: Option<&[f32]>,
    point_coords: &[f32],
    point_labels: &[f32],
    n: i64,
) -> Result<DecoderRun, String> {
    let positional = positional.ok_or_else(|| {
        "Este decodificador necesita el embedding posicional y el encoder cargado no lo \
         produce. Los dos modelos tienen que venir del mismo export: un encoder oficial \
         de SAM con un decodificador de Transformers.js no encajan."
            .to_string()
    })?;

    let emb = Tensor::from_array((EMBEDDING_SHAPE, embedding.to_vec()))
        .map_err(|e| format!("tensor image_embeddings: {e}"))?;
    let pos = Tensor::from_array((EMBEDDING_SHAPE, positional.to_vec()))
        .map_err(|e| format!("tensor image_positional_embeddings: {e}"))?;
    let puntos = Tensor::from_array(([1i64, 1, n, 2], point_coords.to_vec()))
        .map_err(|e| format!("tensor input_points: {e}"))?;
    // Las etiquetas van como enteros en este export; el oficial las quiere f32.
    let etiquetas: Vec<i64> = point_labels.iter().map(|l| *l as i64).collect();
    let etiquetas = Tensor::from_array(([1i64, 1, n], etiquetas))
        .map_err(|e| format!("tensor input_labels: {e}"))?;

    let outputs = session
        .run(ort::inputs![
            "image_embeddings" => emb,
            "image_positional_embeddings" => pos,
            "input_points" => puntos,
            "input_labels" => etiquetas,
        ])
        .map_err(|e| format!("Error ejecutando decoder (Transformers): {e}"))?;

    let mut masks: Option<(Vec<f32>, [usize; 4])> = None;
    let mut scores: Option<Vec<f32>> = None;

    for (_name, value) in outputs.iter() {
        let Ok((shape, slice)) = value.try_extract_tensor::<f32>() else {
            continue;
        };
        match shape.len() {
            // `[batch, grupo, M, H, W]`: se aplana el grupo, que siempre es 1.
            5 if masks.is_none() => {
                masks = Some((
                    slice.to_vec(),
                    [
                        shape[0] as usize,
                        shape[2] as usize,
                        shape[3] as usize,
                        shape[4] as usize,
                    ],
                ));
            }
            4 if masks.is_none() => {
                masks = Some((
                    slice.to_vec(),
                    [
                        shape[0] as usize,
                        shape[1] as usize,
                        shape[2] as usize,
                        shape[3] as usize,
                    ],
                ));
            }
            1..=3 if scores.is_none() => scores = Some(slice.to_vec()),
            _ => {}
        }
    }

    let (masks, mask_shape) =
        masks.ok_or_else(|| "decoder: no se encontró output de máscaras".to_string())?;
    let scores = scores.unwrap_or_else(|| vec![1.0; mask_shape[1]]);

    Ok(DecoderRun {
        masks,
        mask_shape,
        scores,
    })
}
