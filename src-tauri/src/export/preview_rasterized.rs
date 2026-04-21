use std::io::{Seek, Write};
use std::path::Path;

use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use image::{GenericImageView, Rgba, RgbaImage};
use imageproc::drawing::{draw_filled_rect_mut, draw_hollow_rect_mut, draw_line_segment_mut, draw_text_mut};
use imageproc::rect::Rect;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::store::project_file::{ImageEntry, ProjectFile};

use super::{parse_bbox, parse_obb, parse_polygon};

const FONT_BYTES: &[u8] = include_bytes!("../../assets/fonts/DejaVuSans.ttf");

pub fn export<W: Write + Seek, F: Fn(f64)>(
    pf: &ProjectFile,
    images: &[ImageEntry],
    images_dir: &Path,
    file: W,
    include_labels: bool,
    emit_progress: F,
) -> Result<(), String> {
    let font = FontRef::try_from_slice(FONT_BYTES)
        .map_err(|e| format!("Error cargando fuente embebida: {}", e))?;

    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    // classes.txt leyenda
    let mut legend = String::from("id\tname\tcolor\n");
    for c in &pf.classes {
        legend.push_str(&format!("{}\t{}\t{}\n", c.id, c.name, c.color));
    }
    zip.start_file("classes.txt", options)
        .map_err(|e| format!("Error creando classes.txt: {}", e))?;
    zip.write_all(legend.as_bytes())
        .map_err(|e| format!("Error escribiendo classes.txt: {}", e))?;

    let total = images.len().max(1);
    for (idx, img_entry) in images.iter().enumerate() {
        let src = images_dir.join(&img_entry.file);
        let img = match image::open(&src) {
            Ok(i) => i,
            Err(e) => {
                log::warn!("preview_rasterized: saltando {} ({})", img_entry.file, e);
                continue;
            }
        };
        let (w, h) = img.dimensions();
        let mut canvas: RgbaImage = img.to_rgba8();

        // Escalas proporcionales a la imagen para que se vean bien a cualquier resolución
        let min_side = w.min(h) as f32;
        let stroke = ((min_side / 400.0).round() as i32).clamp(2, 8);
        let font_px = (min_side / 45.0).clamp(14.0, 48.0);

        for ann in &img_entry.annotations {
            let class = pf.classes.iter().find(|c| c.id == ann.class_id);
            let color = class
                .map(|c| parse_hex_color(&c.color))
                .unwrap_or(Rgba([255, 0, 0, 255]));
            let name = class.map(|c| c.name.as_str()).unwrap_or("?");

            match ann.annotation_type.as_str() {
                "bbox" => {
                    if let Some(b) = parse_bbox(&ann.data) {
                        draw_bbox(&mut canvas, b.x, b.y, b.width, b.height, color, w, h, stroke);
                        if include_labels {
                            draw_label(&mut canvas, &font, font_px, b.x as i32, b.y as i32, name, color);
                        }
                    }
                }
                "polygon" => {
                    if let Some(p) = parse_polygon(&ann.data) {
                        draw_polygon(&mut canvas, &p.points, color, stroke);
                        if include_labels {
                            if let Some((px, py)) = p.points.first() {
                                draw_label(&mut canvas, &font, font_px, *px as i32, *py as i32, name, color);
                            }
                        }
                    }
                }
                "obb" => {
                    if let Some(o) = parse_obb(&ann.data) {
                        draw_obb(&mut canvas, o.x, o.y, o.width, o.height, o.rotation, color, stroke);
                        if include_labels {
                            draw_label(
                                &mut canvas, &font, font_px,
                                (o.x - o.width / 2.0) as i32,
                                (o.y - o.height / 2.0) as i32,
                                name, color,
                            );
                        }
                    }
                }
                _ => {}
            }
        }

        // Encode JPG q=92 sobre fondo blanco
        let mut buf: Vec<u8> = Vec::new();
        {
            use image::codecs::jpeg::JpegEncoder;
            use image::ImageEncoder;
            let rgb = rgba_to_rgb_on_white(&canvas);
            let enc = JpegEncoder::new_with_quality(&mut buf, 92);
            enc.write_image(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("Error codificando JPG preview: {}", e))?;
        }

        let stem = Path::new(&img_entry.name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| img_entry.name.clone());
        let out_name = format!("images/{}.jpg", stem);
        zip.start_file(&out_name, options)
            .map_err(|e| format!("Error creando {}: {}", out_name, e))?;
        zip.write_all(&buf)
            .map_err(|e| format!("Error escribiendo {}: {}", out_name, e))?;

        emit_progress((idx + 1) as f64 / total as f64);
    }

    zip.finish().map_err(|e| format!("Error finalizando ZIP: {}", e))?;
    Ok(())
}

fn rgba_to_rgb_on_white(rgba: &RgbaImage) -> image::RgbImage {
    let (w, h) = rgba.dimensions();
    let mut out = image::RgbImage::new(w, h);
    for (x, y, px) in rgba.enumerate_pixels() {
        let [r, g, b, a] = px.0;
        let alpha = a as f32 / 255.0;
        let inv = 1.0 - alpha;
        let nr = (r as f32 * alpha + 255.0 * inv).round().clamp(0.0, 255.0) as u8;
        let ng = (g as f32 * alpha + 255.0 * inv).round().clamp(0.0, 255.0) as u8;
        let nb = (b as f32 * alpha + 255.0 * inv).round().clamp(0.0, 255.0) as u8;
        out.put_pixel(x, y, image::Rgb([nr, ng, nb]));
    }
    out
}

fn parse_hex_color(hex: &str) -> Rgba<u8> {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return Rgba([255, 0, 0, 255]);
    }
    let r = u8::from_str_radix(&h[0..2], 16).unwrap_or(255);
    let g = u8::from_str_radix(&h[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&h[4..6], 16).unwrap_or(0);
    Rgba([r, g, b, 255])
}

fn draw_bbox(canvas: &mut RgbaImage, x: f64, y: f64, w: f64, h: f64, color: Rgba<u8>, img_w: u32, img_h: u32, stroke: i32) {
    let x = x.round().max(0.0) as i32;
    let y = y.round().max(0.0) as i32;
    let mut w = w.round() as i32;
    let mut h = h.round() as i32;
    if x + w > img_w as i32 { w = img_w as i32 - x; }
    if y + h > img_h as i32 { h = img_h as i32 - y; }
    if w <= 0 || h <= 0 { return; }
    for d in 0..stroke {
        let rx = (x + d).max(0);
        let ry = (y + d).max(0);
        let rw = (w - 2 * d).max(1) as u32;
        let rh = (h - 2 * d).max(1) as u32;
        let r = Rect::at(rx, ry).of_size(rw, rh);
        draw_hollow_rect_mut(canvas, r, color);
    }
}

fn draw_polygon(canvas: &mut RgbaImage, pts: &[(f64, f64)], color: Rgba<u8>, stroke: i32) {
    if pts.len() < 2 { return; }
    let s = stroke.max(1);
    for i in 0..pts.len() {
        let a = pts[i];
        let b = pts[(i + 1) % pts.len()];
        for dx in -s/2..=s/2 {
            for dy in -s/2..=s/2 {
                draw_line_segment_mut(
                    canvas,
                    (a.0 as f32 + dx as f32, a.1 as f32 + dy as f32),
                    (b.0 as f32 + dx as f32, b.1 as f32 + dy as f32),
                    color,
                );
            }
        }
    }
}

fn draw_obb(canvas: &mut RgbaImage, cx: f64, cy: f64, w: f64, h: f64, angle: f64, color: Rgba<u8>, stroke: i32) {
    let (sin, cos) = angle.sin_cos();
    let hw = w / 2.0;
    let hh = h / 2.0;
    let corners = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)];
    let rotated: Vec<(f64, f64)> = corners.iter().map(|(x, y)| {
        (cx + x * cos - y * sin, cy + x * sin + y * cos)
    }).collect();
    draw_polygon(canvas, &rotated, color, stroke);
}

fn text_color_for(bg: Rgba<u8>) -> Rgba<u8> {
    let [r, g, b, _] = bg.0;
    let lum = 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32;
    if lum > 140.0 { Rgba([0, 0, 0, 255]) } else { Rgba([255, 255, 255, 255]) }
}

fn measure_text<F: Font>(font: &F, scale: PxScale, text: &str) -> (i32, i32) {
    let sf = font.as_scaled(scale);
    let mut width = 0.0_f32;
    for c in text.chars() {
        let gid = font.glyph_id(c);
        width += sf.h_advance(gid);
    }
    let height = sf.ascent() - sf.descent();
    (width.ceil() as i32, height.ceil() as i32)
}

fn draw_label(
    canvas: &mut RgbaImage,
    font: &FontRef<'_>,
    font_px: f32,
    x: i32,
    y: i32,
    text: &str,
    bg: Rgba<u8>,
) {
    let scale = PxScale::from(font_px);
    let (tw, th) = measure_text(font, scale, text);
    let pad: i32 = (font_px * 0.25) as i32;
    let box_w = (tw + pad * 2) as u32;
    let box_h = (th + pad * 2) as u32;

    // Preferir arriba del bbox; si no entra, poner adentro
    let mut ly = y - box_h as i32;
    if ly < 0 { ly = y.max(0); }
    let lx = x.max(0);

    let (img_w, img_h) = canvas.dimensions();
    let rect_w = box_w.min(img_w.saturating_sub(lx as u32));
    let rect_h = box_h.min(img_h.saturating_sub(ly as u32));
    if rect_w == 0 || rect_h == 0 { return; }
    draw_filled_rect_mut(canvas, Rect::at(lx, ly).of_size(rect_w, rect_h), bg);

    let fg = text_color_for(bg);
    // imageproc::draw_text_mut posiciona por baseline aproximado; offset pad
    let sf = font.as_scaled(scale);
    let baseline_y = ly + pad + sf.ascent() as i32;
    // draw_text_mut espera coord superior-izquierda del glyph (no baseline); la implementación
    // de imageproc 0.25 usa y como top-left del bitmap de glifo. Calcular desde ascent.
    let _ = baseline_y;
    draw_text_mut(canvas, fg, lx + pad, ly + pad, scale, font, text);
}
