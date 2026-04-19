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

pub fn load_encoder(model_path: &str) -> Result<Session, String> {
    Session::builder()
        .map_err(|e| format!("Error creando session builder (encoder): {e}"))?
        .commit_from_file(model_path)
        .map_err(|e| format!("Error cargando encoder ONNX: {e}"))
}

/// Ejecuta el encoder sobre un tensor CHW `[3, 1024, 1024]` y devuelve el
/// primer output f32 como embedding.
pub fn run_encoder(session: &mut Session, input_chw: Vec<f32>) -> Result<Vec<f32>, String> {
    let side = SAM_INPUT_LONG_SIDE as i64;
    let tensor = Tensor::from_array(([1i64, 3, side, side], input_chw))
        .map_err(|e| format!("Error creando tensor encoder: {e}"))?;

    let outputs = session
        .run(ort::inputs![tensor])
        .map_err(|e| format!("Error ejecutando encoder: {e}"))?;

    // Primer output f32 — embedding.
    for (_name, value) in outputs.iter() {
        if let Ok((_shape, slice)) = value.try_extract_tensor::<f32>() {
            return Ok(slice.to_vec());
        }
    }
    Err("Encoder no produjo output f32".to_string())
}
