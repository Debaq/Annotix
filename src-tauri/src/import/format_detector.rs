use std::io::Read;
use zip::ZipArchive;

use super::DetectionResult;

pub fn detect(archive: &mut ZipArchive<std::fs::File>) -> Result<DetectionResult, String> {
    let file_names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .collect();
    let lower_files: Vec<String> = file_names.iter().map(|f| f.to_lowercase()).collect();

    // YOLO: classes.txt + data.yaml + labels/
    if has_file(&lower_files, "classes.txt") && has_file(&lower_files, "data.yaml") {
        if let Some(result) = detect_yolo(archive, &lower_files) {
            return Ok(result);
        }
    }

    // U-Net Masks: masks/ + images/
    if has_folder(&lower_files, "masks") && has_folder(&lower_files, "images") {
        if let Some(result) = detect_unet(&lower_files) {
            return Ok(result);
        }
    }

    // TIX: annotations.json con structure TIX (check before COCO)
    if has_file(&lower_files, "annotations.json") && has_folder(&lower_files, "images") {
        if let Some(result) = detect_tix(archive) {
            return Ok(result);
        }
    }

    // COCO: annotations.json with images/annotations/categories
    if has_file(&lower_files, "annotations.json") {
        if let Some(result) = detect_coco(archive) {
            return Ok(result);
        }
    }

    // Pascal VOC: Annotations/ + images/ (or JPEGImages/)
    if has_folder(&lower_files, "annotations") {
        if let Some(result) = detect_pascal_voc(&lower_files) {
            return Ok(result);
        }
    }

    // CSV: annotations.csv
    if has_file(&lower_files, "annotations.csv") {
        if let Some(result) = detect_csv(archive, &lower_files) {
            return Ok(result);
        }
    }

    // Folders by class: directories with images
    if let Some(result) = detect_folders_by_class(&lower_files) {
        return Ok(result);
    }

    Err("No se pudo detectar el formato del dataset".to_string())
}

fn has_file(files: &[String], name: &str) -> bool {
    let target = name.to_lowercase();
    files.iter().any(|f| {
        let f = f.to_lowercase();
        (f == target) || (f.ends_with(&format!("/{}", target)) && !f[..f.len() - target.len() - 1].contains('/'))
    })
}

fn has_folder(files: &[String], folder: &str) -> bool {
    let target = format!("{}/", folder.to_lowercase());
    files.iter().any(|f| f.starts_with(&target))
}

fn read_file_text(archive: &mut ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    // Try exact name first, then case-insensitive
    for i in 0..archive.len() {
        if let Ok(mut file) = archive.by_index(i) {
            if file.name().eq_ignore_ascii_case(name) {
                let mut content = String::new();
                file.read_to_string(&mut content).ok()?;
                return Some(content);
            }
        }
    }
    None
}

fn detect_yolo(archive: &mut ZipArchive<std::fs::File>, files: &[String]) -> Option<DetectionResult> {
    let content = read_file_text(archive, "classes.txt")?;
    let class_count = content.trim().lines().filter(|l| !l.trim().is_empty()).count();

    // Check if segmentation by looking at a label file
    let txt_files: Vec<&String> = files.iter()
        .filter(|f| f.starts_with("labels/") && f.ends_with(".txt"))
        .collect();

    if txt_files.is_empty() {
        return None;
    }

    let label_content = read_file_text(archive, &txt_files[0])?;
    let is_segmentation = detect_segmentation_format(&label_content);

    Some(DetectionResult {
        format: if is_segmentation { "yolo-segmentation".to_string() } else { "yolo-detection".to_string() },
        project_type: if is_segmentation { "polygon".to_string() } else { "bbox".to_string() },
        confidence: 0.95,
        class_count: Some(class_count),
    })
}

fn detect_coco(archive: &mut ZipArchive<std::fs::File>) -> Option<DetectionResult> {
    let content = read_file_text(archive, "annotations.json")?;
    let data: serde_json::Value = serde_json::from_str(&content).ok()?;

    let annotations = data.get("annotations")?.as_array()?;
    let _images = data.get("images")?.as_array()?;
    let categories = data.get("categories")?.as_array()?;

    let has_segmentation = annotations.iter().any(|a| a.get("segmentation").is_some());
    let project_type = if has_segmentation { "instance-segmentation" } else { "bbox" };

    Some(DetectionResult {
        format: "coco".to_string(),
        project_type: project_type.to_string(),
        confidence: 0.95,
        class_count: Some(categories.len()),
    })
}

fn detect_tix(archive: &mut ZipArchive<std::fs::File>) -> Option<DetectionResult> {
    let content = read_file_text(archive, "annotations.json")?;
    let data: serde_json::Value = serde_json::from_str(&content).ok()?;

    // TIX has images array and optionally project.type
    let images = data.get("images")?.as_array()?;
    if images.is_empty() {
        return None;
    }

    // Check if it's COCO format (has annotations+categories arrays at root)
    if data.get("annotations").is_some() && data.get("categories").is_some() {
        return None; // This is COCO, not TIX
    }

    let project_type = data.get("project")
        .and_then(|p| p.get("type"))
        .and_then(|t| t.as_str())
        .map(|t| normalize_project_type(t))
        .unwrap_or_else(|| "bbox".to_string());

    let class_count = data.get("project")
        .and_then(|p| p.get("classes"))
        .and_then(|c| c.as_array())
        .map(|c| c.len());

    Some(DetectionResult {
        format: "tix".to_string(),
        project_type,
        confidence: 0.95,
        class_count,
    })
}

fn detect_pascal_voc(files: &[String]) -> Option<DetectionResult> {
    let xml_files: Vec<&String> = files.iter()
        .filter(|f| f.starts_with("annotations/") && f.ends_with(".xml"))
        .collect();

    if xml_files.is_empty() {
        return None;
    }

    Some(DetectionResult {
        format: "pascal-voc".to_string(),
        project_type: "bbox".to_string(),
        confidence: 0.9,
        class_count: None,
    })
}

fn detect_csv(archive: &mut ZipArchive<std::fs::File>, _files: &[String]) -> Option<DetectionResult> {
    let content = read_file_text(archive, "annotations.csv")?;
    let first_line = content.lines().next()?.to_lowercase();

    let class_count = read_file_text(archive, "classes.csv")
        .map(|c| c.trim().lines().count().saturating_sub(1));

    if first_line.contains("xmin") || first_line.contains("xmax") {
        return Some(DetectionResult {
            format: "csv-detection".to_string(),
            project_type: "bbox".to_string(),
            confidence: 0.9,
            class_count,
        });
    }

    if first_line.contains("keypoint") || first_line.contains("_visible") {
        return Some(DetectionResult {
            format: "csv-keypoints".to_string(),
            project_type: "keypoints".to_string(),
            confidence: 0.9,
            class_count,
        });
    }

    if first_line.contains("landmark") {
        return Some(DetectionResult {
            format: "csv-landmarks".to_string(),
            project_type: "landmarks".to_string(),
            confidence: 0.9,
            class_count,
        });
    }

    if first_line.contains("class") || first_line.contains("label") {
        return Some(DetectionResult {
            format: "csv-classification".to_string(),
            project_type: "classification".to_string(),
            confidence: 0.85,
            class_count,
        });
    }

    None
}

fn detect_unet(files: &[String]) -> Option<DetectionResult> {
    let mask_files: Vec<&String> = files.iter()
        .filter(|f| {
            f.starts_with("masks/") &&
            [".png", ".jpg", ".jpeg", ".bmp", ".webp"].iter().any(|ext| f.ends_with(ext))
        })
        .collect();

    if mask_files.is_empty() {
        return None;
    }

    Some(DetectionResult {
        format: "unet-masks".to_string(),
        project_type: "instance-segmentation".to_string(),
        confidence: 0.9,
        class_count: Some(2),
    })
}

fn detect_folders_by_class(files: &[String]) -> Option<DetectionResult> {
    let image_exts = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
    let mut folders = std::collections::HashSet::new();

    for f in files {
        let parts: Vec<&str> = f.split('/').collect();
        if parts.len() == 2 {
            let filename = parts[1].to_lowercase();
            if image_exts.iter().any(|ext| filename.ends_with(ext)) {
                folders.insert(parts[0].to_string());
            }
        }
    }

    if folders.len() >= 2 {
        Some(DetectionResult {
            format: "folders-by-class".to_string(),
            project_type: "classification".to_string(),
            confidence: 0.85,
            class_count: Some(folders.len()),
        })
    } else {
        None
    }
}

fn detect_segmentation_format(content: &str) -> bool {
    for line in content.trim().lines() {
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.len() > 5 {
            let coord_count = parts.len() - 1;
            if coord_count % 2 == 0 && coord_count >= 6 {
                return true;
            }
        }
    }
    false
}

fn normalize_project_type(t: &str) -> String {
    match t.to_lowercase().as_str() {
        "detection" => "bbox".to_string(),
        "segmentation" => "mask".to_string(),
        "instanceseg" | "instancesegmentation" | "instance-segmentation" => "instance-segmentation".to_string(),
        "multilabel" | "multi-label-classification" => "multi-label-classification".to_string(),
        "keypoint" => "keypoints".to_string(),
        "landmark" => "landmarks".to_string(),
        other => other.to_string(),
    }
}
