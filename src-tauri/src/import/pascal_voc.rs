use std::collections::HashMap;
use zip::ZipArchive;
use serde_json::json;

use super::{ImportData, ImageImportData, create_class, create_annotation};
use super::yolo::{read_zip_text, read_zip_bytes, list_files_in_folder, get_image_dimensions};

pub fn import_data(archive: &mut ZipArchive<std::fs::File>) -> Result<ImportData, String> {
    let image_files = list_files_in_folder(archive, "images");
    // Also check JPEGImages (standard Pascal VOC folder name)
    let image_files = if image_files.is_empty() {
        list_files_in_folder(archive, "JPEGImages")
    } else {
        image_files
    };

    if image_files.is_empty() {
        return Err("No se encontraron imágenes".to_string());
    }

    let xml_files = list_files_in_folder(archive, "Annotations");

    let mut class_map: HashMap<String, i64> = HashMap::new();
    let mut next_class_id: i64 = 0;
    let mut images = Vec::new();

    for image_path in &image_files {
        let image_name = image_path.rsplit('/').next().unwrap_or(image_path);
        if image_name.is_empty() { continue; }

        let image_data = match read_zip_bytes(archive, image_path) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let (width, height) = get_image_dimensions(&image_data)?;

        // Find XML annotation
        let xml_name = replace_ext(image_name, "xml");
        let xml_path = format!("Annotations/{}", xml_name);

        let annotations = match read_zip_text(archive, &xml_path) {
            Ok(content) => parse_voc_xml(&content, &mut class_map, &mut next_class_id),
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

    // Build class definitions
    let mut classes: Vec<_> = class_map.iter()
        .map(|(name, &id)| create_class(id, name, None))
        .collect();
    classes.sort_by_key(|c| c.id);

    Ok(ImportData { classes, images })
}

fn parse_voc_xml(
    xml_content: &str,
    class_map: &mut HashMap<String, i64>,
    next_class_id: &mut i64,
) -> Vec<crate::db::models::Annotation> {
    let mut annotations = Vec::new();

    // Simple XML parsing without full DOM
    for obj_match in split_xml_elements(xml_content, "object") {
        let name = extract_xml_value(&obj_match, "name").unwrap_or_default();
        if name.is_empty() { continue; }

        // Get or create class
        let class_id = if let Some(&id) = class_map.get(&name) {
            id
        } else {
            let id = *next_class_id;
            class_map.insert(name.clone(), id);
            *next_class_id += 1;
            id
        };

        // Parse bndbox
        if let Some(bndbox) = extract_xml_block(&obj_match, "bndbox") {
            let xmin = extract_xml_value(&bndbox, "xmin").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
            let ymin = extract_xml_value(&bndbox, "ymin").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
            let xmax = extract_xml_value(&bndbox, "xmax").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);
            let ymax = extract_xml_value(&bndbox, "ymax").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0);

            annotations.push(create_annotation(class_id, "bbox", json!({
                "x": xmin,
                "y": ymin,
                "width": xmax - xmin,
                "height": ymax - ymin,
            })));
        }
    }

    annotations
}

// Simple XML helpers (no full parser needed for VOC format)
fn split_xml_elements(xml: &str, tag: &str) -> Vec<String> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let mut results = Vec::new();
    let mut search_from = 0;

    while let Some(start) = xml[search_from..].find(&open) {
        let abs_start = search_from + start;
        if let Some(end) = xml[abs_start..].find(&close) {
            let abs_end = abs_start + end + close.len();
            results.push(xml[abs_start..abs_end].to_string());
            search_from = abs_end;
        } else {
            break;
        }
    }

    results
}

fn extract_xml_value(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(xml[start..end].trim().to_string())
}

fn extract_xml_block(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)?;
    let end = xml[start..].find(&close)? + start + close.len();
    Some(xml[start..end].to_string())
}

fn replace_ext(filename: &str, new_ext: &str) -> String {
    match filename.rfind('.') {
        Some(pos) => format!("{}.{}", &filename[..pos], new_ext),
        None => format!("{}.{}", filename, new_ext),
    }
}
