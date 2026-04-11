use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, RgbImage};
use tauri::State;

use crate::store::AppState;

// ─── CLAHE + Sharpness ──────────────────────────────────────────────────────

#[tauri::command]
pub fn process_image_filters(
    project_id: String,
    image_id: String,
    clahe: u32,
    sharpness: u32,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if clahe == 0 && sharpness == 0 {
        return Err("No filters to apply".into());
    }

    let path = state.get_image_file_path(&project_id, &image_id)?;
    let img = image::open(&path).map_err(|e| format!("Error abriendo imagen: {}", e))?;

    // Limitar a 2048 para rendimiento
    let max_dim = 2048u32;
    let img = if img.width() > max_dim || img.height() > max_dim {
        img.resize(max_dim, max_dim, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let mut rgb = img.to_rgb8();

    if clahe > 0 {
        let clip_limit = 1.0 + (clahe as f64 / 100.0) * 7.0;
        let tiles = (rgb.width().max(rgb.height()) as f64 / 128.0)
            .round()
            .clamp(2.0, 8.0) as u32;
        apply_clahe(&mut rgb, clip_limit, tiles, tiles);
    }

    if sharpness > 0 {
        let amount = (sharpness as f64 / 100.0) * 0.5;
        rgb = apply_sharpness(&rgb, amount);
    }

    // Codificar como JPEG base64 (más rápido y pequeño que PNG para previews)
    let mut buf = std::io::Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(rgb)
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Error codificando imagen: {}", e))?;

    let b64 = STANDARD.encode(buf.into_inner());
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

/// CLAHE: Contrast Limited Adaptive Histogram Equalization
fn apply_clahe(img: &mut RgbImage, clip_limit: f64, tile_grid_x: u32, tile_grid_y: u32) {
    let (width, height) = img.dimensions();
    let tile_w = (width + tile_grid_x - 1) / tile_grid_x;
    let tile_h = (height + tile_grid_y - 1) / tile_grid_y;

    // Paso 1: construir LUTs por tile
    let mut luts = Vec::with_capacity((tile_grid_y * tile_grid_x) as usize);

    for ty in 0..tile_grid_y {
        for tx in 0..tile_grid_x {
            let x0 = tx * tile_w;
            let y0 = ty * tile_h;
            let x1 = (x0 + tile_w).min(width);
            let y1 = (y0 + tile_h).min(height);

            let mut hist = [0u32; 256];
            let mut pixel_count = 0u32;

            for y in y0..y1 {
                for x in x0..x1 {
                    let p = img.get_pixel(x, y);
                    let lum = (0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64)
                        .round() as u8;
                    hist[lum as usize] += 1;
                    pixel_count += 1;
                }
            }

            // Clip histogram
            if clip_limit > 1.0 {
                let limit = ((clip_limit * pixel_count as f64) / 256.0).round().max(1.0) as u32;
                let mut excess = 0u32;
                for h in hist.iter_mut() {
                    if *h > limit {
                        excess += *h - limit;
                        *h = limit;
                    }
                }
                let increment = excess / 256;
                let remainder = (excess - increment * 256) as usize;
                for (i, h) in hist.iter_mut().enumerate() {
                    *h += increment + if i < remainder { 1 } else { 0 };
                }
            }

            // CDF → LUT
            let mut lut = [0u8; 256];
            let mut cdf = 0u32;
            let scale = 255.0 / pixel_count.max(1) as f64;
            for i in 0..256 {
                cdf += hist[i];
                lut[i] = (cdf as f64 * scale).round().min(255.0) as u8;
            }

            luts.push(lut);
        }
    }

    // Paso 2: aplicar con interpolación bilineal
    // Trabajar sobre copia para no leer datos ya modificados
    let src = img.clone();

    for y in 0..height {
        for x in 0..width {
            let p = src.get_pixel(x, y);
            let lum =
                (0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64).round() as u8;
            let lum_idx = lum as usize;

            let fx = (x as f64 / tile_w as f64) - 0.5;
            let fy = (y as f64 / tile_h as f64) - 0.5;
            let tx0 = fx.floor().max(0.0) as u32;
            let ty0 = fy.floor().max(0.0) as u32;
            let tx1 = (tx0 + 1).min(tile_grid_x - 1);
            let ty1 = (ty0 + 1).min(tile_grid_y - 1);
            let ax = (fx - tx0 as f64).clamp(0.0, 1.0);
            let ay = (fy - ty0 as f64).clamp(0.0, 1.0);

            let v00 = luts[(ty0 * tile_grid_x + tx0) as usize][lum_idx] as f64;
            let v10 = luts[(ty0 * tile_grid_x + tx1) as usize][lum_idx] as f64;
            let v01 = luts[(ty1 * tile_grid_x + tx0) as usize][lum_idx] as f64;
            let v11 = luts[(ty1 * tile_grid_x + tx1) as usize][lum_idx] as f64;
            let mapped = v00 * (1.0 - ax) * (1.0 - ay)
                + v10 * ax * (1.0 - ay)
                + v01 * (1.0 - ax) * ay
                + v11 * ax * ay;

            let ratio = if lum > 0 {
                mapped / lum as f64
            } else {
                1.0
            };

            let out = img.get_pixel_mut(x, y);
            out[0] = (p[0] as f64 * ratio).round().min(255.0) as u8;
            out[1] = (p[1] as f64 * ratio).round().min(255.0) as u8;
            out[2] = (p[2] as f64 * ratio).round().min(255.0) as u8;
        }
    }
}

/// Unsharp mask: sharpen con kernel 3x3
fn apply_sharpness(src: &RgbImage, amount: f64) -> RgbImage {
    let (width, height) = src.dimensions();
    let mut out = src.clone();

    for y in 1..height - 1 {
        for x in 1..width - 1 {
            for c in 0..3usize {
                let center = src.get_pixel(x, y)[c] as f64;
                let sum = src.get_pixel(x - 1, y - 1)[c] as f64
                    + src.get_pixel(x, y - 1)[c] as f64
                    + src.get_pixel(x + 1, y - 1)[c] as f64
                    + src.get_pixel(x - 1, y)[c] as f64
                    + src.get_pixel(x + 1, y)[c] as f64
                    + src.get_pixel(x - 1, y + 1)[c] as f64
                    + src.get_pixel(x, y + 1)[c] as f64
                    + src.get_pixel(x + 1, y + 1)[c] as f64;

                let sharpened = center + amount * (8.0 * center - sum);
                out.get_pixel_mut(x, y)[c] = sharpened.round().clamp(0.0, 255.0) as u8;
            }
        }
    }

    out
}

// ─── Flood-fill + Mask Reclassify ────────────────────────────────────────────

#[tauri::command]
pub fn reclassify_mask_island(
    masks_base64: Vec<MaskInput>,
    click_x: u32,
    click_y: u32,
    image_width: u32,
    image_height: u32,
    target_class_id: i64,
    target_color: String,
) -> Result<ReclassifyResult, String> {
    use image::RgbaImage;

    if masks_base64.is_empty() {
        return Ok(ReclassifyResult {
            updated_masks: vec![],
            new_mask: None,
            removed_source: false,
            changed: false,
        });
    }

    // Decodificar todas las máscaras
    let mut masks: Vec<(usize, RgbaImage)> = Vec::new();
    for (i, m) in masks_base64.iter().enumerate() {
        let rgba = decode_base64_png(&m.base64png, image_width, image_height)?;
        masks.push((i, rgba));
    }

    // Encontrar qué máscara tiene un pixel en (click_x, click_y)
    let px = click_x.min(image_width - 1);
    let py = click_y.min(image_height - 1);
    let mut source_idx: Option<usize> = None;

    for (i, (_, rgba)) in masks.iter().enumerate() {
        if rgba.get_pixel(px, py)[3] > 0 {
            source_idx = Some(i);
            break;
        }
    }

    let source_idx = match source_idx {
        Some(i) => i,
        None => {
            return Ok(ReclassifyResult {
                updated_masks: vec![],
                new_mask: None,
                removed_source: false,
                changed: false,
            });
        }
    };

    let source_entry_idx = masks[source_idx].0;
    if masks_base64[source_entry_idx].class_id == target_class_id {
        return Ok(ReclassifyResult {
            updated_masks: vec![],
            new_mask: None,
            removed_source: false,
            changed: false,
        });
    }

    // Flood-fill en la máscara origen
    let island = flood_fill(&masks[source_idx].1, px, py);

    if island.is_empty() {
        return Ok(ReclassifyResult {
            updated_masks: vec![],
            new_mask: None,
            removed_source: false,
            changed: false,
        });
    }

    // Parsear color destino
    let (r, g, b) = parse_hex_color(&target_color)?;

    // Borrar isla del source
    let source_rgba = &mut masks[source_idx].1;
    for &pos in &island {
        let x = pos % image_width;
        let y = pos / image_width;
        source_rgba.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
    }

    // Verificar si el source quedó vacío
    let source_has_pixels = source_rgba.pixels().any(|p| p[3] > 0);

    // Buscar máscara destino existente
    let target_mask_idx = masks_base64
        .iter()
        .position(|m| m.class_id == target_class_id);

    // Construir o modificar máscara destino
    let target_canvas = if let Some(ti) = target_mask_idx {
        let mi = masks.iter().position(|m| m.0 == ti).unwrap();
        &mut masks[mi].1
    } else {
        // Crear nueva máscara vacía — la agregamos al vec
        let new_rgba = RgbaImage::new(image_width, image_height);
        masks.push((masks_base64.len(), new_rgba));
        &mut masks.last_mut().unwrap().1
    };

    // Pintar isla en destino
    for &pos in &island {
        let x = pos % image_width;
        let y = pos / image_width;
        target_canvas.put_pixel(x, y, image::Rgba([r, g, b, 255]));
    }

    // Codificar resultados
    let mut updated_masks = Vec::new();

    // Source actualizado (o marcado como vacío)
    let source_b64 = if source_has_pixels {
        Some(encode_rgba_to_base64_png(&masks[source_idx].1)?)
    } else {
        None
    };
    updated_masks.push(MaskUpdate {
        index: source_entry_idx,
        base64png: source_b64,
    });

    // Target actualizado
    if let Some(ti) = target_mask_idx {
        let mi = masks.iter().position(|m| m.0 == ti).unwrap();
        let b64 = encode_rgba_to_base64_png(&masks[mi].1)?;
        updated_masks.push(MaskUpdate {
            index: ti,
            base64png: Some(b64),
        });
    }

    // Nueva máscara si no existía target
    let new_mask = if target_mask_idx.is_none() {
        let last = masks.last().unwrap();
        Some(encode_rgba_to_base64_png(&last.1)?)
    } else {
        None
    };

    Ok(ReclassifyResult {
        updated_masks,
        new_mask,
        removed_source: !source_has_pixels,
        changed: true,
    })
}

/// Flood-fill 4-conectividad. Devuelve coordenadas como pos = y * width + x.
fn flood_fill(img: &image::RgbaImage, start_x: u32, start_y: u32) -> Vec<u32> {
    let (width, height) = img.dimensions();

    if start_x >= width || start_y >= height {
        return vec![];
    }

    if img.get_pixel(start_x, start_y)[3] == 0 {
        return vec![];
    }

    let total = (width * height) as usize;
    let mut visited = vec![false; total];
    let start_pos = start_y * width + start_x;
    visited[start_pos as usize] = true;

    let mut queue = Vec::with_capacity(1024);
    queue.push(start_pos);
    let mut result = Vec::with_capacity(1024);

    while let Some(pos) = queue.pop() {
        result.push(pos);
        let x = pos % width;
        let y = pos / width;

        // 4 vecinos
        let neighbors = [
            if x > 0 { Some(pos - 1) } else { None },
            if x < width - 1 { Some(pos + 1) } else { None },
            if y > 0 { Some(pos - width) } else { None },
            if y < height - 1 {
                Some(pos + width)
            } else {
                None
            },
        ];

        for n in neighbors.into_iter().flatten() {
            let ni = n as usize;
            if !visited[ni] {
                let nx = n % width;
                let ny = n / width;
                if img.get_pixel(nx, ny)[3] > 0 {
                    visited[ni] = true;
                    queue.push(n);
                }
            }
        }
    }

    result
}

fn decode_base64_png(
    data_url: &str,
    expected_w: u32,
    expected_h: u32,
) -> Result<image::RgbaImage, String> {
    // Extraer base64 del data URL
    let b64 = if let Some(pos) = data_url.find(",") {
        &data_url[pos + 1..]
    } else {
        data_url
    };

    let bytes = STANDARD
        .decode(b64)
        .map_err(|e| format!("Error decodificando base64: {}", e))?;

    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("Error decodificando PNG: {}", e))?;

    let rgba = img.to_rgba8();

    // Redimensionar si no coincide
    if rgba.width() != expected_w || rgba.height() != expected_h {
        Ok(image::imageops::resize(
            &rgba,
            expected_w,
            expected_h,
            image::imageops::FilterType::Nearest,
        ))
    } else {
        Ok(rgba)
    }
}

fn encode_rgba_to_base64_png(img: &image::RgbaImage) -> Result<String, String> {
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("Error codificando PNG: {}", e))?;
    let b64 = STANDARD.encode(buf.into_inner());
    Ok(format!("data:image/png;base64,{}", b64))
}

fn parse_hex_color(hex: &str) -> Result<(u8, u8, u8), String> {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 {
        return Err("Color hex inválido".into());
    }
    let r = u8::from_str_radix(&hex[0..2], 16).map_err(|_| "Color hex inválido")?;
    let g = u8::from_str_radix(&hex[2..4], 16).map_err(|_| "Color hex inválido")?;
    let b = u8::from_str_radix(&hex[4..6], 16).map_err(|_| "Color hex inválido")?;
    Ok((r, g, b))
}

// ─── Audio peaks ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn compute_audio_peaks(samples: Vec<f32>, num_peaks: u32) -> Result<Vec<f32>, String> {
    if samples.is_empty() || num_peaks == 0 {
        return Ok(vec![]);
    }

    let num_peaks = num_peaks as usize;
    let samples_per_peak = samples.len() / num_peaks;
    if samples_per_peak == 0 {
        return Ok(samples.iter().map(|s| s.abs()).collect());
    }

    let mut peaks = Vec::with_capacity(num_peaks);
    for i in 0..num_peaks {
        let start = i * samples_per_peak;
        let end = (start + samples_per_peak).min(samples.len());
        let mut max: f32 = 0.0;
        for j in start..end {
            let abs = samples[j].abs();
            if abs > max {
                max = abs;
            }
        }
        peaks.push(max);
    }

    Ok(peaks)
}

// ─── Tipos serializables ─────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskInput {
    pub base64png: String,
    pub class_id: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaskUpdate {
    pub index: usize,
    pub base64png: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReclassifyResult {
    pub updated_masks: Vec<MaskUpdate>,
    pub new_mask: Option<String>,
    pub removed_source: bool,
    pub changed: bool,
}
