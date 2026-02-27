use zip::ZipArchive;
use serde_json::json;
use base64::Engine;

use super::{ImportData, ImageImportData, create_class, create_annotation};
use super::yolo::{read_zip_bytes, list_files_in_folder, get_image_dimensions};

pub fn import_data(archive: &mut ZipArchive<std::fs::File>) -> Result<ImportData, String> {
    let image_files = list_files_in_folder(archive, "images");
    let mask_files = list_files_in_folder(archive, "masks");

    if image_files.is_empty() {
        return Err("No se encontraron imágenes en images/".to_string());
    }
    if mask_files.is_empty() {
        return Err("No se encontraron máscaras en masks/".to_string());
    }

    let classes = vec![
        create_class(0, "background", None),
        create_class(1, "object", None),
    ];

    // Build mask lookup by base name
    let mut mask_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for mask_path in &mask_files {
        let mask_name = mask_path.rsplit('/').next().unwrap_or("");
        let base = strip_ext(mask_name).to_lowercase();
        if !base.is_empty() {
            mask_map.entry(base).or_insert_with(|| mask_path.clone());
        }
    }

    let mut images = Vec::new();

    for image_path in &image_files {
        let image_name = image_path.rsplit('/').next().unwrap_or("");
        if image_name.is_empty() { continue; }

        let image_data = match read_zip_bytes(archive, image_path) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let (width, height) = get_image_dimensions(&image_data)?;

        // Find corresponding mask
        let base_name = strip_ext(image_name).to_lowercase();
        let mut annotations = Vec::new();

        if let Some(mask_path) = mask_map.get(&base_name) {
            if let Ok(mask_data) = read_zip_bytes(archive, mask_path) {
                // Convert mask to base64 PNG
                let engine = base64::engine::general_purpose::STANDARD;
                let b64 = engine.encode(&mask_data);
                let data_uri = format!("data:image/png;base64,{}", b64);

                annotations.push(create_annotation(1, "mask", json!({
                    "base64png": data_uri,
                    "instanceId": 1,
                })));
            }
        }

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

fn strip_ext(filename: &str) -> &str {
    match filename.rfind('.') {
        Some(pos) => &filename[..pos],
        None => filename,
    }
}
