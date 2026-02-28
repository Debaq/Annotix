use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;
use serde_json::json;

use crate::store::project_file::{ProjectFile, ImageEntry};
use crate::utils::converters::mime_type_from_ext;
use super::add_image_to_zip;

pub fn export<F: Fn(f64)>(
    project: &ProjectFile,
    images: &[ImageEntry],
    images_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Build annotations.json
    let images_json: Vec<serde_json::Value> = images.iter().map(|img| {
        let annotations: Vec<serde_json::Value> = img.annotations.iter().map(|ann| {
            json!({
                "type": ann.annotation_type,
                "class": ann.class_id,
                "data": ann.data,
                "metadata": {
                    "source": "manual",
                    "confidence": null,
                    "customLabel": null,
                }
            })
        }).collect();

        json!({
            "name": img.name,
            "originalFileName": img.name,
            "displayName": img.name,
            "mimeType": mime_type_from_ext(&img.name),
            "annotations": annotations,
            "width": img.width,
            "height": img.height,
            "timestamp": img.uploaded,
            "metadata": {
                "uploaded": img.uploaded,
                "annotated": img.annotated,
                "status": img.status,
            }
        })
    }).collect();

    let annotations_json = json!({
        "version": "1.0",
        "project": {
            "name": project.name,
            "type": project.project_type,
            "classes": project.classes.iter().map(|cls| json!({
                "id": cls.id,
                "name": cls.name,
                "color": cls.color,
            })).collect::<Vec<_>>(),
            "preprocessingConfig": {
                "enabled": false,
            },
            "createdAt": project.created,
            "updatedAt": project.updated,
            "metadata": {
                "created": project.created,
                "updated": project.updated,
                "version": format!("{}", project.version),
            }
        },
        "images": images_json,
    });

    let json_content = serde_json::to_string_pretty(&annotations_json).map_err(|e| e.to_string())?;
    zip.start_file("annotations.json", options).map_err(|e| e.to_string())?;
    zip.write_all(json_content.as_bytes()).map_err(|e| e.to_string())?;

    // Add images
    let total = images.len() as f64;
    for (i, image) in images.iter().enumerate() {
        add_image_to_zip(&mut zip, "images", image, images_dir)?;
        emit_progress(((i + 1) as f64 / total) * 100.0);
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
