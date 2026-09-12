use std::io::Cursor;
use std::path::Path;

use image::{GrayImage, Luma};

use super::TrainingBackend;
use crate::export::{parse_bbox, parse_mask, parse_obb, parse_polygon};
use crate::store::project_file::{ClassDef, ImageEntry, ProjectFile};
use crate::utils::converters::normalize_coordinates;

/// `true` si el backend entrena sobre las imágenes del proyecto.
/// Los de series temporales y tabular leen sus propios CSV y no tocan `images`.
pub fn backend_uses_images(backend: &TrainingBackend) -> bool {
    !matches!(
        backend,
        TrainingBackend::Tsai
            | TrainingBackend::PytorchForecasting
            | TrainingBackend::Pyod
            | TrainingBackend::Tslearn
            | TrainingBackend::Pypots
            | TrainingBackend::Stumpy
            | TrainingBackend::Sklearn
    )
}

/// Selecciona las imágenes que entran al dataset de entrenamiento.
///
/// Hace dos cosas, en este orden:
///
/// 1. Descarta anotaciones huérfanas: las que apuntan a un `class_id` que ya no
///    existe (queda así tras borrar una clase).
/// 2. Descarta las imágenes que quedan sin ninguna anotación.
///
/// El segundo paso es el importante. Una imagen sin anotaciones genera un
/// archivo de labels vacío, y en YOLO eso no significa "ignorar esta imagen"
/// sino "imagen de fondo": un negativo puro. Mandar al entrenamiento las
/// imágenes que el usuario todavía no anotó sesga el modelo a no detectar nada
/// (ultralytics recomienda ~10% de fondos, no 80%) y mete imágenes sin ground
/// truth en el split de validación, donde distorsionan el mAP.
///
/// En clasificación evita además que las imágenes sin clase caigan en una
/// carpeta `unknown`, que ImageFolder tomaría como una clase más.
pub fn select_trainable_images(images: Vec<ImageEntry>, classes: &[ClassDef]) -> Vec<ImageEntry> {
    let class_ids: std::collections::HashSet<i64> = classes.iter().map(|c| c.id).collect();
    images
        .into_iter()
        .filter_map(|mut img| {
            img.annotations
                .retain(|ann| class_ids.contains(&ann.class_id));
            if img.annotations.is_empty() {
                None
            } else {
                Some(img)
            }
        })
        .collect()
}

/// Resultado del split: cuántas imágenes en cada partición.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy)]
pub struct SplitCounts {
    pub train: usize,
    pub val: usize,
    pub test: usize,
}

/// Calcula la división train/val/test garantizando mínimos sensatos.
/// - val siempre ≥1 (excepto si total==1)
/// - test ≥1 sólo si test_split>0 y queda al menos 1 para train
pub fn compute_split(total: usize, val_split: f64, test_split: f64) -> SplitCounts {
    if total == 0 {
        return SplitCounts {
            train: 0,
            val: 0,
            test: 0,
        };
    }
    if total == 1 {
        return SplitCounts {
            train: 1,
            val: 0,
            test: 0,
        };
    }

    let mut test = ((total as f64) * test_split.max(0.0)).round() as usize;
    if test_split > 0.0 && test == 0 {
        test = 1;
    }
    if test >= total {
        test = total - 2;
    }

    let remaining = total - test;
    let mut val = ((total as f64) * val_split.max(0.0)).ceil() as usize;
    val = val.max(1).min(remaining.saturating_sub(1).max(1));
    if val + test >= total {
        val = total - test - 1;
    }

    let train = total - val - test;
    SplitCounts { train, val, test }
}

/// Prepara el dataset en disco con split train/val/test para entrenamiento YOLO
pub fn prepare_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
    test_split: f64,
    task: &str,
) -> Result<String, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    // Shuffle con seed determinístico para reproducibilidad
    let mut indices: Vec<usize> = (0..total).collect();
    let seed = project.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let counts = compute_split(total, val_split, test_split);

    let train_indices = &indices[..counts.train];
    let val_indices = &indices[counts.train..counts.train + counts.val];
    let test_indices = &indices[counts.train + counts.val..];
    let has_test = !test_indices.is_empty();

    if task == "classify" {
        prepare_classification_dataset(
            images_dir,
            project,
            images,
            output_dir,
            train_indices,
            val_indices,
            test_indices,
        )?;
    } else {
        prepare_detection_dataset(
            images_dir,
            project,
            images,
            output_dir,
            train_indices,
            val_indices,
            test_indices,
            task,
        )?;
    }

    // Generar data.yaml
    let yaml_path = output_dir.join("data.yaml");
    let yaml_content = generate_data_yaml(project, output_dir, task, has_test);
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
    test_indices: &[usize],
    task: &str,
) -> Result<(), String> {
    let mut splits: Vec<(&str, &[usize])> = vec![("train", train_indices), ("val", val_indices)];
    if !test_indices.is_empty() {
        splits.push(("test", test_indices));
    }

    for (split, _) in &splits {
        std::fs::create_dir_all(output_dir.join("images").join(split))
            .map_err(|e| format!("Error creando directorio images/{}: {}", split, e))?;
        std::fs::create_dir_all(output_dir.join("labels").join(split))
            .map_err(|e| format!("Error creando directorio labels/{}: {}", split, e))?;
    }

    for (split, idxs) in &splits {
        for &idx in *idxs {
            copy_image_and_label(images_dir, project, &images[idx], output_dir, split, task)?;
        }
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
    test_indices: &[usize],
) -> Result<(), String> {
    let mut splits: Vec<(&str, &[usize])> = vec![("train", train_indices), ("val", val_indices)];
    if !test_indices.is_empty() {
        splits.push(("test", test_indices));
    }

    for (split, _) in &splits {
        for cls in &project.classes {
            std::fs::create_dir_all(output_dir.join(split).join(&cls.name))
                .map_err(|e| format!("Error creando directorio {}/{}: {}", split, cls.name, e))?;
        }
    }

    for (split, idxs) in &splits {
        for &idx in *idxs {
            copy_classification_image(images_dir, project, &images[idx], output_dir, split)?;
        }
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
        project
            .classes
            .iter()
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

fn generate_data_yaml(
    project: &ProjectFile,
    output_dir: &Path,
    task: &str,
    has_test: bool,
) -> String {
    let mut lines = vec![
        "# YOLO Training Dataset".to_string(),
        "# Generated by Annotix".to_string(),
        String::new(),
        format!("path: {}", output_dir.to_string_lossy().replace('\\', "/")),
    ];

    if task == "classify" {
        lines.push("train: train".to_string());
        lines.push("val: val".to_string());
        if has_test {
            lines.push("test: test".to_string());
        }
    } else {
        lines.push("train: images/train".to_string());
        lines.push("val: images/val".to_string());
        if has_test {
            lines.push("test: images/test".to_string());
        }
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
        let class_idx = project.classes.iter().position(|c| c.id == ann.class_id);
        let class_idx = match class_idx {
            Some(idx) => idx,
            None => continue,
        };

        match (ann.annotation_type.as_str(), task) {
            ("bbox", "detect") | ("bbox", _) if task != "segment" => {
                if let Some(bbox) = parse_bbox(&ann.data) {
                    let (nx, ny, nw, nh) = normalize_coordinates(
                        bbox.x,
                        bbox.y,
                        bbox.width,
                        bbox.height,
                        image.width as f64,
                        image.height as f64,
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
                        obb.x,
                        obb.y,
                        obb.width,
                        obb.height,
                        obb.rotation,
                    );
                    let w = max_x - min_x;
                    let h = max_y - min_y;
                    let (nx, ny, nw, nh) = normalize_coordinates(
                        min_x,
                        min_y,
                        w,
                        h,
                        image.width as f64,
                        image.height as f64,
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
                        parts.push(format!(
                            "{:.6} {:.6}",
                            nx.clamp(0.0, 1.0),
                            ny.clamp(0.0, 1.0)
                        ));
                    }
                    lines.push(parts.join(" "));
                }
            }
            ("bbox", "segment") => {
                // Bbox como polígono rectangular para segmentación
                if let Some(bbox) = parse_bbox(&ann.data) {
                    let (nx, ny, nw, nh) = normalize_coordinates(
                        bbox.x,
                        bbox.y,
                        bbox.width,
                        bbox.height,
                        image.width as f64,
                        image.height as f64,
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
                        bbox.x,
                        bbox.y,
                        bbox.width,
                        bbox.height,
                        image.width as f64,
                        image.height as f64,
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

// ─── COCO JSON Dataset ──────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
pub enum CocoLayout {
    /// RF-DETR: train/_annotations.coco.json + valid/_annotations.coco.json (images beside JSON)
    RfDetr,
    /// MMDetection: annotations/instances_train.json + annotations/instances_val.json (images in train/val dirs)
    MmDetection,
}

/// Prepara un dataset en formato COCO JSON
pub fn prepare_coco_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
    layout: CocoLayout,
) -> Result<String, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    // Shuffle (same as YOLO)
    let mut indices: Vec<usize> = (0..total).collect();
    let seed = project.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let val_count = ((total as f64) * val_split).ceil() as usize;
    let val_count = val_count.max(1).min(total - 1);
    let train_count = total - val_count;

    let train_indices = &indices[..train_count];
    let val_indices = &indices[train_count..];

    // Build categories (1-based for COCO)
    let categories: Vec<serde_json::Value> = project
        .classes
        .iter()
        .enumerate()
        .map(|(i, cls)| {
            serde_json::json!({
                "id": i + 1,
                "name": cls.name,
                "supercategory": "none"
            })
        })
        .collect();

    match layout {
        CocoLayout::RfDetr => {
            let train_dir = output_dir.join("train");
            let valid_dir = output_dir.join("valid");
            std::fs::create_dir_all(&train_dir)
                .map_err(|e| format!("Error creando train/: {}", e))?;
            std::fs::create_dir_all(&valid_dir)
                .map_err(|e| format!("Error creando valid/: {}", e))?;

            let train_json = build_coco_json(
                images_dir,
                project,
                images,
                train_indices,
                &categories,
                &train_dir,
            )?;
            let valid_json = build_coco_json(
                images_dir,
                project,
                images,
                val_indices,
                &categories,
                &valid_dir,
            )?;

            std::fs::write(train_dir.join("_annotations.coco.json"), &train_json)
                .map_err(|e| format!("Error escribiendo train annotations: {}", e))?;
            std::fs::write(valid_dir.join("_annotations.coco.json"), &valid_json)
                .map_err(|e| format!("Error escribiendo valid annotations: {}", e))?;
        }
        CocoLayout::MmDetection => {
            let train_dir = output_dir.join("train");
            let val_dir = output_dir.join("val");
            let ann_dir = output_dir.join("annotations");
            std::fs::create_dir_all(&train_dir)
                .map_err(|e| format!("Error creando train/: {}", e))?;
            std::fs::create_dir_all(&val_dir).map_err(|e| format!("Error creando val/: {}", e))?;
            std::fs::create_dir_all(&ann_dir)
                .map_err(|e| format!("Error creando annotations/: {}", e))?;

            let train_json = build_coco_json(
                images_dir,
                project,
                images,
                train_indices,
                &categories,
                &train_dir,
            )?;
            let val_json = build_coco_json(
                images_dir,
                project,
                images,
                val_indices,
                &categories,
                &val_dir,
            )?;

            std::fs::write(ann_dir.join("instances_train.json"), &train_json)
                .map_err(|e| format!("Error escribiendo instances_train.json: {}", e))?;
            std::fs::write(ann_dir.join("instances_val.json"), &val_json)
                .map_err(|e| format!("Error escribiendo instances_val.json: {}", e))?;
        }
    }

    Ok(output_dir.to_string_lossy().replace('\\', "/"))
}

fn build_coco_json(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    indices: &[usize],
    categories: &[serde_json::Value],
    dest_dir: &Path,
) -> Result<String, String> {
    let mut coco_images: Vec<serde_json::Value> = Vec::new();
    let mut coco_annotations: Vec<serde_json::Value> = Vec::new();
    let mut ann_id: u64 = 1;

    for (img_idx, &idx) in indices.iter().enumerate() {
        let image = &images[idx];
        let image_id = (img_idx + 1) as u64;

        // Copy image
        let src = images_dir.join(&image.file);
        if !src.exists() {
            log::warn!("Imagen no encontrada: {:?}, omitiendo", src);
            continue;
        }
        let _ = std::fs::copy(&src, dest_dir.join(&image.name));

        coco_images.push(serde_json::json!({
            "id": image_id,
            "file_name": image.name,
            "width": image.width,
            "height": image.height
        }));

        for ann in &image.annotations {
            let class_idx = project.classes.iter().position(|c| c.id == ann.class_id);
            let class_idx = match class_idx {
                Some(idx) => idx,
                None => continue,
            };
            let category_id = (class_idx + 1) as u64;

            if let Some(bbox) = parse_bbox(&ann.data) {
                let x = bbox.x;
                let y = bbox.y;
                let w = bbox.width;
                let h = bbox.height;
                let area = w * h;

                coco_annotations.push(serde_json::json!({
                    "id": ann_id,
                    "image_id": image_id,
                    "category_id": category_id,
                    "bbox": [x, y, w, h],
                    "area": area,
                    "iscrowd": 0
                }));
                ann_id += 1;
            }
        }
    }

    let coco = serde_json::json!({
        "images": coco_images,
        "annotations": coco_annotations,
        "categories": categories
    });

    serde_json::to_string_pretty(&coco).map_err(|e| format!("Error serializando COCO JSON: {}", e))
}

// ─── Mask PNG Dataset (Semantic Segmentation) ───────────────────────────────

/// Prepara dataset con máscaras PNG indexadas para segmentación semántica
pub fn prepare_mask_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
) -> Result<String, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    // Shuffle (same seed as other prepare functions)
    let mut indices: Vec<usize> = (0..total).collect();
    let seed = project.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let val_count = ((total as f64) * val_split).ceil() as usize;
    let val_count = val_count.max(1).min(total - 1);
    let train_count = total - val_count;

    let train_indices = &indices[..train_count];
    let val_indices = &indices[train_count..];

    // Create directory structure
    for split in &["train", "val"] {
        std::fs::create_dir_all(output_dir.join("images").join(split))
            .map_err(|e| format!("Error creando directorio images/{}: {}", split, e))?;
        std::fs::create_dir_all(output_dir.join("masks").join(split))
            .map_err(|e| format!("Error creando directorio masks/{}: {}", split, e))?;
    }

    // Process train split
    for &idx in train_indices {
        copy_image_and_mask(images_dir, project, &images[idx], output_dir, "train")?;
    }

    // Process val split
    for &idx in val_indices {
        copy_image_and_mask(images_dir, project, &images[idx], output_dir, "val")?;
    }

    // Generate classes.txt (sequential: 0=background, 1..N=classes)
    let mut classes_content = "0: background\n".to_string();
    for (i, cls) in project.classes.iter().enumerate() {
        classes_content.push_str(&format!("{}: {}\n", i + 1, cls.name));
    }
    std::fs::write(output_dir.join("classes.txt"), &classes_content)
        .map_err(|e| format!("Error escribiendo classes.txt: {}", e))?;

    Ok(output_dir.to_string_lossy().replace('\\', "/"))
}

fn copy_image_and_mask(
    images_dir: &Path,
    project: &ProjectFile,
    image: &ImageEntry,
    output_dir: &Path,
    split: &str,
) -> Result<(), String> {
    let src_path = images_dir.join(&image.file);
    if !src_path.exists() {
        log::warn!("Imagen no encontrada: {:?}, omitiendo", src_path);
        return Ok(());
    }

    // Copy image
    let dest = output_dir.join("images").join(split).join(&image.name);
    std::fs::copy(&src_path, &dest)
        .map_err(|e| format!("Error copiando imagen {}: {}", image.name, e))?;

    // Generate mask PNG
    let mask_png = generate_segmentation_mask(image, project)?;
    let mask_name = replace_ext(&image.name, "png");
    let mask_path = output_dir.join("masks").join(split).join(&mask_name);
    std::fs::write(&mask_path, &mask_png)
        .map_err(|e| format!("Error escribiendo mask {}: {}", mask_name, e))?;

    Ok(())
}

/// Genera una máscara PNG grayscale con class_idx secuencial (0=bg, 1..N=clases)
fn generate_segmentation_mask(
    image: &ImageEntry,
    project: &ProjectFile,
) -> Result<Vec<u8>, String> {
    let w = image.width;
    let h = image.height;
    let mut mask_img = GrayImage::from_pixel(w, h, Luma([0u8]));

    for ann in &image.annotations {
        // Sequential class index: position in classes list + 1 (0 = background)
        let class_idx = match project.classes.iter().position(|c| c.id == ann.class_id) {
            Some(idx) => (idx + 1) as u8,
            None => continue,
        };

        match ann.annotation_type.as_str() {
            "mask" => {
                if let Some(mask_data) = parse_mask(&ann.data) {
                    draw_mask_on_target(&mut mask_img, &mask_data.base64png, class_idx)?;
                }
            }
            "polygon" | "instance-segmentation" => {
                if let Some(poly_data) = parse_polygon(&ann.data) {
                    draw_polygon_on_target(&mut mask_img, &poly_data.points, class_idx);
                }
            }
            "bbox" => {
                // Convert bbox to rectangular polygon for mask
                if let Some(bbox) = parse_bbox(&ann.data) {
                    let points = vec![
                        (bbox.x, bbox.y),
                        (bbox.x + bbox.width, bbox.y),
                        (bbox.x + bbox.width, bbox.y + bbox.height),
                        (bbox.x, bbox.y + bbox.height),
                    ];
                    draw_polygon_on_target(&mut mask_img, &points, class_idx);
                }
            }
            _ => {}
        }
    }

    // Encode to PNG
    let mut buf = Cursor::new(Vec::new());
    mask_img
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("Error codificando mask PNG: {}", e))?;

    Ok(buf.into_inner())
}

/// Rasteriza un polígono sobre la máscara con scanline fill
fn draw_polygon_on_target(target: &mut GrayImage, points: &[(f64, f64)], class_value: u8) {
    if points.len() < 3 {
        return;
    }

    let w = target.width() as f64;
    let h = target.height() as f64;

    let min_y = points.iter().map(|p| p.1).fold(f64::MAX, f64::min).max(0.0) as u32;
    let max_y = points
        .iter()
        .map(|p| p.1)
        .fold(f64::MIN, f64::max)
        .min(h - 1.0) as u32;

    for y in min_y..=max_y {
        let yf = y as f64 + 0.5;
        let mut intersections = Vec::new();

        for i in 0..points.len() {
            let j = (i + 1) % points.len();
            let (y0, y1) = (points[i].1, points[j].1);
            let (x0, x1) = (points[i].0, points[j].0);

            if (y0 <= yf && y1 > yf) || (y1 <= yf && y0 > yf) {
                let t = (yf - y0) / (y1 - y0);
                let x = x0 + t * (x1 - x0);
                intersections.push(x);
            }
        }

        intersections.sort_by(|a, b| a.partial_cmp(b).unwrap());

        for pair in intersections.chunks(2) {
            if pair.len() == 2 {
                let x_start = (pair[0].max(0.0)) as u32;
                let x_end = (pair[1].min(w - 1.0)) as u32;
                for x in x_start..=x_end {
                    if x < target.width() {
                        target.put_pixel(x, y, Luma([class_value]));
                    }
                }
            }
        }
    }
}

/// Aplica una máscara base64 PNG sobre la imagen target
fn draw_mask_on_target(
    target: &mut GrayImage,
    base64png: &str,
    class_value: u8,
) -> Result<(), String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;

    let b64_str = if let Some(pos) = base64png.find(',') {
        &base64png[pos + 1..]
    } else {
        base64png
    };

    let png_data = engine
        .decode(b64_str)
        .map_err(|e| format!("Error decodificando base64: {}", e))?;

    let mask_image = image::load_from_memory(&png_data)
        .map_err(|e| format!("Error cargando mask PNG: {}", e))?;
    let rgba = mask_image.to_rgba8();

    let target_w = target.width().min(rgba.width());
    let target_h = target.height().min(rgba.height());

    for y in 0..target_h {
        for x in 0..target_w {
            let pixel = rgba.get_pixel(x, y);
            if pixel[3] > 128 {
                target.put_pixel(x, y, Luma([class_value]));
            }
        }
    }

    Ok(())
}

// ─── Dataset Router ─────────────────────────────────────────────────────────

/// Prepara dataset según el backend seleccionado
pub fn prepare_dataset_for_backend(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
    test_split: f64,
    task: &str,
    backend: &TrainingBackend,
) -> Result<String, String> {
    match backend {
        TrainingBackend::Yolo | TrainingBackend::RtDetr | TrainingBackend::MmRotate => {
            prepare_dataset(
                images_dir, project, images, output_dir, val_split, test_split, task,
            )
        }
        TrainingBackend::RfDetr => prepare_coco_dataset(
            images_dir,
            project,
            images,
            output_dir,
            val_split,
            CocoLayout::RfDetr,
        ),
        TrainingBackend::MmDetection => prepare_coco_dataset(
            images_dir,
            project,
            images,
            output_dir,
            val_split,
            CocoLayout::MmDetection,
        ),
        TrainingBackend::Smp
        | TrainingBackend::HfSegmentation
        | TrainingBackend::MmSegmentation => {
            prepare_mask_dataset(images_dir, project, images, output_dir, val_split)
        }
        TrainingBackend::Detectron2 => {
            prepare_coco_instance_dataset(images_dir, project, images, output_dir, val_split)
        }
        TrainingBackend::MmPose => {
            prepare_coco_keypoints_dataset(images_dir, project, images, output_dir, val_split)
        }
        TrainingBackend::Timm | TrainingBackend::HfClassification => {
            if task == "multi_classify" {
                prepare_multilabel_dataset(images_dir, project, images, output_dir, val_split)
            } else {
                prepare_classification_dataset_imagefolder(
                    images_dir, project, images, output_dir, val_split,
                )
            }
        }
        TrainingBackend::Tsai
        | TrainingBackend::PytorchForecasting
        | TrainingBackend::Pyod
        | TrainingBackend::Tslearn
        | TrainingBackend::Pypots
        | TrainingBackend::Stumpy => {
            // El directorio del proyecto es el padre de images/: es donde
            // viven timeseries/{id}.json.
            let project_dir = images_dir
                .parent()
                .ok_or("No se pudo determinar el directorio del proyecto")?;
            prepare_timeseries_dataset(project, project_dir, output_dir, val_split)
        }
        TrainingBackend::Sklearn => prepare_tabular_dataset(project, output_dir),
    }
}

/// Prepares a tabular dataset: copies the first CSV from project tabular_data to output_dir
pub fn prepare_tabular_dataset(project: &ProjectFile, output_dir: &Path) -> Result<String, String> {
    let _entry = project
        .tabular_data
        .first()
        .ok_or_else(|| "No hay datos tabulares en el proyecto".to_string())?;

    // Find source CSV in project tabular dir
    // The project dir is derived from output_dir's parent (training job dir), so we need
    // to find the CSV from the project's tabular directory.
    // For training, the CSV is stored in the project dir under tabular/
    // We'll just write the path - the runner will copy it before calling this.
    // Actually, we copy it from the tabular dir which is referenced via project metadata.

    // The output_dir is the training job directory. We just return it as the dataset path.
    // The runner will copy the CSV there before generating scripts.
    Ok(output_dir.to_string_lossy().replace('\\', "/"))
}

// ─── COCO Instance JSON Dataset (with polygon segmentation) ──────────────────

pub fn prepare_coco_instance_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
) -> Result<String, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let mut indices: Vec<usize> = (0..total).collect();
    let seed = project.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let val_count = ((total as f64) * val_split).ceil() as usize;
    let val_count = val_count.max(1).min(total - 1);
    let train_count = total - val_count;
    let train_indices = &indices[..train_count];
    let val_indices = &indices[train_count..];

    let categories: Vec<serde_json::Value> = project.classes.iter().enumerate().map(|(i, cls)| {
        serde_json::json!({ "id": i + 1, "name": cls.name, "supercategory": "none" })
    }).collect();

    let train_dir = output_dir.join("train");
    let val_dir = output_dir.join("val");
    let ann_dir = output_dir.join("annotations");
    std::fs::create_dir_all(&train_dir).map_err(|e| format!("Error creando train/: {}", e))?;
    std::fs::create_dir_all(&val_dir).map_err(|e| format!("Error creando val/: {}", e))?;
    std::fs::create_dir_all(&ann_dir).map_err(|e| format!("Error creando annotations/: {}", e))?;

    let train_json = build_coco_instance_json(
        images_dir,
        project,
        images,
        train_indices,
        &categories,
        &train_dir,
    )?;
    let val_json = build_coco_instance_json(
        images_dir,
        project,
        images,
        val_indices,
        &categories,
        &val_dir,
    )?;

    std::fs::write(ann_dir.join("instances_train.json"), &train_json)
        .map_err(|e| format!("Error escribiendo instances_train.json: {}", e))?;
    std::fs::write(ann_dir.join("instances_val.json"), &val_json)
        .map_err(|e| format!("Error escribiendo instances_val.json: {}", e))?;

    Ok(output_dir.to_string_lossy().replace('\\', "/"))
}

fn build_coco_instance_json(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    indices: &[usize],
    categories: &[serde_json::Value],
    dest_dir: &Path,
) -> Result<String, String> {
    let mut coco_images: Vec<serde_json::Value> = Vec::new();
    let mut coco_annotations: Vec<serde_json::Value> = Vec::new();
    let mut ann_id: u64 = 1;

    for (img_idx, &idx) in indices.iter().enumerate() {
        let image = &images[idx];
        let image_id = (img_idx + 1) as u64;

        let src = images_dir.join(&image.file);
        if !src.exists() {
            log::warn!("Imagen no encontrada: {:?}, omitiendo", src);
            continue;
        }
        let _ = std::fs::copy(&src, dest_dir.join(&image.name));

        coco_images.push(serde_json::json!({
            "id": image_id, "file_name": image.name,
            "width": image.width, "height": image.height
        }));

        for ann in &image.annotations {
            let class_idx = match project.classes.iter().position(|c| c.id == ann.class_id) {
                Some(idx) => idx,
                None => continue,
            };
            let category_id = (class_idx + 1) as u64;

            // Extract polygon segmentation
            if let Some(poly) = parse_polygon(&ann.data) {
                let flat_seg: Vec<f64> =
                    poly.points.iter().flat_map(|(x, y)| vec![*x, *y]).collect();
                // Compute bbox from polygon
                let min_x = poly.points.iter().map(|p| p.0).fold(f64::MAX, f64::min);
                let min_y = poly.points.iter().map(|p| p.1).fold(f64::MAX, f64::min);
                let max_x = poly.points.iter().map(|p| p.0).fold(f64::MIN, f64::max);
                let max_y = poly.points.iter().map(|p| p.1).fold(f64::MIN, f64::max);
                let w = max_x - min_x;
                let h = max_y - min_y;
                // Shoelace formula for area
                let area = polygon_area(&poly.points);

                coco_annotations.push(serde_json::json!({
                    "id": ann_id, "image_id": image_id, "category_id": category_id,
                    "segmentation": [flat_seg],
                    "bbox": [min_x, min_y, w, h],
                    "area": area, "iscrowd": 0
                }));
                ann_id += 1;
            } else if let Some(bbox) = parse_bbox(&ann.data) {
                // Fallback: bbox as rectangular segmentation
                let seg = vec![
                    bbox.x,
                    bbox.y,
                    bbox.x + bbox.width,
                    bbox.y,
                    bbox.x + bbox.width,
                    bbox.y + bbox.height,
                    bbox.x,
                    bbox.y + bbox.height,
                ];
                coco_annotations.push(serde_json::json!({
                    "id": ann_id, "image_id": image_id, "category_id": category_id,
                    "segmentation": [seg],
                    "bbox": [bbox.x, bbox.y, bbox.width, bbox.height],
                    "area": bbox.width * bbox.height, "iscrowd": 0
                }));
                ann_id += 1;
            }
        }
    }

    let coco = serde_json::json!({
        "images": coco_images, "annotations": coco_annotations, "categories": categories
    });
    serde_json::to_string_pretty(&coco)
        .map_err(|e| format!("Error serializando COCO Instance JSON: {}", e))
}

/// Computes polygon area using the Shoelace formula
fn polygon_area(points: &[(f64, f64)]) -> f64 {
    let n = points.len();
    if n < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += points[i].0 * points[j].1;
        area -= points[j].0 * points[i].1;
    }
    (area / 2.0).abs()
}

// ─── COCO Keypoints JSON Dataset ─────────────────────────────────────────────

pub fn prepare_coco_keypoints_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
) -> Result<String, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let mut indices: Vec<usize> = (0..total).collect();
    let seed = project.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let val_count = ((total as f64) * val_split).ceil() as usize;
    let val_count = val_count.max(1).min(total - 1);
    let train_count = total - val_count;
    let train_indices = &indices[..train_count];
    let val_indices = &indices[train_count..];

    // Build categories with keypoints info from project classes
    let categories: Vec<serde_json::Value> = project
        .classes
        .iter()
        .enumerate()
        .map(|(i, cls)| {
            // Try to parse keypoint names from class metadata
            let kp_names: Vec<String> = cls.name.split(',').map(|s| s.trim().to_string()).collect();
            let _num_kp = kp_names.len().max(1);
            let skeleton: Vec<Vec<usize>> = Vec::new(); // User would configure skeleton
            serde_json::json!({
                "id": i + 1, "name": cls.name, "supercategory": "none",
                "keypoints": kp_names, "skeleton": skeleton
            })
        })
        .collect();

    let train_dir = output_dir.join("train");
    let val_dir = output_dir.join("val");
    let ann_dir = output_dir.join("annotations");
    std::fs::create_dir_all(&train_dir).map_err(|e| format!("Error: {}", e))?;
    std::fs::create_dir_all(&val_dir).map_err(|e| format!("Error: {}", e))?;
    std::fs::create_dir_all(&ann_dir).map_err(|e| format!("Error: {}", e))?;

    let train_json = build_coco_keypoints_json(
        images_dir,
        project,
        images,
        train_indices,
        &categories,
        &train_dir,
    )?;
    let val_json = build_coco_keypoints_json(
        images_dir,
        project,
        images,
        val_indices,
        &categories,
        &val_dir,
    )?;

    std::fs::write(ann_dir.join("person_keypoints_train.json"), &train_json)
        .map_err(|e| format!("Error escribiendo keypoints train: {}", e))?;
    std::fs::write(ann_dir.join("person_keypoints_val.json"), &val_json)
        .map_err(|e| format!("Error escribiendo keypoints val: {}", e))?;

    Ok(output_dir.to_string_lossy().replace('\\', "/"))
}

fn build_coco_keypoints_json(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    indices: &[usize],
    categories: &[serde_json::Value],
    dest_dir: &Path,
) -> Result<String, String> {
    let mut coco_images: Vec<serde_json::Value> = Vec::new();
    let mut coco_annotations: Vec<serde_json::Value> = Vec::new();
    let mut ann_id: u64 = 1;

    for (img_idx, &idx) in indices.iter().enumerate() {
        let image = &images[idx];
        let image_id = (img_idx + 1) as u64;

        let src = images_dir.join(&image.file);
        if !src.exists() {
            continue;
        }
        let _ = std::fs::copy(&src, dest_dir.join(&image.name));

        coco_images.push(serde_json::json!({
            "id": image_id, "file_name": image.name,
            "width": image.width, "height": image.height
        }));

        for ann in &image.annotations {
            let class_idx = match project.classes.iter().position(|c| c.id == ann.class_id) {
                Some(idx) => idx,
                None => continue,
            };
            let category_id = (class_idx + 1) as u64;

            // Parse keypoints from annotation data
            let data = &ann.data;
            let keypoints: Vec<f64> = data
                .get("keypoints")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
                .unwrap_or_default();

            let num_keypoints = keypoints.len() / 3; // [x, y, visibility] triplets

            // Get bbox
            let bbox = if let Some(b) = parse_bbox(&ann.data) {
                vec![b.x, b.y, b.width, b.height]
            } else {
                // Compute from keypoints
                let xs: Vec<f64> = keypoints
                    .chunks(3)
                    .filter(|c| c.len() == 3 && c[2] > 0.0)
                    .map(|c| c[0])
                    .collect();
                let ys: Vec<f64> = keypoints
                    .chunks(3)
                    .filter(|c| c.len() == 3 && c[2] > 0.0)
                    .map(|c| c[1])
                    .collect();
                if xs.is_empty() {
                    continue;
                }
                let min_x = xs.iter().copied().fold(f64::MAX, f64::min);
                let min_y = ys.iter().copied().fold(f64::MAX, f64::min);
                let max_x = xs.iter().copied().fold(f64::MIN, f64::max);
                let max_y = ys.iter().copied().fold(f64::MIN, f64::max);
                vec![min_x, min_y, max_x - min_x, max_y - min_y]
            };

            let area = bbox[2] * bbox[3];

            coco_annotations.push(serde_json::json!({
                "id": ann_id, "image_id": image_id, "category_id": category_id,
                "keypoints": keypoints, "num_keypoints": num_keypoints,
                "bbox": bbox, "area": area, "iscrowd": 0
            }));
            ann_id += 1;
        }
    }

    let coco = serde_json::json!({
        "images": coco_images, "annotations": coco_annotations, "categories": categories
    });
    serde_json::to_string_pretty(&coco)
        .map_err(|e| format!("Error serializando COCO Keypoints JSON: {}", e))
}

// ─── ImageFolder Dataset (Classification) ────────────────────────────────────

pub fn prepare_classification_dataset_imagefolder(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
) -> Result<String, String> {
    // Same as existing classification dataset but returns the base dir path
    prepare_dataset(
        images_dir, project, images, output_dir, val_split, 0.0, "classify",
    )
}

// ─── MultiLabel CSV Dataset ──────────────────────────────────────────────────

pub fn prepare_multilabel_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
) -> Result<String, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let mut indices: Vec<usize> = (0..total).collect();
    let seed = project.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let val_count = ((total as f64) * val_split).ceil() as usize;
    let val_count = val_count.max(1).min(total - 1);
    let train_count = total - val_count;
    let train_indices = &indices[..train_count];
    let val_indices = &indices[train_count..];

    let img_dir = output_dir.join("images");
    std::fs::create_dir_all(&img_dir).map_err(|e| format!("Error: {}", e))?;

    // Build CSV: image_path,class1,class2,...
    let class_names: Vec<&str> = project.classes.iter().map(|c| c.name.as_str()).collect();
    let mut train_rows = Vec::new();
    let mut val_rows = Vec::new();

    for &idx in train_indices {
        let image = &images[idx];
        let src = images_dir.join(&image.file);
        if !src.exists() {
            continue;
        }
        let _ = std::fs::copy(&src, img_dir.join(&image.name));

        let mut labels = vec![0u8; class_names.len()];
        for ann in &image.annotations {
            if let Some(pos) = project.classes.iter().position(|c| c.id == ann.class_id) {
                labels[pos] = 1;
            }
        }
        let labels_str: Vec<String> = labels.iter().map(|l| l.to_string()).collect();
        train_rows.push(format!("images/{},{}", image.name, labels_str.join(",")));
    }

    for &idx in val_indices {
        let image = &images[idx];
        let src = images_dir.join(&image.file);
        if !src.exists() {
            continue;
        }
        let _ = std::fs::copy(&src, img_dir.join(&image.name));

        let mut labels = vec![0u8; class_names.len()];
        for ann in &image.annotations {
            if let Some(pos) = project.classes.iter().position(|c| c.id == ann.class_id) {
                labels[pos] = 1;
            }
        }
        let labels_str: Vec<String> = labels.iter().map(|l| l.to_string()).collect();
        val_rows.push(format!("images/{},{}", image.name, labels_str.join(",")));
    }

    let header = format!("image_path,{}", class_names.join(","));
    let train_csv = format!("{}\n{}", header, train_rows.join("\n"));
    let val_csv = format!("{}\n{}", header, val_rows.join("\n"));

    std::fs::write(output_dir.join("train.csv"), &train_csv)
        .map_err(|e| format!("Error escribiendo train.csv: {}", e))?;
    std::fs::write(output_dir.join("val.csv"), &val_csv)
        .map_err(|e| format!("Error escribiendo val.csv: {}", e))?;

    Ok(output_dir.to_string_lossy().replace('\\', "/"))
}

// ─── TimeSeries CSV Dataset ──────────────────────────────────────────────────

pub fn prepare_timeseries_dataset(
    project: &ProjectFile,
    project_dir: &Path,
    output_dir: &Path,
    val_split: f64,
) -> Result<String, String> {
    let series = &project.timeseries;
    if series.is_empty() {
        return Err("No hay series temporales en el proyecto".to_string());
    }

    std::fs::create_dir_all(output_dir).map_err(|e| format!("Error: {}", e))?;

    let mut all_files = Vec::new();
    let mut exported = 0usize;

    for ts in series {
        // Los datos viven en timeseries/{id}.json desde la versión 3 del
        // formato; en proyectos anteriores todavía pueden venir incrustados.
        let data = match read_series_data(project_dir, ts) {
            Some(d) => d,
            None => {
                log::warn!("Serie {} sin datos legibles, se omite del dataset", ts.id);
                continue;
            }
        };

        let csv_content = series_to_csv(&data, ts)?;
        let csv_name = format!("{}.csv", ts.id);
        std::fs::write(output_dir.join(&csv_name), &csv_content)
            .map_err(|e| format!("Error escribiendo {}: {}", csv_name, e))?;
        all_files.push(csv_name);
        exported += 1;
    }

    if exported == 0 {
        return Err("Ninguna serie temporal del proyecto tiene datos legibles".to_string());
    }

    // Write metadata.json
    let annotations: Vec<serde_json::Value> = series
        .iter()
        .flat_map(|ts| {
            ts.annotations.iter().map(|a| {
                serde_json::json!({
                    "series_id": ts.id, "type": a.annotation_type,
                    "class_id": a.class_id, "data": a.data
                })
            })
        })
        .collect();

    let metadata = serde_json::json!({
        "files": all_files,
        "val_split": val_split,
        "num_series": exported,
        "classes": project.classes.iter().map(|c| &c.name).collect::<Vec<_>>(),
        "annotations": annotations,
    });
    std::fs::write(
        output_dir.join("metadata.json"),
        serde_json::to_string_pretty(&metadata).unwrap_or_default(),
    )
    .map_err(|e| format!("Error escribiendo metadata.json: {}", e))?;

    Ok(output_dir.to_string_lossy().replace('\\', "/"))
}

/// Lee los datos de una serie: del archivo propio, o del campo incrustado si el
/// proyecto es anterior a la migración.
fn read_series_data(
    project_dir: &Path,
    ts: &crate::store::project_file::TimeSeriesEntry,
) -> Option<serde_json::Value> {
    if let Some(data) = &ts.data {
        return Some(data.clone());
    }
    let path = project_dir
        .join("timeseries")
        .join(format!("{}.json", ts.id));
    let content = std::fs::read(path).ok()?;
    serde_json::from_slice(&content).ok()
}

/// Convierte una serie al CSV que consumen los backends de series temporales.
///
/// El formato de entrada es el que produce el importador:
/// `{ timestamps: [...], values: [...] | [[...], ...], columns: [...] }`.
/// La versión anterior esperaba `{columns, rows}` o un array de objetos —dos
/// formas que el programa nunca genera—, así que el CSV salía vacío para
/// cualquier serie real.
fn series_to_csv(
    data: &serde_json::Value,
    ts: &crate::store::project_file::TimeSeriesEntry,
) -> Result<String, String> {
    let timestamps = data
        .get("timestamps")
        .and_then(|t| t.as_array())
        .ok_or_else(|| format!("La serie {} no tiene marcas de tiempo", ts.id))?;

    let values = data.get("values").and_then(|v| v.as_array());

    // Univariante: values = [v, v, ...]; multivariante: values = [[...], [...]]
    let multivariate = values
        .and_then(|v| v.first())
        .map(|f| f.is_array())
        .unwrap_or(false);

    let column_names: Vec<String> = match data.get("columns").and_then(|c| c.as_array()) {
        Some(cols) => cols
            .iter()
            .map(|c| c.as_str().unwrap_or("value").to_string())
            .collect(),
        None if multivariate => (0..values.map(|v| v.len()).unwrap_or(0))
            .map(|i| format!("value_{}", i + 1))
            .collect(),
        None => vec!["value".to_string()],
    };

    let mut header = vec!["timestamp".to_string()];
    header.extend(column_names.iter().cloned());
    header.push("label".to_string());
    let mut lines = vec![header.join(",")];

    // Etiqueta por punto a partir de las anotaciones de la serie: los puntos y
    // eventos marcan su propia marca de tiempo, los rangos todo su intervalo.
    let label_at = |timestamp: f64| -> String {
        for ann in &ts.annotations {
            let hit = match ann.annotation_type.as_str() {
                "range" => {
                    let start = ann.data.get("startTimestamp").and_then(|v| v.as_f64());
                    let end = ann.data.get("endTimestamp").and_then(|v| v.as_f64());
                    matches!((start, end), (Some(s), Some(e)) if timestamp >= s.min(e) && timestamp <= s.max(e))
                }
                "classification" => true,
                _ => ann
                    .data
                    .get("timestamp")
                    .and_then(|v| v.as_f64())
                    .map(|t| (t - timestamp).abs() < f64::EPSILON)
                    .unwrap_or(false),
            };
            if hit {
                return ann
                    .class_id
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| ann.annotation_type.clone());
            }
        }
        String::new()
    };

    let cell = |v: Option<&serde_json::Value>| -> String {
        match v.and_then(|v| v.as_f64()) {
            Some(f) => f.to_string(),
            // null = hueco declarado por el importador; se deja vacío para que
            // pandas lo lea como NaN en vez de como un cero real.
            None => String::new(),
        }
    };

    for (i, ts_value) in timestamps.iter().enumerate() {
        let timestamp = ts_value.as_f64().unwrap_or(i as f64);
        let mut row = vec![timestamp.to_string()];

        if multivariate {
            let series_arrays = values.unwrap();
            for serie in series_arrays {
                row.push(cell(serie.as_array().and_then(|a| a.get(i))));
            }
        } else {
            row.push(cell(values.and_then(|a| a.get(i))));
        }

        row.push(label_at(timestamp));
        lines.push(row.join(","));
    }

    Ok(lines.join("\n"))
}
