use std::io::Read;
use zip::ZipArchive;
use serde_json::json;

use super::{ImportData, ImageImportData, create_class, create_annotation};

pub fn import_data(
    archive: &mut ZipArchive<std::fs::File>,
    _project_type: &str,
    is_segmentation: bool,
) -> Result<ImportData, String> {
    // Read classes.txt
    let classes_content = read_zip_text(archive, "classes.txt")?;
    let class_names: Vec<&str> = classes_content.trim().lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    let classes = class_names.iter().enumerate()
        .map(|(i, name)| create_class(i as i64, name.trim(), None))
        .collect();

    // Get image files
    let image_files = list_files_in_folder(archive, "images");
    if image_files.is_empty() {
        return Err("No se encontraron imágenes en images/".to_string());
    }

    let mut images = Vec::new();

    for image_path in &image_files {
        let image_name = image_path.rsplit('/').next().unwrap_or(image_path);
        if image_name.is_empty() { continue; }

        // Read image data
        let image_data = match read_zip_bytes(archive, image_path) {
            Ok(data) => data,
            Err(_) => continue,
        };

        let (width, height) = get_image_dimensions(&image_data)?;

        // Get label file
        let label_name = replace_ext(image_name, "txt");
        let label_path = format!("labels/{}", label_name);

        let annotations = match read_zip_text(archive, &label_path) {
            Ok(content) => parse_label_file(&content, width, height, is_segmentation),
            Err(_) => Vec::new(),
        };

        images.push(ImageImportData {
            name: image_name.to_string(),
            data: image_data,
            width,
            height,
            annotations,
        });
    }

    Ok(ImportData { classes, images })
}

fn parse_label_file(
    content: &str,
    img_width: u32,
    img_height: u32,
    is_segmentation: bool,
) -> Vec<crate::store::project_file::AnnotationEntry> {
    let mut annotations = Vec::new();
    let w = img_width as f64;
    let h = img_height as f64;

    for line in content.trim().lines() {
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.len() < 5 { continue; }

        let class_id: i64 = match parts[0].parse() {
            Ok(id) => id,
            Err(_) => continue,
        };

        if is_segmentation && parts.len() > 5 {
            // Polygon format: class_id x1 y1 x2 y2 ...
            let mut points = Vec::new();
            let mut i = 1;
            while i + 1 < parts.len() {
                if let (Ok(x), Ok(y)) = (parts[i].parse::<f64>(), parts[i + 1].parse::<f64>()) {
                    points.push(json!({"x": x * w, "y": y * h}));
                }
                i += 2;
            }
            if points.len() >= 3 {
                annotations.push(create_annotation(class_id, "polygon", json!({
                    "points": points,
                    "closed": true,
                })));
            }
        } else {
            // BBox format: class_id x_center y_center width height (normalized)
            if let (Ok(xc), Ok(yc), Ok(bw), Ok(bh)) = (
                parts[1].parse::<f64>(),
                parts[2].parse::<f64>(),
                parts[3].parse::<f64>(),
                parts[4].parse::<f64>(),
            ) {
                let x = ((xc - bw / 2.0) * w).max(0.0);
                let y = ((yc - bh / 2.0) * h).max(0.0);
                annotations.push(create_annotation(class_id, "bbox", json!({
                    "x": x,
                    "y": y,
                    "width": bw * w,
                    "height": bh * h,
                })));
            }
        }
    }

    annotations
}

// ─── Helpers ────────────────────────────────────────────────────────────────

pub fn read_zip_text(archive: &mut ZipArchive<std::fs::File>, name: &str) -> Result<String, String> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.name().eq_ignore_ascii_case(name) || file.name() == name {
            let mut content = String::new();
            file.read_to_string(&mut content).map_err(|e| e.to_string())?;
            return Ok(content);
        }
    }
    Err(format!("Archivo no encontrado: {}", name))
}

pub fn read_zip_bytes(archive: &mut ZipArchive<std::fs::File>, name: &str) -> Result<Vec<u8>, String> {
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.name() == name || file.name().eq_ignore_ascii_case(name) {
            let mut data = Vec::new();
            file.read_to_end(&mut data).map_err(|e| e.to_string())?;
            return Ok(data);
        }
    }
    Err(format!("Archivo no encontrado: {}", name))
}

pub fn list_files_in_folder(archive: &mut ZipArchive<std::fs::File>, folder: &str) -> Vec<String> {
    let prefix = format!("{}/", folder);
    let prefix_lower = prefix.to_lowercase();
    let mut files = Vec::new();

    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index_raw(i) {
            let name = file.name().to_string();
            if name.to_lowercase().starts_with(&prefix_lower) && !name.ends_with('/') {
                files.push(name);
            }
        }
    }
    files
}

pub fn get_image_dimensions(data: &[u8]) -> Result<(u32, u32), String> {
    let img = image::load_from_memory(data)
        .map_err(|e| format!("Error leyendo dimensiones de imagen: {}", e))?;
    Ok((img.width(), img.height()))
}

fn replace_ext(filename: &str, new_ext: &str) -> String {
    match filename.rfind('.') {
        Some(pos) => format!("{}.{}", &filename[..pos], new_ext),
        None => format!("{}.{}", filename, new_ext),
    }
}
