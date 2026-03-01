use std::path::PathBuf;

use crate::store::project_file::{AnnotationEntry, ImageEntry};
use crate::store::state::AppState;

/// Timestamp JS
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
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
        let unique_name = format!("{}_{}", id, file_name);
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

    pub fn upload_images(
        &self,
        project_id: &str,
        file_paths: &[String],
    ) -> Result<Vec<String>, String> {
        let images_dir = self.project_images_dir(project_id)?;
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Error creando directorio de imágenes: {}", e))?;

        let now = js_timestamp();
        let mut new_entries = Vec::new();

        for file_path in file_paths {
            let source = PathBuf::from(file_path);
            let file_name = source
                .file_name()
                .ok_or("Nombre de archivo inválido")?
                .to_string_lossy()
                .to_string();

            let id = uuid::Uuid::new_v4().to_string();
            let unique_name = format!("{}_{}", id, file_name);
            let dest = images_dir.join(&unique_name);

            std::fs::copy(&source, &dest)
                .map_err(|e| format!("Error copiando imagen {}: {}", file_name, e))?;

            let (width, height) = get_image_dimensions(&dest)?;

            new_entries.push(ImageEntry {
                id: id.clone(),
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
            });
        }

        let ids: Vec<String> = new_entries.iter().map(|e| e.id.clone()).collect();

        self.with_project_mut(project_id, |pf| {
            pf.images.extend(new_entries);
            pf.updated = now;
        })?;

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

        let id = uuid::Uuid::new_v4().to_string();
        let unique_name = format!("{}_{}", id, file_name);
        let dest = images_dir.join(&unique_name);

        std::fs::write(&dest, data)
            .map_err(|e| format!("Error escribiendo imagen: {}", e))?;

        let (width, height) = get_image_dimensions(&dest)?;
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
    let img = image::open(path).map_err(|e| format!("Error leyendo dimensiones: {}", e))?;
    Ok((img.width(), img.height()))
}
