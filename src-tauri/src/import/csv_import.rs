use std::collections::HashMap;
use zip::ZipArchive;
use serde_json::json;

use super::{ImportData, ImageImportData, create_class, create_annotation};
use super::yolo::{read_zip_text, read_zip_bytes, list_files_in_folder, get_image_dimensions};

pub fn import_data(
    archive: &mut ZipArchive<std::fs::File>,
    csv_type: &str,
) -> Result<ImportData, String> {
    // Read classes.csv
    let classes_content = read_zip_text(archive, "classes.csv")?;
    let class_lines: Vec<&str> = classes_content.trim().lines().collect();

    let mut classes = Vec::new();
    for (i, line) in class_lines.iter().enumerate() {
        if i == 0 { continue; } // Skip header
        let parts: Vec<&str> = line.splitn(2, ',').collect();
        if parts.len() >= 2 {
            classes.push(create_class(classes.len() as i64, parts[1].trim(), None));
        } else if !line.trim().is_empty() {
            classes.push(create_class(classes.len() as i64, line.trim(), None));
        }
    }

    // Read annotations.csv
    let annot_content = read_zip_text(archive, "annotations.csv")?;
    let annot_lines: Vec<&str> = annot_content.trim().lines().collect();

    if annot_lines.len() < 2 {
        return Err("No hay anotaciones en annotations.csv".to_string());
    }

    let header: Vec<String> = annot_lines[0].split(',').map(|s| s.trim().to_string()).collect();

    // Map image files
    let image_files = list_files_in_folder(archive, "images");
    let mut image_map: HashMap<String, String> = HashMap::new();
    for path in &image_files {
        if let Some(name) = path.rsplit('/').next() {
            image_map.insert(name.to_string(), path.clone());
        }
    }

    // Process annotation rows
    let mut images_map: HashMap<String, ImageImportData> = HashMap::new();

    for i in 1..annot_lines.len() {
        let line = annot_lines[i].trim();
        if line.is_empty() { continue; }

        let values: Vec<&str> = line.split(',').collect();
        if values.is_empty() { continue; }

        let image_name = values[0].trim();
        let image_path = match image_map.get(image_name) {
            Some(p) => p.clone(),
            None => continue,
        };

        // Load image if not already loaded
        if !images_map.contains_key(image_name) {
            let image_data = match read_zip_bytes(archive, &image_path) {
                Ok(d) => d,
                Err(_) => continue,
            };
            let (width, height) = match get_image_dimensions(&image_data) {
                Ok(dims) => dims,
                Err(_) => continue,
            };
            images_map.insert(image_name.to_string(), ImageImportData {
                name: image_name.to_string(),
                data: image_data,
                width,
                height,
                annotations: Vec::new(),
            });
        }

        // Parse annotation based on type
        let annotation = parse_annotation(csv_type, &header, &values, &classes);
        if let Some(ann) = annotation {
            if let Some(img) = images_map.get_mut(image_name) {
                img.annotations.push(ann);
            }
        }
    }

    let images: Vec<ImageImportData> = images_map.into_values().collect();

    Ok(ImportData { classes, images })
}

fn parse_annotation(
    csv_type: &str,
    header: &[String],
    values: &[&str],
    classes: &[crate::store::project_file::ClassDef],
) -> Option<crate::store::project_file::AnnotationEntry> {
    match csv_type {
        "detection" => {
            let class_idx = find_col(header, &["class", "label"])?;
            let xmin_idx = find_col(header, &["xmin"])?;
            let ymin_idx = find_col(header, &["ymin"])?;
            let xmax_idx = find_col(header, &["xmax"])?;
            let ymax_idx = find_col(header, &["ymax"])?;

            let class_name = values.get(class_idx)?.trim();
            let class_id = classes.iter().find(|c| c.name == class_name)?.id;

            let xmin: f64 = values.get(xmin_idx)?.trim().parse().ok()?;
            let ymin: f64 = values.get(ymin_idx)?.trim().parse().ok()?;
            let xmax: f64 = values.get(xmax_idx)?.trim().parse().ok()?;
            let ymax: f64 = values.get(ymax_idx)?.trim().parse().ok()?;

            Some(create_annotation(class_id, "bbox", json!({
                "x": xmin, "y": ymin,
                "width": xmax - xmin, "height": ymax - ymin,
            })))
        }
        "classification" => {
            let class_idx = find_col(header, &["class", "label"])?;
            let class_name = values.get(class_idx)?.trim();
            let class_id = classes.iter().find(|c| c.name == class_name)?.id;

            Some(create_annotation(class_id, "classification", json!({
                "labels": [class_id]
            })))
        }
        _ => None, // keypoints y landmarks son formatos complejos, se manejan con el CSV parser básico
    }
}

fn find_col(header: &[String], candidates: &[&str]) -> Option<usize> {
    for candidate in candidates {
        if let Some(idx) = header.iter().position(|h| h.to_lowercase() == *candidate) {
            return Some(idx);
        }
    }
    None
}
