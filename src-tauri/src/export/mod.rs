pub mod yolo;
pub mod coco;
pub mod pascal_voc;
pub mod csv_export;
pub mod unet_masks;
pub mod folders_by_class;
pub mod tix;
pub mod audio_export;

use std::io::{Write, Seek};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use tauri::Emitter;
use crate::store::project_file::{ClassDef, ImageEntry};
use crate::store::AppState;

/// Datos de anotación extraídos de serde_json::Value
pub struct BBoxData {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub struct OBBData {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
}

pub struct PolygonData {
    pub points: Vec<(f64, f64)>,
}

pub struct KeypointsData {
    pub points: Vec<KeypointPoint>,
    pub instance_id: Option<i64>,
}

pub struct KeypointPoint {
    pub x: f64,
    pub y: f64,
    pub visible: bool,
    pub name: String,
}

pub struct LandmarksData {
    pub points: Vec<LandmarkPoint>,
}

pub struct LandmarkPoint {
    pub x: f64,
    pub y: f64,
    pub name: String,
}

pub struct MaskData {
    pub base64png: String,
}

// ─── Parsing helpers ────────────────────────────────────────────────────────

pub fn parse_bbox(data: &serde_json::Value) -> Option<BBoxData> {
    Some(BBoxData {
        x: data.get("x")?.as_f64()?,
        y: data.get("y")?.as_f64()?,
        width: data.get("width")?.as_f64()?,
        height: data.get("height")?.as_f64()?,
    })
}

pub fn parse_obb(data: &serde_json::Value) -> Option<OBBData> {
    Some(OBBData {
        x: data.get("x").or_else(|| data.get("cx"))?.as_f64()?,
        y: data.get("y").or_else(|| data.get("cy"))?.as_f64()?,
        width: data.get("width")?.as_f64()?,
        height: data.get("height")?.as_f64()?,
        rotation: data.get("rotation").or_else(|| data.get("angle")).and_then(|v| v.as_f64()).unwrap_or(0.0),
    })
}

pub fn parse_polygon(data: &serde_json::Value) -> Option<PolygonData> {
    let points_arr = data.get("points")?.as_array()?;
    let mut points = Vec::with_capacity(points_arr.len());
    for p in points_arr {
        let x = p.get("x")?.as_f64()?;
        let y = p.get("y")?.as_f64()?;
        points.push((x, y));
    }
    if points.len() < 3 {
        return None;
    }
    Some(PolygonData { points })
}

pub fn parse_keypoints(data: &serde_json::Value) -> Option<KeypointsData> {
    let points_arr = data.get("points").or_else(|| data.get("keypoints"))?.as_array()?;
    if points_arr.is_empty() {
        return None;
    }
    let mut points = Vec::with_capacity(points_arr.len());
    for (idx, p) in points_arr.iter().enumerate() {
        let x = p.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let y = p.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let visible = p.get("visible")
            .map(|v| v.as_bool().unwrap_or_else(|| v.as_f64().map(|n| n > 0.0).unwrap_or(false)))
            .unwrap_or(false);
        let name = p.get("name").and_then(|v| v.as_str()).map(|s| s.to_string())
            .unwrap_or_else(|| format!("point_{}", idx));
        points.push(KeypointPoint { x, y, visible, name });
    }
    let instance_id = data.get("instanceId").and_then(|v| v.as_i64());
    Some(KeypointsData { points, instance_id })
}

pub fn parse_landmarks(data: &serde_json::Value) -> Option<LandmarksData> {
    let points_arr = data.get("points")?.as_array()?;
    if points_arr.is_empty() {
        return None;
    }
    let mut points = Vec::with_capacity(points_arr.len());
    for (idx, p) in points_arr.iter().enumerate() {
        let x = p.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let y = p.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let name = p.get("name").and_then(|v| v.as_str()).map(|s| s.to_string())
            .unwrap_or_else(|| format!("Point {}", idx + 1));
        points.push(LandmarkPoint { x, y, name });
    }
    Some(LandmarksData { points })
}

pub fn parse_mask(data: &serde_json::Value) -> Option<MaskData> {
    let base64png = data.get("base64png")
        .or_else(|| data.get("imageData"))
        .and_then(|v| v.as_str())?;
    if base64png.is_empty() {
        return None;
    }
    Some(MaskData { base64png: base64png.to_string() })
}

/// Busca nombre de clase por ID
pub fn class_name(classes: &[ClassDef], class_id: i64) -> String {
    classes.iter()
        .find(|c| c.id == class_id)
        .map(|c| c.name.clone())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Transcodifica bytes de una imagen WebP a JPG (calidad 92).
/// Las imágenes con canal alpha se componen sobre fondo blanco (JPG no soporta transparencia).
pub fn transcode_to_jpg(data: &[u8]) -> Result<Vec<u8>, String> {
    use image::codecs::jpeg::JpegEncoder;
    use image::{DynamicImage, ImageEncoder};

    let img = image::load_from_memory(data)
        .map_err(|e| format!("Error decodificando imagen: {}", e))?;

    // Para alpha, componer sobre blanco y convertir a RGB8
    let rgb = match img {
        DynamicImage::ImageRgb8(_) => img.to_rgb8(),
        _ => {
            let rgba = img.to_rgba8();
            let (w, h) = rgba.dimensions();
            let mut rgb = image::RgbImage::new(w, h);
            for (x, y, px) in rgba.enumerate_pixels() {
                let [r, g, b, a] = px.0;
                let alpha = a as f32 / 255.0;
                let inv = 1.0 - alpha;
                let nr = (r as f32 * alpha + 255.0 * inv).round().clamp(0.0, 255.0) as u8;
                let ng = (g as f32 * alpha + 255.0 * inv).round().clamp(0.0, 255.0) as u8;
                let nb = (b as f32 * alpha + 255.0 * inv).round().clamp(0.0, 255.0) as u8;
                rgb.put_pixel(x, y, image::Rgb([nr, ng, nb]));
            }
            rgb
        }
    };

    let mut out = Vec::with_capacity(rgb.as_raw().len() / 4);
    let encoder = JpegEncoder::new_with_quality(&mut out, 92);
    encoder
        .write_image(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("Error codificando JPG: {}", e))?;
    Ok(out)
}

/// Reemplaza la extensión `.webp` por `.jpg` en cada `ImageEntry.name`.
/// El campo `file` (archivo en disco) se mantiene intacto: la transcodificación ocurre en `add_image_to_zip`.
pub fn normalize_image_names_to_jpg(images: &[ImageEntry]) -> Vec<ImageEntry> {
    images
        .iter()
        .map(|img| {
            let mut cloned = img.clone();
            if has_webp_ext(&cloned.name) {
                cloned.name = replace_webp_with_jpg(&cloned.name);
            }
            cloned
        })
        .collect()
}

pub fn has_webp_ext(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".webp")
}

pub fn replace_webp_with_jpg(name: &str) -> String {
    // Preserva el stem; cambia la extensión por .jpg
    match name.rfind('.') {
        Some(pos) => format!("{}.jpg", &name[..pos]),
        None => format!("{}.jpg", name),
    }
}

/// Agrega archivo de imagen al ZIP, leyendo los bytes desde disco.
///
/// Si el archivo en disco es `.webp` pero `image.name` ya no termina en `.webp`
/// (porque se aplicó `normalize_image_names_to_jpg`), transcodifica a JPG antes
/// de escribir en el ZIP.
pub fn add_image_to_zip<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    folder: &str,
    image: &ImageEntry,
    images_dir: &Path,
) -> Result<(), String> {
    let file_path = images_dir.join(&image.file);
    let mut data = std::fs::read(&file_path)
        .map_err(|e| format!("Error leyendo imagen {}: {}", image.name, e))?;

    // Transcodificar WebP → JPG si el name destino es .jpg pero el file en disco es .webp
    if has_webp_ext(&image.file) && !has_webp_ext(&image.name) {
        data = transcode_to_jpg(&data)
            .map_err(|e| format!("Error transcodificando {}: {}", image.file, e))?;
    }

    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let path = if folder.is_empty() {
        image.name.clone()
    } else {
        format!("{}/{}", folder, image.name)
    };

    zip.start_file(&path, options)
        .map_err(|e| format!("Error creando archivo en ZIP: {}", e))?;
    zip.write_all(&data)
        .map_err(|e| format!("Error escribiendo imagen en ZIP: {}", e))?;

    Ok(())
}

/// Exportar dataset completo a un archivo ZIP en output_path.
///
/// `normalize_to_jpg`: cuando es `true`, las imágenes WebP del proyecto se transcodifican a JPG (q=92)
/// y todas las referencias a nombre de archivo en los labels (YOLO txt, COCO json, Pascal xml, CSVs,
/// folders-by-class, unet-masks) usan la extensión `.jpg`. No afecta al formato Annotix (.tix) ni a
/// los formatos de audio.
pub fn export_dataset(
    state: &AppState,
    project_id: &str,
    format: &str,
    output_path: &str,
    normalize_to_jpg: bool,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let pf = state.read_project_file(project_id)?;

    let emit_progress = |progress: f64| {
        let _ = app_handle.emit("export:progress", progress);
    };

    let file = std::fs::File::create(output_path)
        .map_err(|e| format!("Error creando archivo de salida: {}", e))?;

    // ── Formato Annotix (.tix): archivo completo del proyecto ──────────────
    if format == "tix" {
        // Asegurar que project.json en disco esté actualizado
        let _ = state.flush_project(project_id);
        let project_dir = state.project_dir(project_id)?;
        return tix::export(&pf, &project_dir, file, emit_progress);
    }

    // ── Audio formats ──────────────────────────────────────────────────────
    if ["huggingface-asr", "ljspeech", "csv-audio-classification", "csv-sound-events"].contains(&format) {
        let audio_dir = state.project_dir(project_id)?.join("audio");

        if format == "csv-audio-classification" {
            let audio_entries: Vec<_> = pf.audio.iter()
                .filter(|a| a.class_id.is_some())
                .cloned()
                .collect();
            if audio_entries.is_empty() {
                return Err("No hay audios clasificados para exportar".to_string());
            }
            return audio_export::export_audio_classification_csv(&pf, &audio_entries, &audio_dir, file, emit_progress);
        }

        if format == "csv-sound-events" {
            let audio_entries: Vec<_> = pf.audio.iter()
                .filter(|a| !a.events.is_empty())
                .cloned()
                .collect();
            if audio_entries.is_empty() {
                return Err("No hay audios con eventos para exportar".to_string());
            }
            return audio_export::export_sound_events_csv(&pf, &audio_entries, &audio_dir, file, emit_progress);
        }

        // ASR formats
        let audio_entries: Vec<_> = pf.audio.iter()
            .filter(|a| !a.transcription.is_empty() || !a.segments.is_empty())
            .cloned()
            .collect();
        if audio_entries.is_empty() {
            return Err("No hay audios transcritos para exportar".to_string());
        }
        return match format {
            "huggingface-asr" => audio_export::export_huggingface(&pf, &audio_entries, &audio_dir, file, emit_progress),
            "ljspeech" => audio_export::export_ljspeech(&pf, &audio_entries, &audio_dir, file, emit_progress),
            _ => unreachable!(),
        };
    }

    // ── Image formats ──────────────────────────────────────────────────────
    let images_dir = state.project_images_dir(project_id)?;

    if pf.images.is_empty() {
        return Err("No hay imágenes en el proyecto".to_string());
    }

    // Solo exportar imágenes anotadas, y filtrar anotaciones con classId inválido
    let images: Vec<ImageEntry> = pf.images.iter().cloned()
        .filter(|img| !img.annotations.is_empty())
        .map(|mut img| {
            img.annotations.retain(|ann| {
                pf.classes.iter().any(|c| c.id == ann.class_id)
            });
            img
        })
        .filter(|img| !img.annotations.is_empty())
        .collect();

    if images.is_empty() {
        return Err("No hay imágenes anotadas para exportar".to_string());
    }

    // Aplicar normalización de nombres WebP → JPG si se solicitó
    let images = if normalize_to_jpg {
        normalize_image_names_to_jpg(&images)
    } else {
        images
    };

    match format {
        "yolo-detection" => yolo::export(&pf, &images, &images_dir, file, false, emit_progress),
        "yolo-segmentation" => yolo::export(&pf, &images, &images_dir, file, true, emit_progress),
        "coco" => coco::export(&pf, &images, &images_dir, file, emit_progress),
        "pascal-voc" => pascal_voc::export(&pf, &images, &images_dir, file, emit_progress),
        "csv-detection" => csv_export::export(&pf, &images, &images_dir, file, "detection", emit_progress),
        "csv-classification" => csv_export::export(&pf, &images, &images_dir, file, "classification", emit_progress),
        "csv-keypoints" => csv_export::export(&pf, &images, &images_dir, file, "keypoints", emit_progress),
        "csv-landmarks" => csv_export::export(&pf, &images, &images_dir, file, "landmarks", emit_progress),
        "folders-by-class" => folders_by_class::export(&pf, &images, &images_dir, file, emit_progress),
        "unet-masks" => unet_masks::export(&pf, &images, &images_dir, file, emit_progress),
        _ => Err(format!("Formato no soportado: {}", format)),
    }
}
