use zip::ZipArchive;
use serde_json::json;

use super::{ImportData, ImageImportData, ImportResult, ImportStats, create_class, create_annotation};
use super::yolo::{read_zip_text, read_zip_bytes, get_image_dimensions};
use crate::store::{AppState, io as store_io};

/// Restaura un .tix completo (con `project.json` en raíz) extrayendo todos los
/// archivos al directorio de proyectos como un proyecto nuevo. Preserva videos,
/// tracks, training_jobs, audio, timeseries, etc. byte-a-byte.
pub fn restore_full_project<F: Fn(&str, f64, usize, usize)>(
    state: &AppState,
    archive: &mut ZipArchive<std::fs::File>,
    project_name: &str,
    emit: F,
) -> Result<ImportResult, String> {
    let projects_dir = state.projects_dir()?;
    let new_id = uuid::Uuid::new_v4().to_string();
    let dest_dir = projects_dir.join(&new_id);
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Error creando directorio del proyecto: {}", e))?;

    let total = archive.len();
    for i in 0..total {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("Error leyendo entrada ZIP: {}", e))?;
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };
        let out_path = dest_dir.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("Error creando dir {:?}: {}", out_path, e))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Error creando dir padre {:?}: {}", parent, e))?;
        }
        let mut out_file = std::fs::File::create(&out_path)
            .map_err(|e| format!("Error creando {:?}: {}", out_path, e))?;
        std::io::copy(&mut entry, &mut out_file)
            .map_err(|e| format!("Error escribiendo {:?}: {}", out_path, e))?;
        if i % 8 == 0 || i + 1 == total {
            let pct = 50.0 + ((i + 1) as f64 / total.max(1) as f64) * 40.0;
            emit("saving", pct, i + 1, total);
        }
    }

    // Reasignar id/nombre/timestamps en project.json
    let pj_path = dest_dir.join("project.json");
    if !pj_path.exists() {
        let _ = std::fs::remove_dir_all(&dest_dir);
        return Err("project.json no encontrado en .tix".to_string());
    }
    let mut pf = store_io::read_project(&dest_dir)
        .map_err(|e| { let _ = std::fs::remove_dir_all(&dest_dir); e })?;

    let now = js_timestamp();
    pf.id = new_id.clone();
    pf.name = project_name.to_string();
    pf.updated = now;
    // Limpiar estado P2P / descarga heredada de la sesión exportada
    pf.p2p = None;
    pf.p2p_download = None;

    let images_count = pf.images.len();
    let classes_count = pf.classes.len();
    let annotations_count: usize = pf.images.iter()
        .map(|i| i.annotations.len())
        .sum::<usize>()
        + pf.videos.iter()
            .map(|v| v.tracks.iter().map(|t| t.keyframes.len()).sum::<usize>())
            .sum::<usize>();

    store_io::write_project(&dest_dir, &pf)?;
    state.insert_into_cache(&new_id, pf, dest_dir);

    emit("done", 100.0, total, total);

    Ok(ImportResult {
        project_id: new_id,
        stats: ImportStats {
            images_count,
            classes_count,
            annotations_count,
        },
    })
}

fn js_timestamp() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

pub fn import_data(
    archive: &mut ZipArchive<std::fs::File>,
    _project_type: &str,
) -> Result<ImportData, String> {
    let content = read_zip_text(archive, "annotations.json")?;
    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Error parseando annotations.json: {}", e))?;

    // Extract classes
    let project_classes = data.get("project")
        .and_then(|p| p.get("classes"))
        .and_then(|c| c.as_array());

    let mut classes: Vec<_> = if let Some(cls_arr) = project_classes {
        cls_arr.iter().enumerate().map(|(i, c)| {
            let id = c.get("id").and_then(|v| v.as_i64()).unwrap_or(i as i64);
            let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
            let color = c.get("color").and_then(|v| v.as_str());
            let description = c.get("description").and_then(|v| v.as_str()).map(|s| s.to_string());
            let mut cls = create_class(id, name, color);
            cls.description = description;
            cls
        }).collect()
    } else {
        vec![create_class(0, "Default", Some("#FF0000"))]
    };

    // Extract images
    let image_entries = data.get("images")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();

    let mut images = Vec::new();

    for entry in &image_entries {
        let name = entry.get("name").and_then(|n| n.as_str()).unwrap_or("");
        if name.is_empty() { continue; }

        // El archivo en disco puede tener prefijo uuid (campo `file`). Fallback a `name` para tix antiguos.
        let file_on_disk = entry.get("file").and_then(|f| f.as_str()).unwrap_or(name);
        let image_data = match read_zip_bytes(archive, &format!("images/{}", file_on_disk)) {
            Ok(d) => d,
            Err(_) => match read_zip_bytes(archive, &format!("images/{}", name)) {
                Ok(d) => d,
                Err(_) => {
                    // Último recurso: buscar en zip cualquier archivo images/* que termine con `_{name}` o `/{name}`
                    let suffix_under = format!("_{}", name);
                    let suffix_slash = format!("/{}", name);
                    let found = archive.file_names()
                        .find(|n| n.starts_with("images/") && (n.ends_with(&suffix_under) || n.ends_with(&suffix_slash)))
                        .map(|s| s.to_string());
                    match found {
                        Some(zip_path) => match read_zip_bytes(archive, &zip_path) {
                            Ok(d) => d,
                            Err(_) => continue,
                        },
                        None => continue,
                    }
                }
            },
        };

        let entry_width = entry.get("width").and_then(|w| w.as_u64()).unwrap_or(0) as u32;
        let entry_height = entry.get("height").and_then(|h| h.as_u64()).unwrap_or(0) as u32;

        let (width, height) = if entry_width > 0 && entry_height > 0 {
            (entry_width, entry_height)
        } else {
            get_image_dimensions(&image_data)?
        };

        // Parse annotations
        let annotations_raw = entry.get("annotations")
            .and_then(|a| a.as_array())
            .cloned()
            .unwrap_or_default();

        let mut annotations = Vec::new();
        for ann in &annotations_raw {
            if let Some(parsed) = parse_tix_annotation(ann) {
                annotations.push(parsed);
            }
        }

        images.push(ImageImportData {
            name: name.to_string(),
            data: image_data,
            width,
            height,
            annotations,
        });
    }

    if classes.is_empty() {
        classes.push(create_class(0, "Default", Some("#FF0000")));
    }

    Ok(ImportData { classes, images })
}

fn parse_tix_annotation(ann: &serde_json::Value) -> Option<crate::store::project_file::AnnotationEntry> {
    let ann_type = ann.get("type").and_then(|t| t.as_str())?;
    let normalized_type = normalize_type(ann_type);

    // Get class ID
    let class_id = ann.get("class").or_else(|| ann.get("classId"))
        .and_then(|v| {
            if let Some(n) = v.as_i64() { return Some(n); }
            if let Some(s) = v.as_str() { return s.parse::<i64>().ok(); }
            None
        })?;

    let data = ann.get("data").cloned().unwrap_or_else(|| json!({}));

    Some(create_annotation(class_id, &normalized_type, data))
}

fn normalize_type(t: &str) -> String {
    match t.to_lowercase().as_str() {
        "box" | "rect" | "rectangle" | "bbox" => "bbox".to_string(),
        "segmentation" | "mask" => "mask".to_string(),
        "polygon" => "polygon".to_string(),
        "keypoint" | "keypoints" => "keypoints".to_string(),
        "landmark" | "landmarks" => "landmarks".to_string(),
        "obb" | "orientedbbox" | "oriented-bbox" | "rotatedbbox" | "rotated-bbox" => "obb".to_string(),
        "multi-label-classification" | "multilabel" | "multilabelclassification" => "classification".to_string(),
        "classification" => "classification".to_string(),
        other => other.to_string(),
    }
}
