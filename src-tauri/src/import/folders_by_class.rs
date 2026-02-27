use std::collections::{HashMap, BTreeSet};
use zip::ZipArchive;
use serde_json::json;

use super::{ImportData, ImageImportData, create_class, create_annotation};
use super::yolo::{read_zip_bytes, get_image_dimensions};

pub fn import_data(archive: &mut ZipArchive<std::fs::File>) -> Result<ImportData, String> {
    let image_exts = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];

    // Detect class folders
    let mut folder_names = BTreeSet::new();
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index_raw(i) {
            let name = file.name().to_string();
            let parts: Vec<&str> = name.split('/').collect();
            if parts.len() == 2 && !parts[1].is_empty() {
                let lower_name = parts[1].to_lowercase();
                if image_exts.iter().any(|ext| lower_name.ends_with(ext)) {
                    folder_names.insert(parts[0].to_string());
                }
            }
        }
    }

    if folder_names.len() < 2 {
        return Err("Se necesitan al menos 2 carpetas de clase".to_string());
    }

    let classes: Vec<_> = folder_names.iter().enumerate()
        .map(|(i, name)| create_class(i as i64, name, None))
        .collect();

    // Import images
    let mut images = Vec::new();

    for (class_idx, folder) in folder_names.iter().enumerate() {
        // List images in this folder
        let prefix = format!("{}/", folder);

        for i in 0..archive.len() {
            let file_name = if let Ok(f) = archive.by_index_raw(i) {
                f.name().to_string()
            } else {
                continue;
            };

            if !file_name.starts_with(&prefix) || file_name.ends_with('/') {
                continue;
            }

            let image_name_in_folder = &file_name[prefix.len()..];
            let lower_name = image_name_in_folder.to_lowercase();
            if !image_exts.iter().any(|ext| lower_name.ends_with(ext)) {
                continue;
            }

            let image_data = match read_zip_bytes(archive, &file_name) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let (width, height) = match get_image_dimensions(&image_data) {
                Ok(dims) => dims,
                Err(_) => continue,
            };

            let annotation = create_annotation(class_idx as i64, "classification", json!({
                "labels": [class_idx as i64]
            }));

            images.push(ImageImportData {
                name: format!("{}/{}", folder, image_name_in_folder),
                data: image_data,
                width,
                height,
                annotations: vec![annotation],
            });
        }
    }

    Ok(ImportData { classes, images })
}
