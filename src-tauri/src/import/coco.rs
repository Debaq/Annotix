use std::collections::HashMap;
use zip::ZipArchive;
use serde_json::json;

use super::{ImportData, ImageImportData, create_class, create_annotation};
use super::yolo::{read_zip_text, read_zip_bytes, list_files_in_folder, get_image_dimensions};

pub fn import_data(
    archive: &mut ZipArchive<std::fs::File>,
    project_type: &str,
) -> Result<ImportData, String> {
    let content = read_zip_text(archive, "annotations.json")?;
    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Error parseando annotations.json: {}", e))?;

    let categories = data.get("categories")
        .and_then(|c| c.as_array())
        .ok_or("Falta 'categories' en el formato COCO")?;

    let coco_images = data.get("images")
        .and_then(|i| i.as_array())
        .ok_or("Falta 'images' en el formato COCO")?;

    let annotations_arr = data.get("annotations")
        .and_then(|a| a.as_array())
        .ok_or("Falta 'annotations' en el formato COCO")?;

    // Create classes (COCO IDs start at 1, we remap to 0-based)
    let classes: Vec<_> = categories.iter().map(|cat| {
        let id = cat.get("id").and_then(|i| i.as_i64()).unwrap_or(0) - 1;
        let name = cat.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
        create_class(id, name, None)
    }).collect();

    // Group annotations by image_id
    let mut anns_by_image: HashMap<i64, Vec<&serde_json::Value>> = HashMap::new();
    for ann in annotations_arr {
        if let Some(img_id) = ann.get("image_id").and_then(|i| i.as_i64()) {
            anns_by_image.entry(img_id).or_default().push(ann);
        }
    }

    let mut images = Vec::new();

    for coco_img in coco_images {
        let img_id = coco_img.get("id").and_then(|i| i.as_i64()).unwrap_or(0);
        let file_name = coco_img.get("file_name").and_then(|f| f.as_str()).unwrap_or("");
        let coco_w = coco_img.get("width").and_then(|w| w.as_u64()).unwrap_or(0) as u32;
        let coco_h = coco_img.get("height").and_then(|h| h.as_u64()).unwrap_or(0) as u32;

        if file_name.is_empty() { continue; }

        let image_path = format!("images/{}", file_name);
        let image_data = match read_zip_bytes(archive, &image_path) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let (width, height) = if coco_w > 0 && coco_h > 0 {
            (coco_w, coco_h)
        } else {
            get_image_dimensions(&image_data)?
        };

        // Parse annotations for this image
        let coco_anns = anns_by_image.get(&img_id).map(|v| v.as_slice()).unwrap_or(&[]);
        let annotations = parse_coco_annotations(coco_anns, project_type);

        images.push(ImageImportData {
            name: file_name.to_string(),
            data: image_data,
            width,
            height,
            annotations,
        });
    }

    Ok(ImportData { classes, images })
}

fn parse_coco_annotations(
    coco_anns: &[&serde_json::Value],
    _project_type: &str,
) -> Vec<crate::db::models::Annotation> {
    let mut annotations = Vec::new();

    for ann in coco_anns {
        let category_id = ann.get("category_id").and_then(|c| c.as_i64()).unwrap_or(0) - 1;

        // Keypoints
        if let Some(kps) = ann.get("keypoints").and_then(|k| k.as_array()) {
            if !kps.is_empty() {
                let mut points = Vec::new();
                let mut i = 0;
                while i + 2 < kps.len() {
                    let x = kps[i].as_f64().unwrap_or(0.0);
                    let y = kps[i + 1].as_f64().unwrap_or(0.0);
                    let v = kps[i + 2].as_f64().unwrap_or(0.0);
                    points.push(json!({
                        "x": x, "y": y,
                        "visible": v > 0.0,
                        "name": format!("keypoint_{}", i / 3)
                    }));
                    i += 3;
                }
                annotations.push(create_annotation(category_id, "keypoints", json!({
                    "points": points,
                    "skeletonType": "coco-17"
                })));
                continue;
            }
        }

        // Segmentation
        if let Some(seg) = ann.get("segmentation").and_then(|s| s.as_array()) {
            if !seg.is_empty() {
                if let Some(first) = seg[0].as_array() {
                    if first.len() >= 6 {
                        let mut points = Vec::new();
                        let mut i = 0;
                        while i + 1 < first.len() {
                            let x = first[i].as_f64().unwrap_or(0.0);
                            let y = first[i + 1].as_f64().unwrap_or(0.0);
                            points.push(json!({"x": x, "y": y}));
                            i += 2;
                        }
                        annotations.push(create_annotation(category_id, "polygon", json!({
                            "points": points,
                            "closed": true,
                        })));
                        continue;
                    }
                }
            }
        }

        // BBox
        if let Some(bbox) = ann.get("bbox").and_then(|b| b.as_array()) {
            if bbox.len() >= 4 {
                let x = bbox[0].as_f64().unwrap_or(0.0);
                let y = bbox[1].as_f64().unwrap_or(0.0);
                let w = bbox[2].as_f64().unwrap_or(0.0);
                let h = bbox[3].as_f64().unwrap_or(0.0);
                annotations.push(create_annotation(category_id, "bbox", json!({
                    "x": x, "y": y, "width": w, "height": h,
                })));
            }
        }
    }

    annotations
}
