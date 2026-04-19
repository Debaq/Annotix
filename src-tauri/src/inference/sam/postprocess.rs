//! Postprocesado SAM: logits f32 → bitmap u8 con 128 = threshold 0.0,
//! downscale bilinear a 256 lado largo (almacén) y upscale al tamaño original
//! al aceptar (PR5).

use image::{imageops::FilterType, GrayImage, ImageBuffer, Luma};

pub const LOWRES_LONG_SIDE: u32 = 256;

/// Escala logit → u8. Mapeo lineal: `128 ↔ 0.0`.
///
/// El rango útil de logits en SAM suele ser aproximadamente [-16, +16]; con
/// factor 8 saturamos en ~16 (≥128 píxeles claramente dentro, ≤-16 claramente
/// fuera). Threshold de aceptación: `u8 >= 128` ⇔ `logit >= 0`.
#[inline]
fn logit_to_u8(x: f32) -> u8 {
    (x * 8.0 + 128.0).clamp(0.0, 255.0) as u8
}

pub fn logits_to_u8(logits: &[f32]) -> Vec<u8> {
    logits.iter().copied().map(logit_to_u8).collect()
}

/// Downscale bilinear de una máscara u8 manteniendo aspect ratio a
/// `dst_long_side` en el lado largo. Si ya es <= dst, devuelve copia directa.
pub fn downscale_u8_mask(
    mask: &[u8],
    src_w: u32,
    src_h: u32,
    dst_long_side: u32,
) -> Result<(Vec<u8>, u32, u32), String> {
    if mask.len() != (src_w as usize) * (src_h as usize) {
        return Err(format!(
            "downscale: mask len {} ≠ {}×{}",
            mask.len(),
            src_w,
            src_h
        ));
    }
    let long = src_w.max(src_h);
    if long <= dst_long_side {
        return Ok((mask.to_vec(), src_w, src_h));
    }
    let scale = dst_long_side as f32 / long as f32;
    let dst_w = ((src_w as f32 * scale).round() as u32).max(1);
    let dst_h = ((src_h as f32 * scale).round() as u32).max(1);

    let buf: ImageBuffer<Luma<u8>, Vec<u8>> =
        ImageBuffer::from_raw(src_w, src_h, mask.to_vec())
            .ok_or_else(|| "downscale: buffer size mismatch".to_string())?;
    let resized = image::imageops::resize(&buf, dst_w, dst_h, FilterType::Triangle);
    Ok((resized.into_raw(), dst_w, dst_h))
}

/// Upscale bilinear de bitmap u8 → tamaño original y threshold en 128 →
/// `GrayImage` binario (0/255). El threshold corresponde a `logit ≥ 0`.
pub fn upscale_and_threshold(
    lowres: &[u8],
    lowres_size: (u32, u32),
    orig_size: (u32, u32),
) -> Result<GrayImage, String> {
    let (lw, lh) = lowres_size;
    let (ow, oh) = orig_size;
    if lowres.len() != (lw as usize) * (lh as usize) {
        return Err(format!(
            "upscale: lowres len {} ≠ {}×{}",
            lowres.len(),
            lw,
            lh
        ));
    }
    let buf: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::from_raw(lw, lh, lowres.to_vec())
        .ok_or_else(|| "upscale: buffer size mismatch".to_string())?;
    let resized = if (lw, lh) == (ow, oh) {
        buf
    } else {
        image::imageops::resize(&buf, ow, oh, FilterType::Triangle)
    };
    let raw: Vec<u8> = resized
        .as_raw()
        .iter()
        .map(|&v| if v >= 128 { 255u8 } else { 0u8 })
        .collect();
    GrayImage::from_raw(ow, oh, raw).ok_or_else(|| "upscale: GrayImage from_raw failed".to_string())
}
