//! Smoke tests de SAM: cargan un par encoder/decoder real y lo ejecutan.
//!
//! Los tests normales comprueban la lógica alrededor del modelo —detección de
//! variante, transformación de coordenadas, postproceso—, pero no que el modelo
//! se comporte como el código supone: nombres de entrada, formas, rangos. Eso
//! sólo lo dice una corrida real. Es la misma razón por la que existen los smoke
//! tests de entrenamiento (`training/smoke_tests.rs`), y el mismo aprendizaje:
//! un backend que no corre de verdad cuesta más retirarlo que no haberlo
//! agregado.
//!
//! Están marcados `#[ignore]` porque necesitan los pesos en disco —cientos de
//! megas que no pueden vivir en el repositorio—. Se ejecutan con:
//!
//! ```sh
//! ANNOTIX_SAM_ENCODER=/ruta/vision_encoder.onnx \
//! ANNOTIX_SAM_DECODER=/ruta/prompt_encoder_mask_decoder.onnx \
//!   cargo test --lib sam::smoke -- --ignored --nocapture
//! ```
//!
//! Criterio de éxito, el mismo para cualquier variante:
//!   1. el encoder produce un embedding de la longitud que el decodificador
//!      espera,
//!   2. el decodificador acepta los prompts y devuelve máscaras y puntuaciones,
//!   3. la máscara del punto marcado sale **positiva** —el modelo segmentó algo
//!      donde se le señaló, no devolvió ruido—.

use std::path::PathBuf;

use super::decoder::{detectar_variante, load_decoder, run_decoder, DecoderVariant, EMBEDDING_LEN};
use super::encoder::{load_encoder, run_encoder};
use super::preprocess::{preprocess_image, transform_points};

fn ruta(var: &str) -> Option<PathBuf> {
    let p = PathBuf::from(std::env::var(var).ok()?);
    p.exists().then_some(p)
}

/// Una imagen sintética con un objeto claro sobre fondo oscuro.
///
/// No hace falta una imagen médica de verdad para comprobar que el modelo corre y
/// responde al prompt: un círculo brillante es un objeto segmentable, y si el
/// modelo no lo encuentra es que algo del camino está mal, no que la imagen sea
/// difícil.
fn imagen_con_objeto() -> Vec<u8> {
    let (w, h) = (512u32, 512u32);
    let mut img = image::RgbImage::new(w, h);
    let (cx, cy, r) = (256.0f32, 256.0f32, 90.0f32);

    for y in 0..h {
        for x in 0..w {
            let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
            let v = if d < r { 230u8 } else { 25u8 };
            img.put_pixel(x, y, image::Rgb([v, v, v]));
        }
    }

    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgb8(img)
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .expect("codificar png");
    bytes
}

#[test]
#[ignore = "necesita los pesos ONNX en disco; ver la cabecera del módulo"]
fn el_par_sam_corre_y_segmenta_donde_se_le_senala() {
    let (Some(enc_path), Some(dec_path)) =
        (ruta("ANNOTIX_SAM_ENCODER"), ruta("ANNOTIX_SAM_DECODER"))
    else {
        panic!(
            "Faltan ANNOTIX_SAM_ENCODER / ANNOTIX_SAM_DECODER apuntando a los .onnx. \
             Ver la cabecera de este módulo."
        );
    };

    let bytes = imagen_con_objeto();
    let (tensor, orig_w, orig_h, new_w, new_h) = preprocess_image(&bytes).expect("preprocesar");

    // ─── Encoder ────────────────────────────────────────────────────────────
    let mut encoder = load_encoder(enc_path.to_str().unwrap()).expect("cargar encoder");
    let salida = run_encoder(&mut encoder, tensor).expect("ejecutar encoder");

    assert_eq!(
        salida.embedding.len(),
        EMBEDDING_LEN,
        "el embedding tiene {} f32 y el decodificador espera {}: el encoder no es \
         del tamaño que este camino asume",
        salida.embedding.len(),
        EMBEDDING_LEN
    );

    // ─── Decoder ────────────────────────────────────────────────────────────
    let mut decoder = load_decoder(dec_path.to_str().unwrap()).expect("cargar decoder");
    let variante = detectar_variante(&decoder);
    println!("variante detectada: {:?}", variante);

    if variante == DecoderVariant::Transformers {
        assert!(
            salida.positional.is_some(),
            "el decodificador es de Transformers.js y pide el embedding posicional, \
             pero el encoder cargado no lo produce: los dos modelos tienen que venir \
             del mismo export"
        );
    }

    // Un punto positivo en el centro del objeto.
    let raw_xy = [256.0f32, 256.0];
    let labels = [1.0f32];
    let coords = transform_points(&raw_xy, (orig_w, orig_h), (new_w, new_h));

    let run = run_decoder(
        &mut decoder,
        &salida.embedding,
        salida.positional.as_deref(),
        &coords,
        &labels,
        1,
        (orig_h, orig_w),
    )
    .expect("ejecutar decoder");

    let [_b, m, h, w] = run.mask_shape;
    println!("máscaras: {m} de {w}×{h}; puntuaciones: {:?}", run.scores);
    assert!(m >= 1, "el decodificador no devolvió ninguna máscara");
    assert_eq!(
        run.masks.len(),
        m * h * w,
        "la longitud de las máscaras no cuadra con su forma"
    );
    assert_eq!(run.scores.len().min(m), m.min(run.scores.len()));

    // ─── Lo que de verdad importa ───────────────────────────────────────────
    // El logit bajo el punto marcado tiene que ser positivo. Si sale negativo, el
    // modelo corrió pero no segmentó donde se le señaló: las coordenadas van en
    // el espacio equivocado, o la máscara está invertida, o el preprocesado no es
    // el que este export espera. Un test que sólo comprobara que «no explota»
    // dejaría pasar las tres cosas.
    let plane = h * w;
    let mejor = run
        .scores
        .iter()
        .enumerate()
        .take(m)
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(i, _)| i)
        .unwrap_or(0);

    // El punto marcado, en las coordenadas de la máscara que devolvió el modelo.
    let px = (256.0 / orig_w as f32 * w as f32) as usize;
    let py = (256.0 / orig_h as f32 * h as f32) as usize;
    let logit = run.masks[mejor * plane + py.min(h - 1) * w + px.min(w - 1)];

    println!("logit en el punto marcado: {logit}");
    assert!(
        logit > 0.0,
        "el modelo corrió pero no segmentó donde se le señaló (logit {logit} en el \
         punto marcado). Revisar espacio de coordenadas, preprocesado o polaridad \
         de la máscara antes de dar el modelo por bueno."
    );

    // Y fuera del objeto tiene que ser negativo, o estaría marcando la imagen
    // entera: una máscara que lo cubre todo también «contiene» el punto.
    let fuera = run.masks[mejor * plane + (h / 20) * w + (w / 20)];
    println!("logit en una esquina: {fuera}");
    assert!(
        fuera < logit,
        "la esquina puntúa igual o más que el objeto: la máscara no distingue nada"
    );
}
