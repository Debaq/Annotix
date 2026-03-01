use std::path::Path;

use crate::store::project_file::{ProjectFile, ImageEntry};
use crate::export::{parse_bbox, parse_obb, parse_polygon};
use crate::utils::converters::normalize_coordinates;

/// Prepara el dataset en disco con split train/val para entrenamiento YOLO
pub fn prepare_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
    task: &str,
) -> Result<String, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    // Shuffle con seed determinístico para reproducibilidad
    let mut indices: Vec<usize> = (0..total).collect();
    // Simple Fisher-Yates shuffle con seed basado en project_id (hash del UUID)
    let seed = project.id.bytes().fold(42usize, |acc, b| acc.wrapping_mul(31).wrapping_add(b as usize));
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let val_count = ((total as f64) * val_split).ceil() as usize;
    let val_count = val_count.max(1).min(total - 1);
    let train_count = total - val_count;

    let train_indices = &indices[..train_count];
    let val_indices = &indices[train_count..];

    if task == "classify" {
        prepare_classification_dataset(images_dir, project, images, output_dir, train_indices, val_indices)?;
    } else {
        prepare_detection_dataset(images_dir, project, images, output_dir, train_indices, val_indices, task)?;
    }

    // Generar data.yaml
    let yaml_path = output_dir.join("data.yaml");
    let yaml_content = generate_data_yaml(project, output_dir, task);
    std::fs::write(&yaml_path, &yaml_content)
        .map_err(|e| format!("Error escribiendo data.yaml: {}", e))?;

    Ok(yaml_path.to_string_lossy().replace('\\', "/"))
}

fn prepare_detection_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    train_indices: &[usize],
    val_indices: &[usize],
    task: &str,
) -> Result<(), String> {
    // Crear estructura de directorios
    for split in &["train", "val"] {
        std::fs::create_dir_all(output_dir.join("images").join(split))
            .map_err(|e| format!("Error creando directorio images/{}: {}", split, e))?;
        std::fs::create_dir_all(output_dir.join("labels").join(split))
            .map_err(|e| format!("Error creando directorio labels/{}: {}", split, e))?;
    }

    // Copiar imágenes y generar labels para train
    for &idx in train_indices {
        copy_image_and_label(images_dir, project, &images[idx], output_dir, "train", task)?;
    }

    // Copiar imágenes y generar labels para val
    for &idx in val_indices {
        copy_image_and_label(images_dir, project, &images[idx], output_dir, "val", task)?;
    }

    Ok(())
}

fn prepare_classification_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    train_indices: &[usize],
    val_indices: &[usize],
) -> Result<(), String> {
    // Para clasificación: carpetas por clase
    for split in &["train", "val"] {
        for cls in &project.classes {
            std::fs::create_dir_all(output_dir.join(split).join(&cls.name))
                .map_err(|e| format!("Error creando directorio {}/{}: {}", split, cls.name, e))?;
        }
    }

    for &idx in train_indices {
        copy_classification_image(images_dir, project, &images[idx], output_dir, "train")?;
    }

    for &idx in val_indices {
        copy_classification_image(images_dir, project, &images[idx], output_dir, "val")?;
    }

    Ok(())
}

fn copy_image_and_label(
    images_dir: &Path,
    project: &ProjectFile,
    image: &ImageEntry,
    output_dir: &Path,
    split: &str,
    task: &str,
) -> Result<(), String> {
    // Copiar imagen
    let src_path = images_dir.join(&image.file);

    if !src_path.exists() {
        log::warn!("Imagen no encontrada: {:?}, omitiendo", src_path);
        return Ok(());
    }

    let dest = output_dir.join("images").join(split).join(&image.name);
    std::fs::copy(&src_path, &dest)
        .map_err(|e| format!("Error copiando imagen {}: {}", image.name, e))?;

    // Generar label
    let label_content = generate_label(image, project, task);
    let label_name = replace_ext(&image.name, "txt");
    let label_path = output_dir.join("labels").join(split).join(&label_name);
    std::fs::write(&label_path, &label_content)
        .map_err(|e| format!("Error escribiendo label {}: {}", label_name, e))?;

    Ok(())
}

fn copy_classification_image(
    images_dir: &Path,
    project: &ProjectFile,
    image: &ImageEntry,
    output_dir: &Path,
    split: &str,
) -> Result<(), String> {
    // Determinar clase de la imagen (primera anotación)
    let class_name = if let Some(ann) = image.annotations.first() {
        project.classes.iter()
            .find(|c| c.id == ann.class_id)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "unknown".to_string())
    } else {
        "unknown".to_string()
    };

    let src_path = images_dir.join(&image.file);

    let dest_dir = output_dir.join(split).join(&class_name);
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Error creando dir {}: {}", class_name, e))?;

    let dest = dest_dir.join(&image.name);

    if src_path.exists() {
        std::fs::copy(&src_path, &dest)
            .map_err(|e| format!("Error copiando imagen {}: {}", image.name, e))?;
    } else {
        log::warn!("Imagen no encontrada: {:?}, omitiendo", src_path);
    }

    Ok(())
}

fn generate_data_yaml(project: &ProjectFile, output_dir: &Path, task: &str) -> String {
    let mut lines = vec![
        "# YOLO Training Dataset".to_string(),
        "# Generated by Annotix".to_string(),
        String::new(),
        format!("path: {}", output_dir.to_string_lossy().replace('\\', "/")),
    ];

    if task == "classify" {
        lines.push("train: train".to_string());
        lines.push("val: val".to_string());
    } else {
        lines.push("train: images/train".to_string());
        lines.push("val: images/val".to_string());
    }

    lines.push(String::new());
    lines.push(format!("nc: {}", project.classes.len()));
    lines.push("names:".to_string());

    for (i, cls) in project.classes.iter().enumerate() {
        lines.push(format!("  {}: {}", i, cls.name));
    }

    lines.join("\n")
}

fn generate_label(image: &ImageEntry, project: &ProjectFile, task: &str) -> String {
    let mut lines = Vec::new();

    for ann in &image.annotations {
        // Mapear class_id al índice secuencial
        let class_idx = project.classes.iter()
            .position(|c| c.id == ann.class_id);
        let class_idx = match class_idx {
            Some(idx) => idx,
            None => continue,
        };

        match (ann.annotation_type.as_str(), task) {
            ("bbox", "detect") | ("bbox", _) if task != "segment" => {
                if let Some(bbox) = parse_bbox(&ann.data) {
                    let (nx, ny, nw, nh) = normalize_coordinates(
                        bbox.x, bbox.y, bbox.width, bbox.height,
                        image.width as f64, image.height as f64,
                    );
                    let x_center = nx + nw / 2.0;
                    let y_center = ny + nh / 2.0;
                    lines.push(format!(
                        "{} {:.6} {:.6} {:.6} {:.6}",
                        class_idx, x_center, y_center, nw, nh
                    ));
                }
            }
            ("obb", "obb") => {
                if let Some(obb) = parse_obb(&ann.data) {
                    let (min_x, min_y, max_x, max_y) = crate::utils::converters::obb_to_aabbox(
                        obb.x, obb.y, obb.width, obb.height, obb.rotation,
                    );
                    let w = max_x - min_x;
                    let h = max_y - min_y;
                    let (nx, ny, nw, nh) = normalize_coordinates(
                        min_x, min_y, w, h,
                        image.width as f64, image.height as f64,
                    );
                    let x_center = nx + nw / 2.0;
                    let y_center = ny + nh / 2.0;
                    lines.push(format!(
                        "{} {:.6} {:.6} {:.6} {:.6}",
                        class_idx, x_center, y_center, nw, nh
                    ));
                }
            }
            ("polygon", "segment") | ("instance-segmentation", "segment") => {
                if let Some(poly) = parse_polygon(&ann.data) {
                    let mut parts = vec![format!("{}", class_idx)];
                    for (px, py) in &poly.points {
                        let nx = px / image.width as f64;
                        let ny = py / image.height as f64;
                        parts.push(format!("{:.6} {:.6}", nx.clamp(0.0, 1.0), ny.clamp(0.0, 1.0)));
                    }
                    lines.push(parts.join(" "));
                }
            }
            ("bbox", "segment") => {
                // Bbox como polígono rectangular para segmentación
                if let Some(bbox) = parse_bbox(&ann.data) {
                    let (nx, ny, nw, nh) = normalize_coordinates(
                        bbox.x, bbox.y, bbox.width, bbox.height,
                        image.width as f64, image.height as f64,
                    );
                    let x1 = nx;
                    let y1 = ny;
                    let x2 = nx + nw;
                    let y2 = ny + nh;
                    lines.push(format!(
                        "{} {:.6} {:.6} {:.6} {:.6} {:.6} {:.6} {:.6} {:.6}",
                        class_idx, x1, y1, x2, y1, x2, y2, x1, y2
                    ));
                }
            }
            _ => {
                // Fallback: bbox para detect
                if let Some(bbox) = parse_bbox(&ann.data) {
                    let (nx, ny, nw, nh) = normalize_coordinates(
                        bbox.x, bbox.y, bbox.width, bbox.height,
                        image.width as f64, image.height as f64,
                    );
                    let x_center = nx + nw / 2.0;
                    let y_center = ny + nh / 2.0;
                    lines.push(format!(
                        "{} {:.6} {:.6} {:.6} {:.6}",
                        class_idx, x_center, y_center, nw, nh
                    ));
                }
            }
        }
    }

    lines.join("\n")
}

fn replace_ext(filename: &str, new_ext: &str) -> String {
    match filename.rfind('.') {
        Some(pos) => format!("{}.{}", &filename[..pos], new_ext),
        None => format!("{}.{}", filename, new_ext),
    }
}
