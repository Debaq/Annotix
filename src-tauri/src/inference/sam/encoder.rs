//! Encoder ONNX de SAM.
//!
//! Carga una sesión ONNX y la ejecuta sobre una imagen preprocesada
//! (`[1, 3, 1024, 1024]`), devolviendo el embedding como `Vec<f32>`.
//!
//! El shape del embedding depende de la variante SAM:
//! - MobileSAM / SAM ViT-B: `[1, 256, 64, 64]` (262144 f32)
//! - SAM2: `[1, 256, 64, 64]` + features adicionales
//!
//! Aceptamos el primer output f32 como embedding genérico. Variantes con
//! múltiples outputs se manejarán en PR3/PR4 cuando conectemos el decoder.

use ort::session::Session;
use ort::value::Tensor;

use super::preprocess::SAM_INPUT_LONG_SIDE;

/// Convierte un buffer CHW `[3, S, S]` a HWC `[S, S, 3]`.
fn chw_to_hwc(chw: &[f32], side: usize) -> Vec<f32> {
    let plane = side * side;
    let mut out = vec![0.0f32; chw.len()];
    for y in 0..side {
        for x in 0..side {
            let i = y * side + x;
            out[i * 3] = chw[i];
            out[i * 3 + 1] = chw[plane + i];
            out[i * 3 + 2] = chw[2 * plane + i];
        }
    }
    out
}

pub fn load_encoder(model_path: &str) -> Result<Session, String> {
    crate::inference::ort_runner::new_configured_builder()?
        .commit_from_file(model_path)
        .map_err(|e| format!("Error cargando encoder ONNX: {e}"))
}

/// Lo que produce el encoder.
///
/// Los exports oficiales de SAM devuelven sólo el embedding. Los generados con
/// Transformers.js —que son los únicos que hay de MedSAM— devuelven además el
/// **embedding posicional**, y su decodificador lo exige: sin él no se puede usar
/// ese modelo. Por eso se recoge cuando está, en vez de quedarse con el primero.
pub struct EncoderOutput {
    pub embedding: Vec<f32>,
    /// Embedding posicional, cuando el modelo lo produce.
    pub positional: Option<Vec<f32>>,
}

/// Ejecuta el encoder sobre un tensor CHW `[3, 1024, 1024]`.
///
/// Algunos exports ONNX de SAM esperan rank 4 `[1, 3, H, W]` y otros rank 3
/// `[3, H, W]` (sin batch dim). Inspeccionamos el primer input para decidir.
pub fn run_encoder(session: &mut Session, input_chw: Vec<f32>) -> Result<EncoderOutput, String> {
    let side = SAM_INPUT_LONG_SIDE as i64;

    // Inspeccionar shape esperada para decidir layout (NCHW / CHW / HWC).
    let expected_shape: Vec<i64> = session
        .inputs()
        .first()
        .and_then(|inp| inp.dtype().tensor_shape().map(|s| s.to_vec()))
        .unwrap_or_else(|| vec![1, 3, side, side]);

    // Detectar dónde está el canal (dim con valor 3).
    let (layout_shape, tensor_data) = match expected_shape.as_slice() {
        // NCHW: [1, 3, H, W]
        [_, 3, _, _] => (vec![1i64, 3, side, side], input_chw),
        // CHW: [3, H, W]
        [3, _, _] => (vec![3i64, side, side], input_chw),
        // HWC: [H, W, 3]
        [_, _, 3] => (
            vec![side, side, 3i64],
            chw_to_hwc(&input_chw, side as usize),
        ),
        // NHWC: [1, H, W, 3]
        [_, _, _, 3] => (
            vec![1i64, side, side, 3i64],
            chw_to_hwc(&input_chw, side as usize),
        ),
        _ => (vec![1i64, 3, side, side], input_chw),
    };

    let tensor = Tensor::from_array((layout_shape, tensor_data))
        .map_err(|e| format!("Error creando tensor encoder: {e}"))?;
    let outputs = session
        .run(ort::inputs![tensor])
        .map_err(|e| format!("Error ejecutando encoder: {e}"))?;

    // El embedding es el primer output f32; el posicional se identifica por
    // nombre, porque tiene exactamente la misma forma que el embedding y por
    // posición serían indistinguibles.
    let mut embedding: Option<Vec<f32>> = None;
    let mut positional: Option<Vec<f32>> = None;

    for (name, value) in outputs.iter() {
        let Ok((_shape, slice)) = value.try_extract_tensor::<f32>() else {
            continue;
        };
        if name.contains("positional") {
            positional = Some(slice.to_vec());
        } else if embedding.is_none() {
            embedding = Some(slice.to_vec());
        }
    }

    match embedding {
        Some(embedding) => Ok(EncoderOutput {
            embedding,
            positional,
        }),
        None => Err("Encoder no produjo output f32".to_string()),
    }
}
