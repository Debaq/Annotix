use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;
use serde_json::json;

use crate::store::project_file::ProjectFile;
use crate::utils::converters::mime_type_from_ext;

/// Exporta el proyecto completo como archivo .tix (ZIP):
/// - Copia todo el contenido del directorio del proyecto (project.json, images/, videos/, audio/, thumbnails/, etc.)
/// - Escribe adicionalmente `annotations.json` en la raíz para compatibilidad con el importador.
pub fn export<F: Fn(f64)>(
    project: &ProjectFile,
    project_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 1) Walk project_dir recursivamente y escribir todos los archivos
    let entries = collect_files(project_dir)?;
    let total = entries.len().max(1) as f64;

    for (idx, abs_path) in entries.iter().enumerate() {
        let rel = abs_path.strip_prefix(project_dir).map_err(|e| e.to_string())?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");

        // Saltar annotations.json si existe en disco (lo generamos al final)
        if rel_str == "annotations.json" {
            continue;
        }

        let data = std::fs::read(abs_path)
            .map_err(|e| format!("Error leyendo {}: {}", rel_str, e))?;

        // Usar Stored para binarios ya comprimidos (imágenes, videos, audio), Deflated para el resto
        let opts = if is_binary_media(&rel_str) { stored } else { deflated };

        zip.start_file(&rel_str, opts)
            .map_err(|e| format!("Error creando entrada ZIP {}: {}", rel_str, e))?;
        zip.write_all(&data)
            .map_err(|e| format!("Error escribiendo {} en ZIP: {}", rel_str, e))?;

        emit_progress(((idx + 1) as f64 / total) * 95.0);
    }

    // 2) Escribir annotations.json para compatibilidad con import
    let images_json: Vec<serde_json::Value> = project.images.iter().map(|img| {
        let annotations: Vec<serde_json::Value> = img.annotations.iter().map(|ann| {
            json!({
                "type": ann.annotation_type,
                "class": ann.class_id,
                "data": ann.data,
                "metadata": {
                    "source": ann.source,
                    "confidence": ann.confidence,
                    "modelClassName": ann.model_class_name,
                }
            })
        }).collect();

        json!({
            "name": img.name,
            "file": img.file,
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
                "description": cls.description,
            })).collect::<Vec<_>>(),
            "preprocessingConfig": { "enabled": false },
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
    zip.start_file("annotations.json", deflated).map_err(|e| e.to_string())?;
    zip.write_all(json_content.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    emit_progress(100.0);
    Ok(())
}

fn collect_files(root: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut out = Vec::new();
    walk(root, &mut out)?;
    Ok(out)
}

fn walk(dir: &Path, out: &mut Vec<std::path::PathBuf>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let rd = std::fs::read_dir(dir)
        .map_err(|e| format!("Error listando {}: {}", dir.display(), e))?;
    for entry in rd {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        if ft.is_dir() {
            walk(&path, out)?;
        } else if ft.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

fn is_binary_media(rel: &str) -> bool {
    let lower = rel.to_lowercase();
    let exts = [
        ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff",
        ".mp4", ".mov", ".avi", ".mkv", ".webm",
        ".mp3", ".wav", ".ogg", ".flac", ".m4a",
        ".onnx", ".pt", ".zip",
    ];
    exts.iter().any(|e| lower.ends_with(e))
}
