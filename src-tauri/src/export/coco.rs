use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;
use serde_json::json;

use crate::store::project_file::{ProjectFile, ImageEntry, AnnotationEntry};
use crate::utils::converters::{obb_to_aabbox, polygon_area};
use super::{parse_bbox, parse_obb, parse_polygon, parse_keypoints, add_image_to_zip};

/// COCO-17 skeleton data
const COCO17_POINTS: &[&str] = &[
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
];

const COCO17_CONNECTIONS: &[[usize; 2]] = &[
    [0, 1], [0, 2], [1, 3], [2, 4], [0, 5], [0, 6],
    [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
    [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
];

pub fn export<F: Fn(f64)>(
    project: &ProjectFile,
    images: &[ImageEntry],
    images_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let now = chrono::Utc::now().to_rfc3339();

    // Build categories
    let categories: Vec<serde_json::Value> = project.classes.iter().map(|cls| {
        let mut cat = json!({
            "id": cls.id,
            "name": cls.name,
            "supercategory": "none"
        });
        if project.project_type == "keypoints" {
            cat["keypoints"] = json!(COCO17_POINTS);
            cat["skeleton"] = json!(COCO17_CONNECTIONS);
        }
        cat
    }).collect();

    let mut coco_images = Vec::new();
    let mut coco_annotations = Vec::new();
    let mut annotation_id = 1_i64;
    let total = images.len() as f64;

    for (i, image) in images.iter().enumerate() {
        let image_id = (i + 1) as i64;

        coco_images.push(json!({
            "id": image_id,
            "width": image.width,
            "height": image.height,
            "file_name": image.name,
            "date_captured": now,
        }));

        // Add image to ZIP
        add_image_to_zip(&mut zip, "images", image, images_dir)?;

        // Process annotations
        for ann in &image.annotations {
            if let Some(coco_ann) = convert_annotation(ann, image_id, annotation_id, image.width, image.height) {
                coco_annotations.push(coco_ann);
                annotation_id += 1;
            }
        }

        emit_progress(((i + 1) as f64 / total) * 100.0);
    }

    let dataset = json!({
        "info": {
            "description": format!("{} - COCO format dataset", project.name),
            "version": "1.0",
            "year": chrono::Utc::now().format("%Y").to_string().parse::<i32>().unwrap_or(2026),
            "contributor": "Annotix - TecMedHub FabLab",
            "date_created": now,
        },
        "licenses": [],
        "images": coco_images,
        "annotations": coco_annotations,
        "categories": categories,
    });

    let json_content = serde_json::to_string_pretty(&dataset).map_err(|e| e.to_string())?;
    zip.start_file("annotations.json", options).map_err(|e| e.to_string())?;
    zip.write_all(json_content.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn convert_annotation(
    ann: &AnnotationEntry,
    image_id: i64,
    annotation_id: i64,
    _img_width: u32,
    _img_height: u32,
) -> Option<serde_json::Value> {
    let mut base = json!({
        "id": annotation_id,
        "image_id": image_id,
        "category_id": ann.class_id,
        "iscrowd": 0,
    });

    match ann.annotation_type.as_str() {
        "bbox" => {
            let bbox = parse_bbox(&ann.data)?;
            base["bbox"] = json!([bbox.x, bbox.y, bbox.width, bbox.height]);
            base["area"] = json!(bbox.width * bbox.height);
            Some(base)
        }
        "polygon" => {
            let poly = parse_polygon(&ann.data)?;
            let flat: Vec<f64> = poly.points.iter().flat_map(|&(x, y)| [x, y]).collect();
            base["segmentation"] = json!([flat]);

            let (mut min_x, mut min_y) = (f64::MAX, f64::MAX);
            let (mut max_x, mut max_y) = (f64::MIN, f64::MIN);
            for &(x, y) in &poly.points {
                if x < min_x { min_x = x; }
                if y < min_y { min_y = y; }
                if x > max_x { max_x = x; }
                if y > max_y { max_y = y; }
            }

            base["bbox"] = json!([min_x, min_y, max_x - min_x, max_y - min_y]);
            base["area"] = json!(polygon_area(&poly.points));
            Some(base)
        }
        "keypoints" => {
            let kps = parse_keypoints(&ann.data)?;
            let mut flat = Vec::new();
            let mut num_keypoints = 0;

            for p in &kps.points {
                flat.push(p.x);
                flat.push(p.y);
                flat.push(if p.visible { 2.0 } else { 0.0 });
                if p.visible {
                    num_keypoints += 1;
                }
            }

            base["keypoints"] = json!(flat);
            base["num_keypoints"] = json!(num_keypoints);

            // Calculate bbox from visible keypoints
            let visible: Vec<_> = kps.points.iter().filter(|p| p.visible).collect();
            if !visible.is_empty() {
                let min_x = visible.iter().map(|p| p.x).fold(f64::MAX, f64::min);
                let min_y = visible.iter().map(|p| p.y).fold(f64::MAX, f64::min);
                let max_x = visible.iter().map(|p| p.x).fold(f64::MIN, f64::max);
                let max_y = visible.iter().map(|p| p.y).fold(f64::MIN, f64::max);
                base["bbox"] = json!([min_x, min_y, max_x - min_x, max_y - min_y]);
                base["area"] = json!((max_x - min_x) * (max_y - min_y));
            }

            Some(base)
        }
        "obb" => {
            let obb = parse_obb(&ann.data)?;
            let (min_x, min_y, max_x, max_y) = obb_to_aabbox(obb.x, obb.y, obb.width, obb.height, obb.rotation);
            base["bbox"] = json!([min_x, min_y, max_x - min_x, max_y - min_y]);
            base["area"] = json!((max_x - min_x) * (max_y - min_y));
            Some(base)
        }
        _ => None,
    }
}
