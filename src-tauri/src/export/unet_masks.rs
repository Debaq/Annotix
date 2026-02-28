use std::io::{Write, Cursor};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;
use image::{GrayImage, Luma};

use crate::store::project_file::{ProjectFile, ImageEntry};
use super::{parse_mask, parse_polygon, add_image_to_zip};

pub fn export<F: Fn(f64)>(
    project: &ProjectFile,
    images: &[ImageEntry],
    images_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let total = images.len() as f64;

    for (i, image_rec) in images.iter().enumerate() {
        // Add original image
        add_image_to_zip(&mut zip, "images", image_rec, images_dir)?;

        // Generate mask
        if let Some(mask_png) = generate_mask(image_rec, project)? {
            let mask_name = replace_ext(&image_rec.name, "png");
            zip.start_file(format!("masks/{}", mask_name), options).map_err(|e| e.to_string())?;
            zip.write_all(&mask_png).map_err(|e| e.to_string())?;
        }

        emit_progress(((i + 1) as f64 / total) * 100.0);
    }

    // classes.txt
    let mut classes_content = "0: background\n".to_string();
    for cls in &project.classes {
        let value = get_scaled_value(cls.id, project.classes.len());
        classes_content.push_str(&format!("{}: {}\n", value, cls.name));
    }
    zip.start_file("classes.txt", options).map_err(|e| e.to_string())?;
    zip.write_all(classes_content.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn generate_mask(image: &ImageEntry, project: &ProjectFile) -> Result<Option<Vec<u8>>, String> {
    let w = image.width as u32;
    let h = image.height as u32;

    // Create grayscale mask (background = 0)
    let mut mask_img = GrayImage::from_pixel(w, h, Luma([0u8]));

    let mut has_mask_content = false;

    for ann in &image.annotations {
        match ann.annotation_type.as_str() {
            "mask" => {
                if let Some(mask_data) = parse_mask(&ann.data) {
                    let class_value = get_class_value(ann.class_id, project);
                    draw_mask_annotation(&mut mask_img, &mask_data, class_value)?;
                    has_mask_content = true;
                }
            }
            "polygon" => {
                if let Some(poly_data) = parse_polygon(&ann.data) {
                    let class_value = get_class_value(ann.class_id, project);
                    draw_polygon_on_mask(&mut mask_img, &poly_data.points, class_value);
                    has_mask_content = true;
                }
            }
            _ => {}
        }
    }

    if !has_mask_content {
        return Ok(None);
    }

    // Encode to PNG
    let mut buf = Cursor::new(Vec::new());
    mask_img.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("Error codificando mask PNG: {}", e))?;

    Ok(Some(buf.into_inner()))
}

fn draw_mask_annotation(
    target: &mut GrayImage,
    mask_data: &super::MaskData,
    class_value: u8,
) -> Result<(), String> {
    // Decode base64 PNG mask
    let png_data = decode_base64_png(&mask_data.base64png)?;

    let mask_image = image::load_from_memory(&png_data)
        .map_err(|e| format!("Error cargando mask PNG: {}", e))?;
    let rgba = mask_image.to_rgba8();

    let target_w = target.width().min(rgba.width());
    let target_h = target.height().min(rgba.height());

    for y in 0..target_h {
        for x in 0..target_w {
            let pixel = rgba.get_pixel(x, y);
            // Alpha > 128 means this pixel is part of the mask
            if pixel[3] > 128 {
                target.put_pixel(x, y, Luma([class_value]));
            }
        }
    }

    Ok(())
}

fn draw_polygon_on_mask(target: &mut GrayImage, points: &[(f64, f64)], class_value: u8) {
    if points.len() < 3 {
        return;
    }

    let w = target.width() as f64;
    let h = target.height() as f64;

    // Scanline fill algorithm
    let min_y = points.iter().map(|p| p.1).fold(f64::MAX, f64::min).max(0.0) as u32;
    let max_y = points.iter().map(|p| p.1).fold(f64::MIN, f64::max).min(h - 1.0) as u32;

    for y in min_y..=max_y {
        let yf = y as f64 + 0.5;
        let mut intersections = Vec::new();

        for i in 0..points.len() {
            let j = (i + 1) % points.len();
            let (y0, y1) = (points[i].1, points[j].1);
            let (x0, x1) = (points[i].0, points[j].0);

            if (y0 <= yf && y1 > yf) || (y1 <= yf && y0 > yf) {
                let t = (yf - y0) / (y1 - y0);
                let x = x0 + t * (x1 - x0);
                intersections.push(x);
            }
        }

        intersections.sort_by(|a, b| a.partial_cmp(b).unwrap());

        for pair in intersections.chunks(2) {
            if pair.len() == 2 {
                let x_start = (pair[0].max(0.0)) as u32;
                let x_end = (pair[1].min(w - 1.0)) as u32;
                for x in x_start..=x_end {
                    if x < target.width() {
                        target.put_pixel(x, y, Luma([class_value]));
                    }
                }
            }
        }
    }
}

fn decode_base64_png(data: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;

    // Strip data URI prefix if present
    let b64_str = if let Some(pos) = data.find(",") {
        &data[pos + 1..]
    } else {
        data
    };

    engine.decode(b64_str).map_err(|e| format!("Error decodificando base64: {}", e))
}

fn get_class_value(class_id: i64, project: &ProjectFile) -> u8 {
    get_scaled_value(class_id, project.classes.len())
}

fn get_scaled_value(class_id: i64, num_classes: usize) -> u8 {
    if num_classes <= 1 {
        return 255;
    }
    let step = 255.0 / num_classes as f64;
    (class_id as f64 * step).round().min(255.0) as u8
}

fn replace_ext(filename: &str, new_ext: &str) -> String {
    match filename.rfind('.') {
        Some(pos) => format!("{}.{}", &filename[..pos], new_ext),
        None => format!("{}.{}", filename, new_ext),
    }
}
