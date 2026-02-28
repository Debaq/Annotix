use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::store::project_file::{ProjectFile, ImageEntry, AnnotationEntry};
use crate::utils::converters::{escape_xml, obb_to_aabbox};
use super::{parse_bbox, parse_obb, class_name, add_image_to_zip};

pub fn export<F: Fn(f64)>(
    project: &ProjectFile,
    images: &[ImageEntry],
    images_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let total = images.len() as f64;

    for (i, image) in images.iter().enumerate() {
        // Add image
        add_image_to_zip(&mut zip, "JPEGImages", image, images_dir)?;

        // Generate XML
        let xml = generate_xml(image, project);
        let xml_name = replace_ext(&image.name, "xml");
        zip.start_file(format!("Annotations/{}", xml_name), options).map_err(|e| e.to_string())?;
        zip.write_all(xml.as_bytes()).map_err(|e| e.to_string())?;

        emit_progress(((i + 1) as f64 / total) * 100.0);
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn generate_xml(image: &ImageEntry, project: &ProjectFile) -> String {
    let mut lines = Vec::new();

    lines.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string());
    lines.push("<annotation>".to_string());
    lines.push(format!("\t<folder>{}</folder>", escape_xml(&project.name)));
    lines.push(format!("\t<filename>{}</filename>", escape_xml(&image.name)));
    lines.push("\t<source>".to_string());
    lines.push("\t\t<database>Annotix</database>".to_string());
    lines.push("\t\t<annotation>Annotix Dataset</annotation>".to_string());
    lines.push("\t</source>".to_string());
    lines.push("\t<size>".to_string());
    lines.push(format!("\t\t<width>{}</width>", image.width));
    lines.push(format!("\t\t<height>{}</height>", image.height));
    lines.push("\t\t<depth>3</depth>".to_string());
    lines.push("\t</size>".to_string());
    lines.push("\t<segmented>0</segmented>".to_string());

    let bbox_annotations: Vec<&AnnotationEntry> = image.annotations.iter()
        .filter(|a| a.annotation_type == "bbox" || a.annotation_type == "obb")
        .collect();

    for ann in bbox_annotations {
        let name = class_name(&project.classes, ann.class_id);
        if let Some((xmin, ymin, xmax, ymax)) = get_bbox(ann) {
            lines.push("\t<object>".to_string());
            lines.push(format!("\t\t<name>{}</name>", escape_xml(&name)));
            lines.push("\t\t<pose>Unspecified</pose>".to_string());
            lines.push("\t\t<truncated>0</truncated>".to_string());
            lines.push("\t\t<difficult>0</difficult>".to_string());
            lines.push("\t\t<bndbox>".to_string());
            lines.push(format!("\t\t\t<xmin>{}</xmin>", xmin.round() as i64));
            lines.push(format!("\t\t\t<ymin>{}</ymin>", ymin.round() as i64));
            lines.push(format!("\t\t\t<xmax>{}</xmax>", xmax.round() as i64));
            lines.push(format!("\t\t\t<ymax>{}</ymax>", ymax.round() as i64));
            lines.push("\t\t</bndbox>".to_string());
            lines.push("\t</object>".to_string());
        }
    }

    lines.push("</annotation>".to_string());
    lines.join("\n")
}

fn get_bbox(ann: &AnnotationEntry) -> Option<(f64, f64, f64, f64)> {
    match ann.annotation_type.as_str() {
        "bbox" => {
            let bbox = parse_bbox(&ann.data)?;
            Some((bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height))
        }
        "obb" => {
            let obb = parse_obb(&ann.data)?;
            Some(obb_to_aabbox(obb.x, obb.y, obb.width, obb.height, obb.rotation))
        }
        _ => None,
    }
}

fn replace_ext(filename: &str, new_ext: &str) -> String {
    match filename.rfind('.') {
        Some(pos) => format!("{}.{}", &filename[..pos], new_ext),
        None => format!("{}.{}", filename, new_ext),
    }
}
