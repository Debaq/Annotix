use std::collections::{HashMap, HashSet};
use std::io::{Write, Seek};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::store::project_file::{ProjectFile, ImageEntry};
use crate::utils::converters::sanitize_folder_name;
use super::class_name;

pub fn export<F: Fn(f64)>(
    project: &ProjectFile,
    images: &[ImageEntry],
    images_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options_deflated = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let total = images.len() as f64;

    for (i, image) in images.iter().enumerate() {
        let class_ids = get_image_classes(image);

        if class_ids.is_empty() {
            // Unlabeled
            add_image_to_folder(&mut zip, "unlabeled", &image.name, image, images_dir)?;
        } else {
            for &class_id in &class_ids {
                let cls_name = class_name(&project.classes, class_id);
                let folder = sanitize_folder_name(&cls_name);

                let file_name = if class_ids.len() > 1 {
                    add_class_suffix(&image.name, class_id, project)
                } else {
                    image.name.clone()
                };

                add_image_to_folder(&mut zip, &folder, &file_name, image, images_dir)?;
            }
        }

        emit_progress(((i + 1) as f64 / total) * 100.0);
    }

    // README.txt
    let readme = generate_readme(project, images);
    zip.start_file("README.txt", options_deflated).map_err(|e| e.to_string())?;
    zip.write_all(readme.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_image_to_folder<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    folder: &str,
    file_name: &str,
    image: &ImageEntry,
    images_dir: &Path,
) -> Result<(), String> {
    let file_path = images_dir.join(&image.file);
    let mut data = std::fs::read(&file_path)
        .map_err(|e| format!("Error leyendo imagen {}: {}", image.name, e))?;

    // Transcodificar WebP → JPG si el file_name destino ya no es .webp (normalizado)
    if super::has_webp_ext(&image.file) && !super::has_webp_ext(file_name) {
        data = super::transcode_to_jpg(&data)
            .map_err(|e| format!("Error transcodificando {}: {}", image.file, e))?;
    }

    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let path = format!("{}/{}", folder, file_name);

    zip.start_file(&path, options).map_err(|e| e.to_string())?;
    zip.write_all(&data).map_err(|e| e.to_string())?;

    Ok(())
}

fn get_image_classes(image: &ImageEntry) -> Vec<i64> {
    let mut class_ids = HashSet::new();
    for ann in &image.annotations {
        class_ids.insert(ann.class_id);
    }
    class_ids.into_iter().collect()
}

fn add_class_suffix(filename: &str, class_id: i64, project: &ProjectFile) -> String {
    let cls_name = class_name(&project.classes, class_id);
    let sanitized = sanitize_folder_name(&cls_name);

    match filename.rfind('.') {
        Some(pos) => format!("{}_{}{}", &filename[..pos], sanitized, &filename[pos..]),
        None => format!("{}_{}", filename, sanitized),
    }
}

fn generate_readme(project: &ProjectFile, images: &[ImageEntry]) -> String {
    let mut lines = Vec::new();

    lines.push(format!("# {} - Classification Dataset", project.name));
    lines.push(String::new());
    lines.push("## Structure".to_string());
    lines.push(String::new());
    lines.push("Images are organized in folders by class:".to_string());
    lines.push(String::new());

    // Count images per class
    let mut class_counts: HashMap<i64, usize> = HashMap::new();
    let mut unlabeled_count = 0;

    for image in images {
        let class_ids = get_image_classes(image);
        if class_ids.is_empty() {
            unlabeled_count += 1;
        } else {
            for class_id in class_ids {
                *class_counts.entry(class_id).or_insert(0) += 1;
            }
        }
    }

    for cls in &project.classes {
        let count = class_counts.get(&cls.id).copied().unwrap_or(0);
        let folder = sanitize_folder_name(&cls.name);
        lines.push(format!("- {}/ ({} images)", folder, count));
    }

    if unlabeled_count > 0 {
        lines.push(format!("- unlabeled/ ({} images)", unlabeled_count));
    }

    lines.push(String::new());
    lines.push("## Statistics".to_string());
    lines.push(String::new());
    lines.push(format!("Total images: {}", images.len()));
    lines.push(format!("Total classes: {}", project.classes.len()));
    lines.push(String::new());

    lines.push("## Class Distribution".to_string());
    lines.push(String::new());
    for cls in &project.classes {
        let count = class_counts.get(&cls.id).copied().unwrap_or(0);
        let percentage = if !images.is_empty() {
            (count as f64 / images.len() as f64) * 100.0
        } else {
            0.0
        };
        lines.push(format!("{}: {} images ({:.1}%)", cls.name, count, percentage));
    }

    lines.push(String::new());
    lines.push("---".to_string());
    lines.push("Generated by Annotix - TecMedHub FabLab".to_string());
    lines.push(format!("Export Date: {}", chrono::Utc::now().to_rfc3339()));

    lines.join("\n")
}
