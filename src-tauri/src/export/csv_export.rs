use std::collections::{BTreeSet, HashSet};
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::store::project_file::{ProjectFile, ImageEntry, AnnotationEntry};
use crate::utils::converters::obb_to_aabbox;
use super::{parse_bbox, parse_obb, parse_landmarks, parse_keypoints, class_name, add_image_to_zip};

pub fn export<F: Fn(f64)>(
    project: &ProjectFile,
    images: &[ImageEntry],
    images_dir: &Path,
    file: std::fs::File,
    format: &str,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Add images
    for image in images {
        add_image_to_zip(&mut zip, "images", image, images_dir)?;
    }

    // Generate CSV
    let csv_content = match format {
        "detection" => generate_detection_csv(images, project),
        "landmarks" => generate_landmarks_csv(images, project),
        "keypoints" => generate_keypoints_csv(images, project),
        "classification" => generate_classification_csv(images, project),
        _ => return Err(format!("Formato CSV no soportado: {}", format)),
    };

    zip.start_file("annotations.csv", options).map_err(|e| e.to_string())?;
    zip.write_all(csv_content.as_bytes()).map_err(|e| e.to_string())?;

    // classes.csv
    let mut classes_csv = "id,name\n".to_string();
    for cls in &project.classes {
        classes_csv.push_str(&format!("{},{}\n", cls.id, cls.name));
    }
    zip.start_file("classes.csv", options).map_err(|e| e.to_string())?;
    zip.write_all(classes_csv.as_bytes()).map_err(|e| e.to_string())?;

    emit_progress(100.0);
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn generate_detection_csv(images: &[ImageEntry], project: &ProjectFile) -> String {
    let mut rows = vec!["filename,width,height,class,xmin,ymin,xmax,ymax".to_string()];

    for image in images {
        let bbox_anns: Vec<&AnnotationEntry> = image.annotations.iter()
            .filter(|a| a.annotation_type == "bbox" || a.annotation_type == "obb")
            .collect();

        if bbox_anns.is_empty() {
            rows.push(format!("{},{},{},,,,,", image.name, image.width, image.height));
        } else {
            for ann in bbox_anns {
                let name = class_name(&project.classes, ann.class_id);
                if let Some((xmin, ymin, xmax, ymax)) = get_bbox_coords(ann) {
                    rows.push(format!(
                        "{},{},{},{},{},{},{},{}",
                        image.name, image.width, image.height, name,
                        xmin.round() as i64, ymin.round() as i64,
                        xmax.round() as i64, ymax.round() as i64
                    ));
                }
            }
        }
    }

    rows.join("\n")
}

fn generate_landmarks_csv(images: &[ImageEntry], project: &ProjectFile) -> String {
    // Collect all unique landmark names
    let mut landmark_names = BTreeSet::new();
    for image in images {
        for ann in &image.annotations {
            if ann.annotation_type == "landmarks" {
                if let Some(data) = parse_landmarks(&ann.data) {
                    for p in &data.points {
                        landmark_names.insert(p.name.clone());
                    }
                }
            }
        }
    }

    let sorted_names: Vec<String> = landmark_names.into_iter().collect();

    // Header
    let mut header = vec!["filename".to_string(), "width".to_string(), "height".to_string(), "class".to_string()];
    for name in &sorted_names {
        header.push(format!("{}_x", name));
        header.push(format!("{}_y", name));
    }
    let mut rows = vec![header.join(",")];

    // Data
    for image in images {
        let landmark_anns: Vec<&AnnotationEntry> = image.annotations.iter()
            .filter(|a| a.annotation_type == "landmarks")
            .collect();

        if landmark_anns.is_empty() {
            let mut cols = vec![
                image.name.clone(),
                image.width.to_string(),
                image.height.to_string(),
                String::new(),
            ];
            for _ in 0..sorted_names.len() * 2 {
                cols.push(String::new());
            }
            rows.push(cols.join(","));
        } else {
            for ann in landmark_anns {
                let name = class_name(&project.classes, ann.class_id);
                let mut cols = vec![
                    image.name.clone(),
                    image.width.to_string(),
                    image.height.to_string(),
                    name,
                ];

                if let Some(data) = parse_landmarks(&ann.data) {
                    for lm_name in &sorted_names {
                        if let Some(point) = data.points.iter().find(|p| &p.name == lm_name) {
                            cols.push(format!("{:.2}", point.x));
                            cols.push(format!("{:.2}", point.y));
                        } else {
                            cols.push(String::new());
                            cols.push(String::new());
                        }
                    }
                } else {
                    for _ in 0..sorted_names.len() * 2 {
                        cols.push(String::new());
                    }
                }

                rows.push(cols.join(","));
            }
        }
    }

    rows.join("\n")
}

fn generate_keypoints_csv(images: &[ImageEntry], project: &ProjectFile) -> String {
    // Collect all unique keypoint names
    let mut kp_names = BTreeSet::new();
    for image in images {
        for ann in &image.annotations {
            if ann.annotation_type == "keypoints" {
                if let Some(data) = parse_keypoints(&ann.data) {
                    for p in &data.points {
                        if !p.name.is_empty() {
                            kp_names.insert(p.name.clone());
                        }
                    }
                }
            }
        }
    }

    let sorted_names: Vec<String> = kp_names.into_iter().collect();

    // Header
    let mut header = vec![
        "filename".to_string(), "width".to_string(), "height".to_string(),
        "class".to_string(), "instance_id".to_string(),
    ];
    for name in &sorted_names {
        header.push(format!("{}_x", name));
        header.push(format!("{}_y", name));
        header.push(format!("{}_visible", name));
    }
    let mut rows = vec![header.join(",")];

    // Data
    for image in images {
        let kp_anns: Vec<&AnnotationEntry> = image.annotations.iter()
            .filter(|a| a.annotation_type == "keypoints")
            .collect();

        if kp_anns.is_empty() {
            let mut cols = vec![
                image.name.clone(),
                image.width.to_string(),
                image.height.to_string(),
                String::new(),
                String::new(),
            ];
            for _ in 0..sorted_names.len() * 3 {
                cols.push(String::new());
            }
            rows.push(cols.join(","));
        } else {
            for ann in kp_anns {
                let name = class_name(&project.classes, ann.class_id);

                if let Some(data) = parse_keypoints(&ann.data) {
                    let mut cols = vec![
                        image.name.clone(),
                        image.width.to_string(),
                        image.height.to_string(),
                        name,
                        data.instance_id.unwrap_or(1).to_string(),
                    ];

                    for kp_name in &sorted_names {
                        if let Some(point) = data.points.iter().find(|p| &p.name == kp_name) {
                            if point.visible {
                                cols.push(format!("{:.2}", point.x));
                                cols.push(format!("{:.2}", point.y));
                                cols.push("1".to_string());
                            } else {
                                cols.push(String::new());
                                cols.push(String::new());
                                cols.push("0".to_string());
                            }
                        } else {
                            cols.push(String::new());
                            cols.push(String::new());
                            cols.push("0".to_string());
                        }
                    }

                    rows.push(cols.join(","));
                }
            }
        }
    }

    rows.join("\n")
}

fn generate_classification_csv(images: &[ImageEntry], project: &ProjectFile) -> String {
    let mut rows = vec!["filename,class".to_string()];

    for image in images {
        let class_anns: Vec<&AnnotationEntry> = image.annotations.iter()
            .filter(|a| a.annotation_type == "classification" || a.annotation_type == "multi-label-classification")
            .collect();

        if !class_anns.is_empty() {
            let class_names: Vec<String> = class_anns.iter()
                .map(|a| class_name(&project.classes, a.class_id))
                .filter(|n| n != "unknown")
                .collect::<Vec<_>>();
            // Deduplicate while preserving order
            let mut seen = HashSet::new();
            let unique: Vec<&str> = class_names.iter()
                .filter(|n| seen.insert(n.as_str()))
                .map(|s| s.as_str())
                .collect();
            rows.push(format!("{},{}", image.name, unique.join(";")));
        } else if !image.annotations.is_empty() {
            let name = class_name(&project.classes, image.annotations[0].class_id);
            rows.push(format!("{},{}", image.name, name));
        } else {
            rows.push(format!("{},", image.name));
        }
    }

    rows.join("\n")
}

fn get_bbox_coords(ann: &AnnotationEntry) -> Option<(f64, f64, f64, f64)> {
    match ann.annotation_type.as_str() {
        "bbox" => {
            let bbox = parse_bbox(&ann.data)?;
            Some((bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height))
        }
        "obb" => {
            let obb = parse_obb(&ann.data)?;
            Some(obb_to_aabbox(obb.x, obb.y, obb.width, obb.height, obb.rotation))
        }
        _ => None,
    }
}
