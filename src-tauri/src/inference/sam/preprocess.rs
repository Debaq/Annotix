//! Preprocesado SAM: resize 1024 lado largo + normalización ImageNet.
//!
//! SAM espera input `[1, 3, 1024, 1024]` con padding derecha/abajo, normalizado
//! con media/std de ImageNet. Coords de prompts se transforman al mismo
//! espacio (escala lineal por el lado largo) y luego se proyectan al embedding.

use image::GenericImageView;

pub const SAM_INPUT_LONG_SIDE: u32 = 1024;

/// Normalización ImageNet (media/std en rango 0..255, antes de dividir).
pub const PIXEL_MEAN: [f32; 3] = [123.675, 116.28, 103.53];
pub const PIXEL_STD: [f32; 3] = [58.395, 57.12, 57.375];

/// Devuelve:
/// - `tensor` CHW f32 de tamaño `[3, 1024, 1024]` (con padding cero a la der/abajo)
/// - `orig_w`, `orig_h` — dimensiones de la imagen original
/// - `resized_w`, `resized_h` — dimensiones útiles tras resize (max = 1024)
#[allow(clippy::type_complexity)]
pub fn preprocess_image(bytes: &[u8]) -> Result<(Vec<f32>, u32, u32, u32, u32), String> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| format!("Error decodificando imagen: {e}"))?;
    let (orig_w, orig_h) = img.dimensions();

    let long = orig_w.max(orig_h) as f32;
    let scale = SAM_INPUT_LONG_SIDE as f32 / long;
    let new_w = ((orig_w as f32) * scale).round() as u32;
    let new_h = ((orig_h as f32) * scale).round() as u32;

    let resized = image::imageops::resize(
        &img.to_rgb8(),
        new_w,
        new_h,
        image::imageops::FilterType::Triangle, // bilinear
    );

    let side = SAM_INPUT_LONG_SIDE as usize;
    let plane = side * side;
    let mut tensor = vec![0f32; 3 * plane];

    for y in 0..new_h as usize {
        for x in 0..new_w as usize {
            let px = resized.get_pixel(x as u32, y as u32);
            let idx = y * side + x;
            tensor[idx] = (px[0] as f32 - PIXEL_MEAN[0]) / PIXEL_STD[0];
            tensor[plane + idx] = (px[1] as f32 - PIXEL_MEAN[1]) / PIXEL_STD[1];
            tensor[2 * plane + idx] = (px[2] as f32 - PIXEL_MEAN[2]) / PIXEL_STD[2];
        }
    }

    Ok((tensor, orig_w, orig_h, new_w, new_h))
}

/// Transforma puntos `(x,y)` en coords de imagen original → coords SAM input
/// (misma escala que `new_w`/`new_h`, dentro de `[0, 1024]`).
#[allow(dead_code)]
pub fn transform_points(points_xy: &[f32], orig: (u32, u32), resized: (u32, u32)) -> Vec<f32> {
    let sx = resized.0 as f32 / orig.0 as f32;
    let sy = resized.1 as f32 / orig.1 as f32;
    points_xy
        .chunks_exact(2)
        .flat_map(|xy| [xy[0] * sx, xy[1] * sy])
        .collect()
}
