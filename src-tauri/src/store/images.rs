use std::path::{Path, PathBuf};

use crate::store::project_file::{AnnotationEntry, ImageEntry, PredictionEntry};
use crate::store::safe_path::sanitize_filename;
use crate::store::state::AppState;

/// Calidad JPG usada para conversión retroactiva / normalización.
const JPG_QUALITY: u8 = 92;

/// Parámetros WebP derivados de un preset.
/// method: 0 (rápido) .. 6 (lento, mejor compresión).
struct WebpParams {
    lossless: bool,
    quality: f32,
    method: i32,
}

fn webp_params_for_preset(preset: &str) -> WebpParams {
    match preset {
        "lossless" => WebpParams { lossless: true,  quality: 100.0, method: 4 },
        "max"      => WebpParams { lossless: false, quality: 95.0,  method: 4 },
        "high"     => WebpParams { lossless: false, quality: 90.0,  method: 4 },
        "balanced" => WebpParams { lossless: false, quality: 82.0,  method: 2 },
        "fast"     => WebpParams { lossless: false, quality: 75.0,  method: 0 },
        _          => WebpParams { lossless: false, quality: 90.0,  method: 4 },
    }
}

/// Encodea con preset por defecto ("high"). Mantiene compatibilidad.
pub fn encode_image(img: &image::DynamicImage, target_format: &str) -> Result<Vec<u8>, String> {
    encode_image_with_preset(img, target_format, "high")
}

/// Encodea una imagen al formato destino con preset de calidad.
/// `target_format` debe ser "jpg" o "webp". `preset` solo aplica a webp.
pub fn encode_image_with_preset(
    img: &image::DynamicImage,
    target_format: &str,
    preset: &str,
) -> Result<Vec<u8>, String> {
    match target_format {
        "webp" => {
            let p = webp_params_for_preset(preset);
            let encoder = webp::Encoder::from_image(img)
                .map_err(|e| format!("Error creando encoder WebP: {}", e))?;
            let data = if p.lossless {
                // encode_lossless ignora method/quality del config simple
                encoder.encode_lossless()
            } else if p.method == 4 {
                // Path simple: usa default method del libwebp wrapper
                encoder.encode(p.quality)
            } else {
                // Path avanzado: configurar method explícito
                let mut config = webp::WebPConfig::new()
                    .map_err(|_| "Error inicializando WebPConfig".to_string())?;
                config.lossless = 0;
                config.quality = p.quality;
                config.method = p.method;
                encoder.encode_advanced(&config)
                    .map_err(|e| format!("Error WebP encode_advanced: {:?}", e))?
            };
            Ok(data.to_vec())
        }
        "jpg" | "jpeg" => {
            use image::codecs::jpeg::JpegEncoder;
            let rgb = img.to_rgb8();
            let mut out = Vec::new();
            let encoder = JpegEncoder::new_with_quality(&mut out, JPG_QUALITY);
            rgb.write_with_encoder(encoder)
                .map_err(|e| format!("Error codificando JPEG: {}", e))?;
            Ok(out)
        }
        other => Err(format!("Formato no soportado: {}", other)),
    }
}

/// Reemplaza la extensión de un nombre de archivo por la correspondiente al formato.
pub fn filename_with_format(file_name: &str, target_format: &str) -> String {
    let ext = if target_format == "webp" { "webp" } else { "jpg" };
    let stem = Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.to_string());
    format!("{}.{}", stem, ext)
}

/// Reporte de conversión retroactiva
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConversionReport {
    pub converted: usize,
    pub skipped: usize,
    pub failed: Vec<String>,
}

/// Timestamp JS
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

/// Timestamp JS (público, para uso desde commands)
pub fn js_timestamp_pub() -> f64 {
    js_timestamp()
}

/// Respuesta de imagen para el frontend (compatible con TauriAnnotixImage)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImageResponse {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub name: String,
    #[serde(rename = "blobPath")]
    pub blob_path: String,
    pub width: u32,
    pub height: u32,
    pub annotations: Vec<AnnotationEntry>,
    pub metadata: ImageMetadataResponse,
    #[serde(rename = "videoId")]
    pub video_id: Option<String>,
    #[serde(rename = "frameIndex")]
    pub frame_index: Option<i64>,
    #[serde(rename = "lockedBy")]
    pub locked_by: Option<String>,
    #[serde(rename = "lockExpires")]
    pub lock_expires: Option<f64>,
    #[serde(rename = "downloadStatus", skip_serializing_if = "Option::is_none")]
    pub download_status: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub predictions: Vec<PredictionEntry>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImageMetadataResponse {
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

fn entry_to_response(entry: &ImageEntry, project_id: &str) -> ImageResponse {
    ImageResponse {
        id: entry.id.clone(),
        project_id: project_id.to_string(),
        name: entry.name.clone(),
        blob_path: entry.file.clone(),
        width: entry.width,
        height: entry.height,
        annotations: entry.annotations.clone(),
        metadata: ImageMetadataResponse {
            uploaded: entry.uploaded,
            annotated: entry.annotated,
            status: entry.status.clone(),
        },
        video_id: entry.video_id.clone(),
        frame_index: entry.frame_index,
        locked_by: entry.locked_by.clone(),
        lock_expires: entry.lock_expires,
        download_status: entry.download_status.clone(),
        predictions: entry.predictions.clone(),
    }
}

impl AppState {
    /// Escribe imagen a disco y retorna (id, ImageEntry) SIN tocar project.json.
    /// Usa width/height conocidas para evitar decodificar el archivo.
    pub fn prepare_image_entry(
        &self,
        project_id: &str,
        file_name: &str,
        data: &[u8],
        width: u32,
        height: u32,
        video_id: Option<&str>,
        frame_index: Option<i64>,
    ) -> Result<(String, ImageEntry), String> {
        let images_dir = self.project_images_dir(project_id)?;
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Error creando directorio de imágenes: {}", e))?;

        let id = uuid::Uuid::new_v4().to_string();
        let safe_file = sanitize_filename(file_name);
        let unique_name = format!("{}_{}", id, safe_file);
        let dest = images_dir.join(&unique_name);

        std::fs::write(&dest, data)
            .map_err(|e| format!("Error escribiendo imagen: {}", e))?;

        let now = js_timestamp();

        let entry = ImageEntry {
            id: id.clone(),
            name: file_name.to_string(),
            file: unique_name,
            width,
            height,
            uploaded: now,
            annotated: None,
            status: "pending".to_string(),
            annotations: vec![],
            video_id: video_id.map(|s| s.to_string()),
            frame_index,
            locked_by: None,
            lock_expires: None,
            download_status: None,
            predictions: vec![],
        };

        Ok((id, entry))
    }

    /// Inserta un batch de ImageEntry en project.json con un solo flush a disco.
    pub fn commit_image_entries(
        &self,
        project_id: &str,
        entries: Vec<ImageEntry>,
    ) -> Result<(), String> {
        if entries.is_empty() {
            return Ok(());
        }
        let now = js_timestamp();
        self.with_project_mut(project_id, |pf| {
            pf.images.extend(entries);
            pf.updated = now;
        })
    }

    pub fn upload_images_with_progress<F: Fn(usize, usize, &str) + Send + Sync>(
        &self,
        project_id: &str,
        file_paths: &[String],
        on_progress: F,
    ) -> Result<Vec<String>, String> {
        use rayon::prelude::*;
        use std::sync::atomic::{AtomicUsize, Ordering};

        let images_dir = self.project_images_dir(project_id)?;
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Error creando directorio de imágenes: {}", e))?;

        // Leer formato y preset del proyecto
        let (image_format, webp_preset) = self.with_project(project_id, |pf| {
            (pf.image_format.clone(), pf.webp_quality_preset.clone())
        })?;
        let target_format = image_format.as_str();

        let now = js_timestamp();
        let total = file_paths.len();
        let done = AtomicUsize::new(0);

        // Procesar imágenes en paralelo (decode + encode + write)
        let entries: Vec<Result<ImageEntry, String>> = file_paths
            .par_iter()
            .map(|file_path| {
                let source = PathBuf::from(file_path);
                let file_name = source
                    .file_name()
                    .ok_or("Nombre de archivo inválido")?
                    .to_string_lossy()
                    .to_string();

                let id = uuid::Uuid::new_v4().to_string();

                let source_ext = Path::new(&file_name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let source_matches_target = source_ext == target_format
                    || (target_format == "jpg" && source_ext == "jpeg");

                let safe_file = sanitize_filename(&file_name);
                let (unique_name, width, height) = if target_format == "webp" && !source_matches_target {
                    let img = image::open(&source)
                        .map_err(|e| format!("Error decodificando imagen {}: {}", file_name, e))?;
                    let w = img.width();
                    let h = img.height();
                    let target_name = filename_with_format(&safe_file, "webp");
                    let unique = format!("{}_{}", id, target_name);
                    let dest = images_dir.join(&unique);
                    let data = encode_image_with_preset(&img, "webp", &webp_preset)?;
                    std::fs::write(&dest, &data)
                        .map_err(|e| format!("Error escribiendo WebP {}: {}", file_name, e))?;
                    (unique, w, h)
                } else {
                    let unique = format!("{}_{}", id, safe_file);
                    let dest = images_dir.join(&unique);
                    std::fs::copy(&source, &dest)
                        .map_err(|e| format!("Error copiando imagen {}: {}", file_name, e))?;
                    let (w, h) = get_image_dimensions(&dest)?;
                    (unique, w, h)
                };

                let i = done.fetch_add(1, Ordering::Relaxed);
                on_progress(i + 1, total, &file_name);

                Ok(ImageEntry {
                    id,
                    name: file_name,
                    file: unique_name,
                    width,
                    height,
                    uploaded: now,
                    annotated: None,
                    status: "pending".to_string(),
                    annotations: vec![],
                    video_id: None,
                    frame_index: None,
                    locked_by: None,
                    lock_expires: None,
                    download_status: None,
                    predictions: vec![],
                })
            })
            .collect();

        // Si alguna falló, retornar error de la primera
        let mut new_entries = Vec::with_capacity(entries.len());
        for r in entries {
            new_entries.push(r?);
        }

        let ids: Vec<String> = new_entries.iter().map(|e| e.id.clone()).collect();

        self.with_project_mut(project_id, |pf| {
            pf.images.extend(new_entries);
            pf.updated = now;
        })?;

        on_progress(total, total, "");

        Ok(ids)
    }

    pub fn upload_image_bytes(
        &self,
        project_id: &str,
        file_name: &str,
        data: &[u8],
        annotations: &[AnnotationEntry],
        video_id: Option<&str>,
        frame_index: Option<i64>,
    ) -> Result<String, String> {
        let images_dir = self.project_images_dir(project_id)?;
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Error creando directorio de imágenes: {}", e))?;

        // Leer formato destino y preset del proyecto
        let (image_format, webp_preset) = self.with_project(project_id, |pf| {
            (pf.image_format.clone(), pf.webp_quality_preset.clone())
        })?;
        let target_format = image_format.as_str();

        let id = uuid::Uuid::new_v4().to_string();

        let source_ext = Path::new(file_name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let source_matches_target = source_ext == target_format
            || (target_format == "jpg" && source_ext == "jpeg");

        let safe_file = sanitize_filename(file_name);
        let (unique_name, width, height) = if target_format == "webp" && !source_matches_target {
            let img = image::load_from_memory(data)
                .map_err(|e| format!("Error decodificando imagen: {}", e))?;
            let w = img.width();
            let h = img.height();
            let target_name = filename_with_format(&safe_file, "webp");
            let unique = format!("{}_{}", id, target_name);
            let dest = images_dir.join(&unique);
            let webp_data = encode_image_with_preset(&img, "webp", &webp_preset)?;
            std::fs::write(&dest, &webp_data)
                .map_err(|e| format!("Error escribiendo WebP: {}", e))?;
            (unique, w, h)
        } else {
            let unique = format!("{}_{}", id, safe_file);
            let dest = images_dir.join(&unique);
            std::fs::write(&dest, data)
                .map_err(|e| format!("Error escribiendo imagen: {}", e))?;
            let (w, h) = get_image_dimensions(&dest)?;
            (unique, w, h)
        };
        let now = js_timestamp();
        let status = if annotations.is_empty() { "pending" } else { "annotated" };

        let entry = ImageEntry {
            id: id.clone(),
            name: file_name.to_string(),
            file: unique_name,
            width,
            height,
            uploaded: now,
            annotated: if annotations.is_empty() { None } else { Some(now) },
            status: status.to_string(),
            annotations: annotations.to_vec(),
            video_id: video_id.map(|s| s.to_string()),
            frame_index,
            locked_by: None,
            lock_expires: None,
            download_status: None,
            predictions: vec![],
        };

        self.with_project_mut(project_id, |pf| {
            pf.images.push(entry);
            pf.updated = now;
        })?;

        Ok(id)
    }

    pub fn store_get_image(&self, project_id: &str, image_id: &str) -> Result<Option<ImageResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.images.iter()
                .find(|i| i.id == image_id)
                .map(|i| entry_to_response(i, &pf.id))
        })
    }

    pub fn list_images(&self, project_id: &str) -> Result<Vec<ImageResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.images.iter()
                .map(|i| entry_to_response(i, &pf.id))
                .collect()
        })
    }

    pub fn list_frames_by_video(&self, project_id: &str, video_id: &str) -> Result<Vec<ImageResponse>, String> {
        self.with_project(project_id, |pf| {
            let mut frames: Vec<ImageResponse> = pf.images.iter()
                .filter(|i| i.video_id.as_deref() == Some(video_id))
                .map(|i| entry_to_response(i, &pf.id))
                .collect();
            frames.sort_by_key(|f| f.frame_index.unwrap_or(0));
            frames
        })
    }

    pub fn save_annotations(
        &self,
        project_id: &str,
        image_id: &str,
        annotations: &[AnnotationEntry],
    ) -> Result<(), String> {
        let now = js_timestamp();
        self.with_project_mut(project_id, |pf| {
            if let Some(img) = pf.images.iter_mut().find(|i| i.id == image_id) {
                img.annotations = annotations.to_vec();
                img.status = if annotations.is_empty() { "pending".to_string() } else { "annotated".to_string() };
                img.annotated = if annotations.is_empty() { None } else { Some(now) };
            }
            pf.updated = now;
        })
    }

    pub fn delete_image(&self, project_id: &str, image_id: &str) -> Result<(), String> {
        // Obtener el archivo antes de eliminar
        let file = self.with_project(project_id, |pf| {
            pf.images.iter().find(|i| i.id == image_id).map(|i| i.file.clone())
        })?;

        // Eliminar de project.json
        self.with_project_mut(project_id, |pf| {
            pf.images.retain(|i| i.id != image_id);
            pf.updated = js_timestamp();
        })?;

        // Eliminar archivo físico
        if let Some(file) = file {
            let images_dir = self.project_images_dir(project_id)?;
            let path = images_dir.join(&file);
            let _ = std::fs::remove_file(&path);

            // Intentar eliminar thumbnail también
            let thumbs_dir = self.project_thumbnails_dir(project_id)?;
            let thumb_path = thumbs_dir.join(format!("{}.jpg", image_id));
            let _ = std::fs::remove_file(&thumb_path);
        }

        Ok(())
    }
}

fn get_image_dimensions(path: &PathBuf) -> Result<(u32, u32), String> {
    if let Ok(dims) = image::image_dimensions(path) {
        return Ok(dims);
    }
    let img = image::open(path).map_err(|e| format!("Error leyendo dimensiones: {}", e))?;
    Ok((img.width(), img.height()))
}

impl AppState {
    /// Convierte todas las imágenes del proyecto al formato destino.
    /// Operación atómica por imagen (si falla una, la anterior queda intacta).
    /// Regenera thumbnails. Actualiza pf.image_format.
    pub fn convert_project_images(
        &self,
        project_id: &str,
        target_format: &str,
    ) -> Result<ConversionReport, String> {
        if target_format != "jpg" && target_format != "webp" {
            return Err(format!("Formato no soportado: {}", target_format));
        }
        let target_ext_lower = if target_format == "webp" { "webp" } else { "jpg" };

        use rayon::prelude::*;

        let images_dir = self.project_images_dir(project_id)?;
        let thumbs_dir = self.project_thumbnails_dir(project_id)?;
        std::fs::create_dir_all(&thumbs_dir)
            .map_err(|e| format!("Error creando thumbnails dir: {}", e))?;

        // Snapshot de imágenes y preset para iterar sin tener el lock
        let (entries, webp_preset): (Vec<(String, String)>, String) = self.with_project(project_id, |pf| {
            let e = pf.images.iter().map(|i| (i.id.clone(), i.file.clone())).collect();
            (e, pf.webp_quality_preset.clone())
        })?;

        enum ConvertOutcome {
            Converted(String, String), // (image_id, new_file_name)
            Skipped,
            Failed(String),
        }

        // Procesar en paralelo
        let outcomes: Vec<ConvertOutcome> = entries.par_iter().map(|(image_id, file_name)| {
            let current_path = images_dir.join(file_name);
            let current_ext = Path::new(file_name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if current_ext == target_ext_lower {
                return ConvertOutcome::Skipped;
            }

            let img = match image::open(&current_path) {
                Ok(i) => i,
                Err(e) => return ConvertOutcome::Failed(format!("{}: decode fail ({})", file_name, e)),
            };

            let new_file_name = filename_with_format(file_name, target_format);
            let new_path = images_dir.join(&new_file_name);

            if new_path == current_path {
                return ConvertOutcome::Skipped;
            }

            let encoded = match encode_image_with_preset(&img, target_format, &webp_preset) {
                Ok(b) => b,
                Err(e) => return ConvertOutcome::Failed(format!("{}: encode fail ({})", file_name, e)),
            };

            if let Err(e) = std::fs::write(&new_path, &encoded) {
                return ConvertOutcome::Failed(format!("{}: write fail ({})", file_name, e));
            }

            let _ = std::fs::remove_file(&current_path);

            let thumb = img.thumbnail(256, 256);
            let thumb_path = thumbs_dir.join(format!("{}.jpg", image_id));
            let _ = thumb.save(&thumb_path);

            ConvertOutcome::Converted(image_id.clone(), new_file_name)
        }).collect();

        let mut converted = 0usize;
        let mut skipped = 0usize;
        let mut failed: Vec<String> = Vec::new();
        let mut new_files: Vec<(String, String)> = Vec::new();
        for o in outcomes {
            match o {
                ConvertOutcome::Converted(id, name) => { converted += 1; new_files.push((id, name)); }
                ConvertOutcome::Skipped => skipped += 1,
                ConvertOutcome::Failed(msg) => failed.push(msg),
            }
        }

        // Actualizar project.json con nuevos nombres y nuevo formato
        self.with_project_mut(project_id, |pf| {
            for (image_id, new_name) in new_files.iter() {
                if let Some(img) = pf.images.iter_mut().find(|i| &i.id == image_id) {
                    img.file = new_name.clone();
                }
            }
            pf.image_format = target_format.to_string();
            pf.updated = js_timestamp();
        })?;

        Ok(ConversionReport { converted, skipped, failed })
    }
}
