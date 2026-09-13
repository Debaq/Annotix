use std::io::Cursor;
use std::path::Path;

use image::{GrayImage, Luma};

use super::contract::{keys, PreparedDataset};
use super::npy;
use super::{DatasetFormat, TrainingBackend};
use crate::export::{parse_bbox, parse_keypoints, parse_mask, parse_obb, parse_polygon};
use crate::store::project_file::{ClassDef, ImageEntry, ProjectFile};
use crate::utils::converters::normalize_coordinates;

/// Nombres de clase en el orden en que los scripts los indexan (posición = índice).
fn class_names(project: &ProjectFile) -> Vec<String> {
    project.classes.iter().map(|c| c.name.clone()).collect()
}

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
/// `true` si la tarea sabe qué hacer con una imagen sin objetos.
///
/// En detección un negativo es un ejemplo legítimo: labels vacío. En
/// clasificación no existe tal cosa —toda imagen pertenece a una clase— y una
/// sin anotaciones acabaría en una carpeta `unknown` que ImageFolder tomaría
/// como una clase más.
pub fn task_uses_background(task: &str) -> bool {
    !matches!(task, "classify" | "multi_classify")
}

/// Hace dos cosas, en este orden:
///
/// 1. Descarta anotaciones huérfanas: las que apuntan a un `class_id` que ya no
///    existe (queda así tras borrar una clase).
/// 2. Descarta las imágenes que quedan sin ninguna anotación, salvo las que el
///    usuario marcó como fondo.
///
/// El segundo paso es el importante. Una imagen sin anotaciones genera un
/// archivo de labels vacío, y en YOLO eso no significa "ignorar esta imagen"
/// sino "imagen de fondo": un negativo puro. Mandar al entrenamiento las
/// imágenes que el usuario todavía no anotó sesga el modelo a no detectar nada
/// (ultralytics recomienda ~10% de fondos, no 80%) y mete imágenes sin ground
/// truth en el split de validación, donde distorsionan el mAP.
///
/// La marca de fondo es justo la diferencia que faltaba: distingue "aquí no hay
/// nada" de "esto no lo he anotado todavía". `keep_background` la respeta solo
/// en las tareas que pueden usar negativos (ver `task_uses_background`).
pub fn select_trainable_images(
    images: Vec<ImageEntry>,
    classes: &[ClassDef],
    keep_background: bool,
) -> Vec<ImageEntry> {
    let class_ids: std::collections::HashSet<i64> = classes.iter().map(|c| c.id).collect();
    images
        .into_iter()
        .filter_map(|mut img| {
            img.annotations
                .retain(|ann| class_ids.contains(&ann.class_id));
            if img.annotations.is_empty() && !(keep_background && img.is_background) {
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

/// Reparto determinista de las imágenes en train/val/test.
///
/// El barajado se siembra con el id del proyecto, así que el mismo proyecto da
/// siempre el mismo reparto: dos entrenamientos son comparables. Antes esta lógica
/// estaba copiada en seis preparadores, y cinco de ellos ignoraban `test_split`.
pub struct SplitPlan {
    pub train: Vec<usize>,
    pub val: Vec<usize>,
    pub test: Vec<usize>,
}

impl SplitPlan {
    pub fn has_test(&self) -> bool {
        !self.test.is_empty()
    }

    /// Pares (nombre, índices), omitiendo test cuando está vacío.
    pub fn splits(&self) -> Vec<(&'static str, &[usize])> {
        let mut pairs: Vec<(&'static str, &[usize])> =
            vec![("train", &self.train), ("val", &self.val)];
        if self.has_test() {
            pairs.push(("test", &self.test));
        }
        pairs
    }
}

pub fn split_plan(
    project: &ProjectFile,
    total: usize,
    val_split: f64,
    test_split: f64,
) -> SplitPlan {
    let mut indices: Vec<usize> = (0..total).collect();
    let seed = project.id.bytes().fold(42usize, |acc, b| {
        acc.wrapping_mul(31).wrapping_add(b as usize)
    });
    for i in (1..indices.len()).rev() {
        let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
        indices.swap(i, j);
    }

    let counts = compute_split(total, val_split, test_split);
    let val_end = counts.train + counts.val;
    SplitPlan {
        train: indices[..counts.train].to_vec(),
        val: indices[counts.train..val_end].to_vec(),
        test: indices[val_end..].to_vec(),
    }
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
) -> Result<PreparedDataset, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let plan = split_plan(project, total, val_split, test_split);
    let has_test = plan.has_test();

    let format = if task == "classify" {
        DatasetFormat::ImageFolder
    } else {
        DatasetFormat::YoloTxt
    };
    let mut ds = PreparedDataset::new(output_dir, format, class_names(project));

    if task == "classify" {
        prepare_classification_dataset(images_dir, project, images, output_dir, &plan)?;
        ds.declare(keys::IMAGEFOLDER_ROOT, ".")
            .declare(keys::IMAGEFOLDER_TRAIN, "train")
            .declare(keys::IMAGEFOLDER_VAL, "val");
        if has_test {
            ds.declare(keys::IMAGEFOLDER_TEST, "test");
        }
    } else {
        prepare_detection_dataset(images_dir, project, images, output_dir, &plan, task)?;
        ds.declare(keys::IMAGES_TRAIN, "images/train")
            .declare(keys::IMAGES_VAL, "images/val")
            .declare(keys::LABELS_TRAIN, "labels/train")
            .declare(keys::LABELS_VAL, "labels/val");
        if has_test {
            ds.declare(keys::IMAGES_TEST, "images/test")
                .declare(keys::LABELS_TEST, "labels/test");
        }
    }

    // Generar data.yaml
    let yaml_path = output_dir.join("data.yaml");
    let yaml_content = generate_data_yaml(project, output_dir, task, has_test);
    std::fs::write(&yaml_path, &yaml_content)
        .map_err(|e| format!("Error escribiendo data.yaml: {}", e))?;
    ds.declare(keys::DATA_YAML, "data.yaml");

    Ok(ds)
}

fn prepare_detection_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    plan: &SplitPlan,
    task: &str,
) -> Result<(), String> {
    let splits = plan.splits();

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
    plan: &SplitPlan,
) -> Result<(), String> {
    let splits = plan.splits();

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
    Coco,
}

/// Prepara un dataset en formato COCO JSON
pub fn prepare_coco_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
    test_split: f64,
    layout: CocoLayout,
) -> Result<PreparedDataset, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let plan = split_plan(project, total, val_split, test_split);
    let train_indices: &[usize] = &plan.train;
    let val_indices: &[usize] = &plan.val;
    let test_indices: &[usize] = &plan.test;

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

    let mut ds = PreparedDataset::new(output_dir, DatasetFormat::CocoJson, class_names(project));

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

            // RF-DETR exige este layout: las imágenes y su json en el mismo directorio.
            ds.declare(keys::IMAGES_TRAIN, "train")
                .declare(keys::ANN_TRAIN, "train/_annotations.coco.json")
                .declare(keys::IMAGES_VAL, "valid")
                .declare(keys::ANN_VAL, "valid/_annotations.coco.json");

            if !test_indices.is_empty() {
                let test_dir = output_dir.join("test");
                std::fs::create_dir_all(&test_dir)
                    .map_err(|e| format!("Error creando test/: {}", e))?;
                let test_json = build_coco_json(
                    images_dir,
                    project,
                    images,
                    test_indices,
                    &categories,
                    &test_dir,
                )?;
                std::fs::write(test_dir.join("_annotations.coco.json"), &test_json)
                    .map_err(|e| format!("Error escribiendo test annotations: {}", e))?;
                ds.declare(keys::IMAGES_TEST, "test")
                    .declare(keys::ANN_TEST, "test/_annotations.coco.json");
            }
        }
        CocoLayout::Coco => {
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

            ds.declare(keys::IMAGES_TRAIN, "train")
                .declare(keys::ANN_TRAIN, "annotations/instances_train.json")
                .declare(keys::IMAGES_VAL, "val")
                .declare(keys::ANN_VAL, "annotations/instances_val.json");

            if !test_indices.is_empty() {
                let test_dir = output_dir.join("test");
                std::fs::create_dir_all(&test_dir)
                    .map_err(|e| format!("Error creando test/: {}", e))?;
                let test_json = build_coco_json(
                    images_dir,
                    project,
                    images,
                    test_indices,
                    &categories,
                    &test_dir,
                )?;
                std::fs::write(ann_dir.join("instances_test.json"), &test_json)
                    .map_err(|e| format!("Error escribiendo instances_test.json: {}", e))?;
                ds.declare(keys::IMAGES_TEST, "test")
                    .declare(keys::ANN_TEST, "annotations/instances_test.json");
            }
        }
    }

    Ok(ds)
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
    test_split: f64,
) -> Result<PreparedDataset, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    // Shuffle (same seed as other prepare functions)
    let plan = split_plan(project, total, val_split, test_split);

    for (split, idxs) in plan.splits() {
        std::fs::create_dir_all(output_dir.join("images").join(split))
            .map_err(|e| format!("Error creando directorio images/{}: {}", split, e))?;
        std::fs::create_dir_all(output_dir.join("masks").join(split))
            .map_err(|e| format!("Error creando directorio masks/{}: {}", split, e))?;
        for &idx in idxs {
            copy_image_and_mask(images_dir, project, &images[idx], output_dir, split)?;
        }
    }

    // Generate classes.txt (sequential: 0=background, 1..N=classes)
    let mut classes_content = "0: background\n".to_string();
    for (i, cls) in project.classes.iter().enumerate() {
        classes_content.push_str(&format!("{}: {}\n", i + 1, cls.name));
    }
    std::fs::write(output_dir.join("classes.txt"), &classes_content)
        .map_err(|e| format!("Error escribiendo classes.txt: {}", e))?;

    let mut ds = PreparedDataset::new(output_dir, DatasetFormat::MaskPng, class_names(project));
    ds.declare(keys::IMAGES_TRAIN, "images/train")
        .declare(keys::IMAGES_VAL, "images/val")
        .declare(keys::MASKS_TRAIN, "masks/train")
        .declare(keys::MASKS_VAL, "masks/val")
        .declare(keys::CLASSES_FILE, "classes.txt");
    if plan.has_test() {
        ds.declare(keys::IMAGES_TEST, "images/test")
            .declare(keys::MASKS_TEST, "masks/test");
    }
    Ok(ds)
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

/// Qué dataset construir: proporciones de split, tarea y backend destino.
pub struct DatasetSpec<'a> {
    /// Ventaneo de series temporales; irrelevante para los backends de imagen.
    pub ts: TsSpec,
    pub val_split: f64,
    pub test_split: f64,
    pub task: &'a str,
    pub backend: &'a TrainingBackend,
}

/// Prepara dataset según el backend seleccionado
pub fn prepare_dataset_for_backend(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    spec: DatasetSpec<'_>,
) -> Result<PreparedDataset, String> {
    let DatasetSpec {
        ts,
        val_split,
        test_split,
        task,
        backend,
    } = spec;

    match backend {
        TrainingBackend::Yolo | TrainingBackend::RtDetr => prepare_dataset(
            images_dir, project, images, output_dir, val_split, test_split, task,
        ),
        TrainingBackend::RfDetr => prepare_coco_dataset(
            images_dir,
            project,
            images,
            output_dir,
            val_split,
            test_split,
            CocoLayout::RfDetr,
        ),
        // Los backends HF de detección y pose consumen COCO estándar.
        TrainingBackend::HfDetection => prepare_coco_dataset(
            images_dir,
            project,
            images,
            output_dir,
            val_split,
            test_split,
            CocoLayout::Coco,
        ),
        TrainingBackend::Smp | TrainingBackend::HfSegmentation => prepare_mask_dataset(
            images_dir, project, images, output_dir, val_split, test_split,
        ),
        TrainingBackend::HfInstance => prepare_coco_instance_dataset(
            images_dir, project, images, output_dir, val_split, test_split,
        ),
        TrainingBackend::HfPose => prepare_coco_keypoints_dataset(
            images_dir, project, images, output_dir, val_split, test_split,
        ),
        TrainingBackend::Timm | TrainingBackend::HfClassification => {
            prepare_classification_dataset_labeled(
                images_dir,
                project,
                images,
                output_dir,
                val_split,
                test_split,
                task == "multi_classify",
            )
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
            if *backend == TrainingBackend::PytorchForecasting {
                // pytorch-forecasting consume un CSV largo, no ventanas.
                prepare_timeseries_long_csv(project, project_dir, output_dir, val_split, test_split)
            } else {
                prepare_timeseries_arrays(
                    project,
                    project_dir,
                    output_dir,
                    val_split,
                    test_split,
                    task,
                    ts,
                )
            }
        }
        TrainingBackend::Sklearn => {
            let project_dir = images_dir
                .parent()
                .ok_or("No se pudo determinar el directorio del proyecto")?;
            prepare_tabular_dataset(project, project_dir, output_dir)
        }
    }
}

/// Prepares a tabular dataset: copies the first CSV from project tabular_data to output_dir
pub fn prepare_tabular_dataset(
    project: &ProjectFile,
    project_dir: &Path,
    output_dir: &Path,
) -> Result<PreparedDataset, String> {
    let entry = project
        .tabular_data
        .first()
        .ok_or_else(|| "No hay datos tabulares en el proyecto".to_string())?;

    std::fs::create_dir_all(output_dir)
        .map_err(|e| format!("Error creando directorio del dataset: {}", e))?;

    // El CSV vive en {proyecto}/tabular/{archivo}. Copiarlo aquí y no en el runner
    // es lo que permite que el paquete descargable incluya los datos: antes sólo el
    // runner local hacía la copia y el zip salía sin CSV.
    let src = project_dir.join("tabular").join(&entry.file);
    if !src.exists() {
        return Err(format!("No se encontró el CSV tabular: {:?}", src));
    }
    let dest = output_dir.join("data.csv");
    std::fs::copy(&src, &dest).map_err(|e| format!("Error copiando CSV tabular: {}", e))?;

    // La columna objetivo se eligió al importar el CSV y vive en el proyecto. Sin
    // esto el script depende de que la UI la reenvíe en `backendParams`, y no lo
    // hace: el entrenamiento tabular fallaba siempre con "Target column '' not found".
    let meta = serde_json::json!({
        "target_column": entry.target_column,
        "feature_columns": entry.feature_columns,
        "task_type": entry.task_type,
    });
    std::fs::write(
        output_dir.join("tabular_meta.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("Error escribiendo tabular_meta.json: {}", e))?;

    let mut ds = PreparedDataset::new(output_dir, DatasetFormat::TabularCsv, class_names(project));
    ds.declare(keys::TABLE_CSV, "data.csv")
        .declare(keys::TABLE_META, "tabular_meta.json");
    Ok(ds)
}

// ─── COCO Instance JSON Dataset (with polygon segmentation) ──────────────────

pub fn prepare_coco_instance_dataset(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
    test_split: f64,
) -> Result<PreparedDataset, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let plan = split_plan(project, total, val_split, test_split);
    let train_indices: &[usize] = &plan.train;
    let val_indices: &[usize] = &plan.val;
    let test_indices: &[usize] = &plan.test;

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

    let mut ds = PreparedDataset::new(
        output_dir,
        DatasetFormat::CocoInstanceJson,
        class_names(project),
    );
    ds.declare(keys::IMAGES_TRAIN, "train")
        .declare(keys::ANN_TRAIN, "annotations/instances_train.json")
        .declare(keys::IMAGES_VAL, "val")
        .declare(keys::ANN_VAL, "annotations/instances_val.json");

    if !test_indices.is_empty() {
        let test_dir = output_dir.join("test");
        std::fs::create_dir_all(&test_dir).map_err(|e| format!("Error creando test/: {}", e))?;
        let test_json = build_coco_instance_json(
            images_dir,
            project,
            images,
            test_indices,
            &categories,
            &test_dir,
        )?;
        std::fs::write(ann_dir.join("instances_test.json"), &test_json)
            .map_err(|e| format!("Error escribiendo instances_test.json: {}", e))?;
        ds.declare(keys::IMAGES_TEST, "test")
            .declare(keys::ANN_TEST, "annotations/instances_test.json");
    }

    Ok(ds)
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
    test_split: f64,
) -> Result<PreparedDataset, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let plan = split_plan(project, total, val_split, test_split);
    let train_indices: &[usize] = &plan.train;
    let val_indices: &[usize] = &plan.val;
    let test_indices: &[usize] = &plan.test;

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

    let mut ds = PreparedDataset::new(
        output_dir,
        DatasetFormat::CocoKeypointsJson,
        class_names(project),
    );
    ds.declare(keys::IMAGES_TRAIN, "train")
        .declare(keys::ANN_TRAIN, "annotations/person_keypoints_train.json")
        .declare(keys::IMAGES_VAL, "val")
        .declare(keys::ANN_VAL, "annotations/person_keypoints_val.json");

    std::fs::write(ann_dir.join("person_keypoints_train.json"), &train_json)
        .map_err(|e| format!("Error escribiendo keypoints train: {}", e))?;
    std::fs::write(ann_dir.join("person_keypoints_val.json"), &val_json)
        .map_err(|e| format!("Error escribiendo keypoints val: {}", e))?;

    if !test_indices.is_empty() {
        let test_dir = output_dir.join("test");
        std::fs::create_dir_all(&test_dir).map_err(|e| format!("Error creando test/: {}", e))?;
        let test_json = build_coco_keypoints_json(
            images_dir,
            project,
            images,
            test_indices,
            &categories,
            &test_dir,
        )?;
        std::fs::write(ann_dir.join("person_keypoints_test.json"), &test_json)
            .map_err(|e| format!("Error escribiendo keypoints test: {}", e))?;
        ds.declare(keys::IMAGES_TEST, "test")
            .declare(keys::ANN_TEST, "annotations/person_keypoints_test.json");
    }

    Ok(ds)
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

            // Las anotaciones de la app guardan `points: [{x, y, visible}]`; esto
            // leía un `keypoints: [x, y, v, …]` plano que el programa nunca escribe,
            // así que el JSON salía siempre sin keypoints y el dataset de pose vacío.
            let keypoints: Vec<f64> = match parse_keypoints(&ann.data) {
                Some(kp) => kp
                    .points
                    .iter()
                    .flat_map(|p| {
                        // COCO: 0 = ausente, 1 = presente oculto, 2 = visible.
                        [p.x, p.y, if p.visible { 2.0 } else { 1.0 }]
                    })
                    .collect(),
                None => continue,
            };

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

/// Dataset de clasificación para backends que no usan ImageFolder (timm, HF).
///
/// Escribe las imágenes planas por split y un JSON de etiquetas por split. Antes
/// estos dos backends recibían el layout `{split}/{nombre_de_clase}/` de
/// ultralytics y lo interpretaban con `int(nombre_carpeta)`, que para un nombre
/// como "gato" da 0: **todas** las imágenes quedaban etiquetadas como la clase 0 y
/// el entrenamiento salía adelante sin error, produciendo un modelo inútil.
///
/// El índice de clase es la posición en `project.classes`, el mismo criterio que
/// usan el resto de los exportadores.
pub fn prepare_classification_dataset_labeled(
    images_dir: &Path,
    project: &ProjectFile,
    images: &[ImageEntry],
    output_dir: &Path,
    val_split: f64,
    test_split: f64,
    multi_label: bool,
) -> Result<PreparedDataset, String> {
    let total = images.len();
    if total == 0 {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    let plan = split_plan(project, total, val_split, test_split);

    let indice_de_clase = |class_id: i64| project.classes.iter().position(|c| c.id == class_id);

    let mut ds = PreparedDataset::new(
        output_dir,
        if multi_label {
            DatasetFormat::MultiLabelCsv
        } else {
            DatasetFormat::ImageFolder
        },
        class_names(project),
    );

    for (split, idxs) in plan.splits() {
        let split_dir = output_dir.join("images").join(split);
        std::fs::create_dir_all(&split_dir)
            .map_err(|e| format!("Error creando images/{}: {}", split, e))?;

        let mut etiquetas = Vec::new();
        for &idx in idxs {
            let image = &images[idx];
            let src = images_dir.join(&image.file);
            if !src.exists() {
                log::warn!("Imagen no encontrada: {:?}, se omite", src);
                continue;
            }
            std::fs::copy(&src, split_dir.join(&image.name))
                .map_err(|e| format!("Error copiando {}: {}", image.name, e))?;

            if multi_label {
                let mut vector = vec![0u8; project.classes.len()];
                for ann in &image.annotations {
                    if let Some(pos) = indice_de_clase(ann.class_id) {
                        vector[pos] = 1;
                    }
                }
                etiquetas.push(serde_json::json!({
                    "filename": image.name,
                    "labels": vector,
                }));
            } else {
                // La clase de la imagen es la de su primera anotación: es el mismo
                // criterio del preparador ImageFolder de ultralytics.
                let Some(pos) = image
                    .annotations
                    .first()
                    .and_then(|ann| indice_de_clase(ann.class_id))
                else {
                    continue;
                };
                etiquetas.push(serde_json::json!({
                    "filename": image.name,
                    "label": pos,
                }));
            }
        }

        let nombre = format!("labels_{}.json", split);
        std::fs::write(
            output_dir.join(&nombre),
            serde_json::to_string_pretty(&etiquetas).unwrap_or_else(|_| "[]".into()),
        )
        .map_err(|e| format!("Error escribiendo {}: {}", nombre, e))?;

        match split {
            "train" => {
                ds.declare(keys::IMAGES_TRAIN, format!("images/{split}"))
                    .declare(keys::LABELS_JSON_TRAIN, &nombre);
            }
            "val" => {
                ds.declare(keys::IMAGES_VAL, format!("images/{split}"))
                    .declare(keys::LABELS_JSON_VAL, &nombre);
            }
            _ => {
                ds.declare(keys::IMAGES_TEST, format!("images/{split}"))
                    .declare(keys::LABELS_JSON_TEST, &nombre);
            }
        }
    }

    // Mismo formato "índice: nombre" que consume el resto de los scripts.
    let mut clases = String::new();
    for (i, cls) in project.classes.iter().enumerate() {
        clases.push_str(&format!("{}: {}\n", i, cls.name));
    }
    std::fs::write(output_dir.join("classes.txt"), &clases)
        .map_err(|e| format!("Error escribiendo classes.txt: {}", e))?;
    ds.declare(keys::CLASSES_FILE, "classes.txt");

    Ok(ds)
}

// ─── Series temporales: arrays ventaneados ───────────────────────────────────

/// Parámetros del ventaneo de series temporales.
///
/// Llegan de `backendParams` (la UI ya los expone) y antes se descartaban: los
/// scripts los leían con `let _window_size = ...` y luego cargaban `.npy` que nadie
/// generaba.
#[derive(Debug, Clone, Copy)]
pub struct TsSpec {
    pub window_size: usize,
    pub stride: usize,
    /// Pasos a predecir en forecasting/regresión.
    pub horizon: usize,
}

impl TsSpec {
    /// Lee el ventaneo de `backendParams`, con los valores por defecto de la UI.
    pub fn from_backend_params(bp: &serde_json::Value) -> Self {
        let leer = |clave: &str, por_defecto: usize| {
            bp.get(clave)
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(por_defecto)
        };
        Self {
            window_size: leer("window_size", 100),
            stride: leer("stride", 1),
            horizon: leer("horizon", leer("prediction_length", 1)),
        }
    }
}

impl Default for TsSpec {
    fn default() -> Self {
        Self {
            window_size: 100,
            stride: 1,
            horizon: 1,
        }
    }
}

/// Una serie leída del proyecto, ya en columnas de valores.
struct Serie {
    canales: Vec<Vec<f32>>,
    /// Clase por paso temporal (`-1` = sin anotar), derivada de las anotaciones.
    clase_por_paso: Vec<i64>,
}

/// Convierte los datos de una serie al formato interno.
fn leer_serie(
    project: &ProjectFile,
    project_dir: &Path,
    ts: &crate::store::project_file::TimeSeriesEntry,
) -> Option<Serie> {
    let data = read_series_data(project_dir, ts)?;
    let timestamps: Vec<f64> = data
        .get("timestamps")?
        .as_array()?
        .iter()
        .map(|v| v.as_f64().unwrap_or(f64::NAN))
        .collect();
    let valores = data.get("values")?.as_array()?;
    if timestamps.is_empty() || valores.is_empty() {
        return None;
    }

    // Univariante: [v, v, …]; multivariante: [[c1, c2], [c1, c2], …]
    let multivariante = valores.first().map(|v| v.is_array()).unwrap_or(false);
    let canales: Vec<Vec<f32>> = if multivariante {
        let n_canales = valores
            .first()
            .and_then(|v| v.as_array())
            .map(|a| a.len())?;
        (0..n_canales)
            .map(|c| {
                valores
                    .iter()
                    .map(|fila| {
                        fila.as_array()
                            .and_then(|a| a.get(c))
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0) as f32
                    })
                    .collect()
            })
            .collect()
    } else {
        vec![valores
            .iter()
            .map(|v| v.as_f64().unwrap_or(0.0) as f32)
            .collect()]
    };

    let pasos = canales.first().map(|c| c.len()).unwrap_or(0);
    if pasos == 0 {
        return None;
    }

    // Anotaciones → clase por paso. `point` marca un instante; `range`, un tramo.
    let indice_de_clase = |class_id: i64| project.classes.iter().position(|c| c.id == class_id);
    let indice_de_ts = |valor: f64| -> Option<usize> {
        timestamps
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                (*a - valor)
                    .abs()
                    .partial_cmp(&(*b - valor).abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(i, _)| i)
    };

    let mut clase_por_paso = vec![-1i64; pasos];
    for ann in &ts.annotations {
        let Some(clase) = ann.class_id.and_then(indice_de_clase) else {
            continue;
        };
        let clase = clase as i64;
        match ann.annotation_type.as_str() {
            "point" | "event" | "anomaly_point" => {
                if let Some(i) = ann
                    .data
                    .get("timestamp")
                    .and_then(|v| v.as_f64())
                    .and_then(indice_de_ts)
                {
                    clase_por_paso[i] = clase;
                }
            }
            _ => {
                let inicio = ann
                    .data
                    .get("startTimestamp")
                    .and_then(|v| v.as_f64())
                    .and_then(indice_de_ts);
                let fin = ann
                    .data
                    .get("endTimestamp")
                    .and_then(|v| v.as_f64())
                    .and_then(indice_de_ts);
                if let (Some(a), Some(b)) = (inicio, fin) {
                    let desde = a.min(b);
                    let hasta = a.max(b).min(pasos - 1);
                    for celda in &mut clase_por_paso[desde..=hasta] {
                        *celda = clase;
                    }
                }
            }
        }
    }

    Some(Serie {
        canales,
        clase_por_paso,
    })
}

/// Tramo temporal de una serie asignado a un split.
struct Tramo {
    serie: usize,
    inicio: usize,
    fin: usize,
}

/// Reparte cada serie en el tiempo: el split de series temporales **no** puede
/// barajar, o el modelo valida con pasos anteriores a los que entrenó.
fn tramos_por_split(
    pasos: usize,
    val_split: f64,
    test_split: f64,
    serie: usize,
) -> Vec<(&'static str, Tramo)> {
    let val = ((pasos as f64) * val_split).round() as usize;
    let test = ((pasos as f64) * test_split).round() as usize;
    let train = pasos.saturating_sub(val + test);
    let mut out = Vec::new();
    if train > 0 {
        out.push((
            "train",
            Tramo {
                serie,
                inicio: 0,
                fin: train,
            },
        ));
    }
    if val > 0 {
        out.push((
            "val",
            Tramo {
                serie,
                inicio: train,
                fin: train + val,
            },
        ));
    }
    if test > 0 {
        out.push((
            "test",
            Tramo {
                serie,
                inicio: train + val,
                fin: pasos,
            },
        ));
    }
    out
}

/// Prepara arrays `.npy` ventaneados para los backends de series temporales.
pub fn prepare_timeseries_arrays(
    project: &ProjectFile,
    project_dir: &Path,
    output_dir: &Path,
    val_split: f64,
    test_split: f64,
    task: &str,
    ts_spec: TsSpec,
) -> Result<PreparedDataset, String> {
    if project.timeseries.is_empty() {
        return Err("No hay series temporales en el proyecto".to_string());
    }
    std::fs::create_dir_all(output_dir).map_err(|e| format!("Error: {}", e))?;

    let series: Vec<Serie> = project
        .timeseries
        .iter()
        .filter_map(|ts| match leer_serie(project, project_dir, ts) {
            Some(s) => Some(s),
            None => {
                log::warn!("Serie {} sin datos legibles, se omite", ts.id);
                None
            }
        })
        .collect();
    if series.is_empty() {
        return Err("Ninguna serie temporal del proyecto tiene datos legibles".to_string());
    }

    let n_canales = series[0].canales.len();
    let stride = ts_spec.stride.max(1);
    let horizonte = ts_spec.horizon.max(1);
    let necesita_horizonte = matches!(task, "ts_forecast" | "ts_regress");

    // La ventana se acota por el **tramo de split más corto**, no por la serie
    // completa: con val_split=0.25 sobre 64 pasos, el tramo de validación tiene 16 y
    // una ventana de 63 no cabría en ninguno.
    let tramo_mas_corto = series
        .iter()
        .enumerate()
        .flat_map(|(i, serie)| {
            tramos_por_split(serie.canales[0].len(), val_split, test_split, i)
                .into_iter()
                .map(|(_, tramo)| tramo.fin - tramo.inicio)
                .collect::<Vec<_>>()
        })
        .min()
        .unwrap_or(0);

    let margen = if necesita_horizonte { horizonte } else { 0 };
    let ventana = ts_spec
        .window_size
        .min(tramo_mas_corto.saturating_sub(margen))
        .max(2);

    let mut ds = PreparedDataset::new(
        output_dir,
        DatasetFormat::TimeSeriesCsv,
        class_names(project),
    );

    // ── Caso especial: el perfil matricial trabaja sobre la serie completa ──
    if task == "ts_pattern" {
        let serie = &series[0];
        let datos: Vec<f32> = serie.canales[0].clone();
        let n = datos.len();
        npy::write_f32(&output_dir.join("x_train.npy"), &datos, &[n])?;
        ds.declare(keys::X_TRAIN, "x_train.npy");
        let meta = serde_json::json!({
            "task": task,
            "series": 1,
            "steps": n,
            "note": "serie completa sin ventanear: el perfil matricial la recorre entera",
        });
        std::fs::write(
            output_dir.join("ts_meta.json"),
            serde_json::to_string_pretty(&meta).unwrap_or_default(),
        )
        .map_err(|e| format!("Error escribiendo ts_meta.json: {}", e))?;
        ds.declare(keys::TS_META, "ts_meta.json");
        return Ok(ds);
    }

    // ── Ventanas por split, sin cruzar la frontera temporal ──
    let mut ventanas: std::collections::BTreeMap<&'static str, Vec<(usize, usize)>> =
        std::collections::BTreeMap::new();
    for (i, serie) in series.iter().enumerate() {
        let pasos = serie.canales[0].len();
        for (split, tramo) in tramos_por_split(pasos, val_split, test_split, i) {
            let mut inicio = tramo.inicio;
            while inicio + ventana + if necesita_horizonte { horizonte } else { 0 } <= tramo.fin {
                ventanas
                    .entry(split)
                    .or_default()
                    .push((tramo.serie, inicio));
                inicio += stride;
            }
        }
    }

    if ventanas.get("train").map(|v| v.is_empty()).unwrap_or(true) {
        return Err(format!(
            "Las series son demasiado cortas para ventanas de {} pasos.              Reduce `window_size` o importa series más largas.",
            ventana
        ));
    }

    // ── Normalización con estadísticas del train ──
    let mut medias = vec![0.0f64; n_canales];
    let mut desvios = vec![1.0f64; n_canales];
    if let Some(train) = ventanas.get("train") {
        for c in 0..n_canales {
            let mut suma = 0.0;
            let mut cuenta = 0.0;
            for (idx_serie, inicio) in train {
                for paso in *inicio..*inicio + ventana {
                    suma += series[*idx_serie].canales[c][paso] as f64;
                    cuenta += 1.0;
                }
            }
            let media = if cuenta > 0.0 { suma / cuenta } else { 0.0 };
            let mut var = 0.0;
            for (idx_serie, inicio) in train {
                for paso in *inicio..*inicio + ventana {
                    let d = series[*idx_serie].canales[c][paso] as f64 - media;
                    var += d * d;
                }
            }
            medias[c] = media;
            desvios[c] = if cuenta > 1.0 {
                (var / cuenta).sqrt().max(1e-8)
            } else {
                1.0
            };
        }
    }

    let normaliza = |valor: f32, canal: usize| -> f32 {
        ((valor as f64 - medias[canal]) / desvios[canal]) as f32
    };

    // ── Escritura de cada split ──
    for (split, lista) in &ventanas {
        if lista.is_empty() {
            continue;
        }
        let n = lista.len();

        // X con forma (ventanas, canales, pasos): el layout nativo de tsai.
        let mut x = Vec::with_capacity(n * n_canales * ventana);
        for (idx_serie, inicio) in lista {
            for c in 0..n_canales {
                for paso in *inicio..*inicio + ventana {
                    x.push(normaliza(series[*idx_serie].canales[c][paso], c));
                }
            }
        }
        let nombre_x = format!("x_{}.npy", split);
        npy::write_f32(&output_dir.join(&nombre_x), &x, &[n, n_canales, ventana])?;

        // Y según la tarea.
        let nombre_y = format!("y_{}.npy", split);
        match task {
            "ts_forecast" | "ts_regress" => {
                let mut y = Vec::with_capacity(n * horizonte);
                for (idx_serie, inicio) in lista {
                    for paso in *inicio + ventana..*inicio + ventana + horizonte {
                        y.push(normaliza(series[*idx_serie].canales[0][paso], 0));
                    }
                }
                npy::write_f32(&output_dir.join(&nombre_y), &y, &[n, horizonte])?;
            }
            "ts_segment" | "ts_event" => {
                // Etiqueta por paso: 0 = sin anotar, 1..N = clase.
                let mut y = Vec::with_capacity(n * ventana);
                for (idx_serie, inicio) in lista {
                    for paso in *inicio..*inicio + ventana {
                        let clase = series[*idx_serie].clase_por_paso[paso];
                        y.push(if clase < 0 { 0 } else { clase + 1 });
                    }
                }
                npy::write_i64(&output_dir.join(&nombre_y), &y, &[n, ventana])?;
            }
            _ => {
                // Clasificación y anomalía: la clase del centro de la ventana.
                let mut y = Vec::with_capacity(n);
                for (idx_serie, inicio) in lista {
                    let centro = inicio + ventana / 2;
                    let clase = series[*idx_serie].clase_por_paso[centro];
                    y.push(if clase < 0 { 0 } else { clase + 1 });
                }
                npy::write_i64(&output_dir.join(&nombre_y), &y, &[n])?;
            }
        }

        match *split {
            "train" => {
                ds.declare(keys::X_TRAIN, &nombre_x)
                    .declare(keys::Y_TRAIN, &nombre_y);
            }
            "val" => {
                ds.declare(keys::X_VAL, &nombre_x)
                    .declare(keys::Y_VAL, &nombre_y);
            }
            _ => {
                ds.declare(keys::X_TEST, &nombre_x)
                    .declare(keys::Y_TEST, &nombre_y);
            }
        }
    }

    // Los backends que piden val pero no lo tienen (una sola serie muy corta)
    // reciben el propio train: es mejor que fallar al generar el script.
    if !ds.has(keys::X_VAL) {
        if let Ok(x_train) = ds.input(keys::X_TRAIN).map(|s| s.to_string()) {
            ds.declare(keys::X_VAL, &x_train);
        }
        if let Ok(y_train) = ds.input(keys::Y_TRAIN).map(|s| s.to_string()) {
            ds.declare(keys::Y_VAL, &y_train);
        }
    }

    let meta = serde_json::json!({
        "task": task,
        "window_size": ventana,
        "stride": stride,
        "horizon": horizonte,
        "channels": n_canales,
        "layout": "x: (ventanas, canales, pasos)",
        "normalization": {"kind": "zscore-por-canal", "mean": medias, "std": desvios},
        "classes": project.classes.iter().map(|c| &c.name).collect::<Vec<_>>(),
        "label_offset": 1,
        "series": series.len(),
    });
    std::fs::write(
        output_dir.join("ts_meta.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("Error escribiendo ts_meta.json: {}", e))?;
    ds.declare(keys::TS_META, "ts_meta.json");

    Ok(ds)
}

// ─── TimeSeries CSV Dataset ──────────────────────────────────────────────────

/// CSV en formato largo para pytorch-forecasting: una fila por (serie, paso).
///
/// `TimeSeriesDataSet` exige exactamente esta forma —`series_id`, `time_idx`,
/// `target`—. El preparador anterior escribía un CSV por serie más un
/// `metadata.json`, que ningún script leía: el entrenamiento moría buscando
/// `data.csv`.
pub fn prepare_timeseries_long_csv(
    project: &ProjectFile,
    project_dir: &Path,
    output_dir: &Path,
    val_split: f64,
    test_split: f64,
) -> Result<PreparedDataset, String> {
    if project.timeseries.is_empty() {
        return Err("No hay series temporales en el proyecto".to_string());
    }
    std::fs::create_dir_all(output_dir).map_err(|e| format!("Error: {}", e))?;

    let mut filas = Vec::new();
    let mut columnas_extra = 0usize;
    let mut exportadas = 0usize;

    for ts in &project.timeseries {
        let Some(serie) = leer_serie(project, project_dir, ts) else {
            log::warn!("Serie {} sin datos legibles, se omite", ts.id);
            continue;
        };
        columnas_extra = columnas_extra.max(serie.canales.len().saturating_sub(1));
        let pasos = serie.canales[0].len();
        for paso in 0..pasos {
            let mut fila = vec![
                ts.id.clone(),
                paso.to_string(),
                format!("{}", serie.canales[0][paso]),
            ];
            for canal in serie.canales.iter().skip(1) {
                fila.push(format!("{}", canal[paso]));
            }
            filas.push(fila.join(","));
        }
        exportadas += 1;
    }

    if exportadas == 0 {
        return Err("Ninguna serie temporal del proyecto tiene datos legibles".to_string());
    }

    let mut cabecera = vec![
        "series_id".to_string(),
        "time_idx".to_string(),
        "target".to_string(),
    ];
    for i in 0..columnas_extra {
        cabecera.push(format!("covariable_{}", i + 1));
    }
    let csv = format!("{}\n{}\n", cabecera.join(","), filas.join("\n"));
    std::fs::write(output_dir.join("long.csv"), &csv)
        .map_err(|e| format!("Error escribiendo long.csv: {}", e))?;

    let meta = serde_json::json!({
        "series": exportadas,
        "val_split": val_split,
        "test_split": test_split,
        "columns": cabecera,
    });
    std::fs::write(
        output_dir.join("ts_meta.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("Error escribiendo ts_meta.json: {}", e))?;

    let mut ds = PreparedDataset::new(
        output_dir,
        DatasetFormat::TimeSeriesCsv,
        class_names(project),
    );
    ds.declare(keys::LONG_CSV, "long.csv")
        .declare(keys::TS_META, "ts_meta.json");
    Ok(ds)
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
