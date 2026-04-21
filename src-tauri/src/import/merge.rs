use serde::{Deserialize, Serialize};
use zip::ZipArchive;

use super::{ImportResult, ImportStats};
use crate::store::project_file::ClassDef;
use crate::store::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeClassInfo {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub annotation_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeProject {
    pub path: String,
    pub name: String,
    pub project_type: String,
    pub classes: Vec<AnalyzeClassInfo>,
    pub image_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResult {
    pub projects: Vec<AnalyzeProject>,
    /// True si todos los proyectos comparten el mismo project_type.
    pub same_type: bool,
    /// project_type canónico (el del primero). Solo útil si `same_type`.
    pub project_type: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalClass {
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// Mapeo: para el proyecto `project_index` (índice en `paths`), la clase con
/// `source_class_id` se remapea al `target_canonical_index` (índice en canonical_classes).
/// Si `target_canonical_index` es negativo, las anotaciones se descartan.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassMapping {
    pub project_index: usize,
    pub source_class_id: i64,
    pub target_canonical_index: i64,
}

pub fn analyze(paths: Vec<String>) -> Result<AnalyzeResult, String> {
    if paths.is_empty() {
        return Err("No se proporcionaron archivos .tix".into());
    }

    let mut projects: Vec<AnalyzeProject> = Vec::with_capacity(paths.len());
    let mut warnings: Vec<String> = Vec::new();

    for path in &paths {
        let file = std::fs::File::open(path)
            .map_err(|e| format!("Error abriendo {}: {}", path, e))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("Error leyendo ZIP {}: {}", path, e))?;

        let content = super::yolo::read_zip_text(&mut archive, "annotations.json")
            .map_err(|e| format!("{}: {}", path, e))?;
        let data: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Error parseando annotations.json de {}: {}", path, e))?;

        let project_obj = data.get("project");
        let name = project_obj
            .and_then(|p| p.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("(sin nombre)")
            .to_string();
        let project_type = project_obj
            .and_then(|p| p.get("type"))
            .and_then(|v| v.as_str())
            .unwrap_or("bbox")
            .to_string();

        let mut classes: Vec<AnalyzeClassInfo> = project_obj
            .and_then(|p| p.get("classes"))
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .enumerate()
                    .map(|(i, c)| AnalyzeClassInfo {
                        id: c.get("id").and_then(|v| v.as_i64()).unwrap_or(i as i64),
                        name: c
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        color: c
                            .get("color")
                            .and_then(|v| v.as_str())
                            .unwrap_or("#CCCCCC")
                            .to_string(),
                        description: c
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        annotation_count: 0,
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Conteo de anotaciones por clase: scan images[].annotations[].classId
        // + timeseries[].annotations[].classId + videos[].tracks[].keyframes[].classId
        let mut counts: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
        let mut count_from = |arr_name: &str, ann_path: &[&str]| {
            if let Some(arr) = data.get(arr_name).and_then(|v| v.as_array()) {
                for item in arr {
                    let mut node: &serde_json::Value = item;
                    let mut ok = true;
                    for seg in ann_path {
                        if let Some(next) = node.get(*seg) {
                            node = next;
                        } else {
                            ok = false;
                            break;
                        }
                    }
                    if !ok {
                        continue;
                    }
                    if let Some(anns) = node.as_array() {
                        for a in anns {
                            let cid = a
                                .get("classId")
                                .or_else(|| a.get("class_id"))
                                .or_else(|| a.get("class"))
                                .and_then(|v| v.as_i64());
                            if let Some(cid) = cid {
                                *counts.entry(cid).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }
        };
        count_from("images", &["annotations"]);
        count_from("timeseries", &["annotations"]);
        // Videos: tracks → class_id directo (una track = una etiqueta)
        if let Some(vids) = data.get("videos").and_then(|v| v.as_array()) {
            for v in vids {
                if let Some(tracks) = v.get("tracks").and_then(|t| t.as_array()) {
                    for t in tracks {
                        let cid = t
                            .get("classId")
                            .or_else(|| t.get("class_id"))
                            .or_else(|| t.get("class"))
                            .and_then(|v| v.as_i64());
                        if let Some(cid) = cid {
                            *counts.entry(cid).or_insert(0) += 1;
                        }
                    }
                }
            }
        }
        for c in classes.iter_mut() {
            c.annotation_count = *counts.get(&c.id).unwrap_or(&0);
        }

        let image_count = data
            .get("images")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        projects.push(AnalyzeProject {
            path: path.clone(),
            name,
            project_type,
            classes,
            image_count,
        });
    }

    let first_type = projects[0].project_type.clone();
    let same_type = projects.iter().all(|p| p.project_type == first_type);
    if !same_type {
        warnings.push(format!(
            "Los proyectos tienen tipos distintos ({}). Solo se soporta fusión del mismo tipo.",
            projects
                .iter()
                .map(|p| p.project_type.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    Ok(AnalyzeResult {
        projects,
        same_type,
        project_type: first_type,
        warnings,
    })
}

pub fn merge<F: Fn(f64)>(
    state: &AppState,
    paths: Vec<String>,
    canonical_classes: Vec<CanonicalClass>,
    mappings: Vec<ClassMapping>,
    project_name: String,
    emit_progress: F,
) -> Result<ImportResult, String> {
    if paths.is_empty() {
        return Err("No se proporcionaron archivos .tix".into());
    }
    if canonical_classes.is_empty() {
        return Err("Debe haber al menos una clase canónica".into());
    }

    emit_progress(2.0);

    // Verificar tipo común
    let analysis = analyze(paths.clone())?;
    if !analysis.same_type {
        return Err("Los proyectos no comparten el mismo tipo — no se puede fusionar".into());
    }
    let project_type = analysis.project_type.clone();

    // Construir índice de mapeos: (project_index, source_class_id) -> Option<canonical_index>
    use std::collections::HashMap;
    let mut map_idx: HashMap<(usize, i64), i64> = HashMap::new();
    for m in &mappings {
        map_idx.insert((m.project_index, m.source_class_id), m.target_canonical_index);
    }

    // Crear ClassDef canónicos
    let classes: Vec<ClassDef> = canonical_classes
        .iter()
        .enumerate()
        .map(|(i, c)| ClassDef {
            id: i as i64,
            name: c.name.clone(),
            color: c.color.clone(),
            description: c.description.clone(),
        })
        .collect();

    emit_progress(8.0);

    let project_id = state.create_project(&project_name, &project_type, &classes, None)?;

    // Progreso: reservar 8..100 para iterar proyectos
    let n_projects = paths.len() as f64;
    let mut total_images = 0usize;
    let mut total_annotations = 0usize;
    let mut dropped_annotations = 0usize;

    for (proj_idx, path) in paths.iter().enumerate() {
        let file = std::fs::File::open(path)
            .map_err(|e| format!("Error abriendo {}: {}", path, e))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("Error leyendo ZIP {}: {}", path, e))?;

        let import_data = super::tix::import_data(&mut archive, &project_type)?;
        let n_imgs = import_data.images.len().max(1) as f64;

        let proj_name = &analysis.projects[proj_idx].name;

        for (img_idx, mut img) in import_data.images.into_iter().enumerate() {
            // Remapear class_id de cada anotación
            let mut remapped = Vec::with_capacity(img.annotations.len());
            for mut ann in img.annotations {
                match map_idx.get(&(proj_idx, ann.class_id)) {
                    Some(&canon) if canon >= 0 && (canon as usize) < classes.len() => {
                        ann.class_id = canon;
                        remapped.push(ann);
                    }
                    _ => {
                        dropped_annotations += 1;
                    }
                }
            }
            img.annotations = remapped;

            // Prefijar con nombre del proyecto para evitar colisiones visuales
            // (UUID interno evita colisión en disco, pero el nombre visible se mantiene legible)
            let prefixed_name = format!("{}__{}", proj_name, img.name);

            total_annotations += img.annotations.len();
            let new_image_id = state.upload_image_bytes(
                &project_id,
                &prefixed_name,
                &img.data,
                &img.annotations,
                None,
                None,
            )?;
            total_images += 1;

            // Pre-generar thumbnail para que al entrar al proyecto no haya una
            // cascada de on-demand generations que cuelga la UI.
            let _ = crate::commands::image_processing_commands::generate_thumbnail_internal(
                state,
                &project_id,
                &new_image_id,
                crate::commands::image_processing_commands::THUMBNAIL_MAX_SIZE,
            );

            let per_proj = (img_idx as f64 + 1.0) / n_imgs;
            let base = 8.0 + (proj_idx as f64 / n_projects) * 90.0;
            let chunk = (1.0 / n_projects) * 90.0;
            emit_progress(base + per_proj * chunk);
        }
    }

    if dropped_annotations > 0 {
        log::warn!(
            "merge_tix_projects: {} anotaciones descartadas por clase no mapeada",
            dropped_annotations
        );
    }

    emit_progress(100.0);

    Ok(ImportResult {
        project_id,
        stats: ImportStats {
            images_count: total_images,
            classes_count: classes.len(),
            annotations_count: total_annotations,
        },
    })
}
