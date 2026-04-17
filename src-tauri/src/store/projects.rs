use std::path::PathBuf;

use crate::store::io;
use crate::store::project_file::{ClassDef, P2pDownloadStatus, ProjectFile};
use crate::store::state::AppState;

use super::project_file::ImageEntry;

/// Timestamp compatible con JS Date.now()
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

/// Proyecto resumido para listado (sin cargar imágenes, videos, etc.)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub project_type: String,
    pub classes: Vec<ClassDef>,
    pub metadata: ProjectMetadata,
    #[serde(rename = "imageCount")]
    pub image_count: usize,
    #[serde(rename = "p2pDownload", skip_serializing_if = "Option::is_none")]
    pub p2p_download: Option<P2pDownloadStatus>,
    #[serde(rename = "hasP2pConfig")]
    pub has_p2p_config: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(rename = "inferenceModelCount")]
    pub inference_model_count: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProjectMetadata {
    pub created: f64,
    pub updated: f64,
    pub version: String,
}

impl AppState {
    pub fn create_project(
        &self,
        name: &str,
        project_type: &str,
        classes: &[ClassDef],
    ) -> Result<String, String> {
        let projects_dir = self.projects_dir()?;
        let id = uuid::Uuid::new_v4().to_string();
        let project_dir = projects_dir.join(&id);

        // Crear carpeta del proyecto con subdirectorios
        std::fs::create_dir_all(project_dir.join("images"))
            .map_err(|e| format!("Error creando directorio images: {}", e))?;
        std::fs::create_dir_all(project_dir.join("thumbnails"))
            .map_err(|e| format!("Error creando directorio thumbnails: {}", e))?;
        std::fs::create_dir_all(project_dir.join("videos"))
            .map_err(|e| format!("Error creando directorio videos: {}", e))?;

        let now = js_timestamp();
        let project = ProjectFile {
            version: 1,
            id: id.clone(),
            name: name.to_string(),
            project_type: project_type.to_string(),
            classes: classes.to_vec(),
            created: now,
            updated: now,
            images: vec![],
            timeseries: vec![],
            videos: vec![],
            training_jobs: vec![],
            tabular_data: vec![],
            audio: vec![],
            p2p: None,
            p2p_download: None,
            inference_models: vec![],
            folder: None,
            tts_sentences: vec![],
        };

        io::write_project(&project_dir, &project)?;

        // Insertar en cache
        self.insert_into_cache(&id, project, project_dir);

        log::info!("Proyecto creado: {} ({})", name, id);
        Ok(id)
    }

    pub fn list_projects(&self) -> Result<Vec<ProjectSummary>, String> {
        let projects_dir = self.projects_dir()?;
        if !projects_dir.exists() {
            return Ok(vec![]);
        }

        let mut summaries = Vec::new();

        let entries = std::fs::read_dir(&projects_dir)
            .map_err(|e| format!("Error leyendo directorio de proyectos: {}", e))?;

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let project_json = path.join("project.json");
            if !project_json.exists() {
                continue;
            }

            // Leer summary ligero sin cargar todo en cache
            match io::read_project(&path) {
                Ok(pf) => {
                    let p2p_download = pf.p2p_download.clone();
                    let has_p2p_config = pf.p2p.is_some();
                    summaries.push(ProjectSummary {
                        id: pf.id,
                        name: pf.name,
                        project_type: pf.project_type,
                        classes: pf.classes,
                        image_count: pf.images.len(),
                        metadata: ProjectMetadata {
                            created: pf.created,
                            updated: pf.updated,
                            version: format!("{}", pf.version),
                        },
                        p2p_download,
                        has_p2p_config,
                        folder: pf.folder,
                        inference_model_count: pf.inference_models.len(),
                    });
                }
                Err(e) => {
                    log::warn!("Error leyendo proyecto en {:?}: {}", path, e);
                    continue;
                }
            }
        }

        // Ordenar por fecha de creación descendente
        summaries.sort_by(|a, b| b.metadata.created.partial_cmp(&a.metadata.created).unwrap_or(std::cmp::Ordering::Equal));
        Ok(summaries)
    }

    pub fn get_project(&self, project_id: &str) -> Result<Option<ProjectSummary>, String> {
        let project_dir = self.project_dir(project_id)?;
        if !project_dir.join("project.json").exists() {
            return Ok(None);
        }

        self.with_project(project_id, |pf| {
            ProjectSummary {
                id: pf.id.clone(),
                name: pf.name.clone(),
                project_type: pf.project_type.clone(),
                classes: pf.classes.clone(),
                image_count: pf.images.len(),
                metadata: ProjectMetadata {
                    created: pf.created,
                    updated: pf.updated,
                    version: format!("{}", pf.version),
                },
                p2p_download: pf.p2p_download.clone(),
                has_p2p_config: pf.p2p.is_some(),
                folder: pf.folder.clone(),
                inference_model_count: pf.inference_models.len(),
            }
        }).map(Some)
    }

    pub fn set_project_folder(&self, project_id: &str, folder: Option<String>) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            pf.folder = folder;
        })
    }

    /// Guarda las clases con renumeración de IDs por posición y remapeo de referencias.
    /// El array de entrada define el nuevo orden; las IDs se reasignan 0..N-1.
    /// Las anotaciones, tracks, eventos, etc., que referencian una clase existente se remapean.
    /// Las clases eliminadas dejan anotaciones huérfanas que son removidas.
    pub fn save_classes(&self, project_id: &str, classes: Vec<ClassDef>) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            // Mapa old_id → new_id (solo para clases que existían antes)
            let existing_ids: std::collections::HashSet<i64> =
                pf.classes.iter().map(|c| c.id).collect();
            let mut id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
            for (new_idx, cls) in classes.iter().enumerate() {
                if existing_ids.contains(&cls.id) {
                    id_map.insert(cls.id, new_idx as i64);
                }
            }

            // Reescribir clases con IDs = posición
            pf.classes = classes
                .into_iter()
                .enumerate()
                .map(|(i, c)| ClassDef {
                    id: i as i64,
                    name: c.name,
                    color: c.color,
                })
                .collect();

            // Remapear anotaciones de imágenes (descartar huérfanas)
            for img in pf.images.iter_mut() {
                img.annotations.retain_mut(|ann| match id_map.get(&ann.class_id) {
                    Some(&new_id) => {
                        ann.class_id = new_id;
                        true
                    }
                    None => false,
                });
                // Predicciones no referencian project class_id directamente; se omiten.
            }

            // Remapear tracks de video
            for vid in pf.videos.iter_mut() {
                vid.tracks.retain_mut(|tr| match id_map.get(&tr.class_id) {
                    Some(&new_id) => {
                        tr.class_id = new_id;
                        true
                    }
                    None => false,
                });
            }

            // Remapear audio
            for a in pf.audio.iter_mut() {
                if let Some(cid) = a.class_id {
                    a.class_id = id_map.get(&cid).copied();
                }
                a.events.retain_mut(|ev| match id_map.get(&ev.class_id) {
                    Some(&new_id) => {
                        ev.class_id = new_id;
                        true
                    }
                    None => false,
                });
            }

            // Remapear anotaciones de series temporales
            for ts in pf.timeseries.iter_mut() {
                ts.annotations.retain_mut(|ann| match ann.class_id {
                    Some(cid) => match id_map.get(&cid) {
                        Some(&new_id) => {
                            ann.class_id = Some(new_id);
                            true
                        }
                        None => false,
                    },
                    None => true,
                });
            }

            // Remapear mapeos de modelos de inferencia (projectClassId se almacena como string)
            for model in pf.inference_models.iter_mut() {
                for m in model.class_mapping.iter_mut() {
                    if let Some(s) = m.project_class_id.as_ref() {
                        if let Ok(old) = s.parse::<i64>() {
                            m.project_class_id = id_map.get(&old).map(|v| v.to_string());
                        }
                    }
                }
            }

            pf.updated = js_timestamp();
        })
    }

    pub fn update_project(
        &self,
        project_id: &str,
        name: Option<&str>,
        project_type: Option<&str>,
        classes: Option<&[ClassDef]>,
    ) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            if let Some(n) = name {
                pf.name = n.to_string();
            }
            if let Some(t) = project_type {
                pf.project_type = t.to_string();
            }
            if let Some(c) = classes {
                pf.classes = c.to_vec();
            }
            pf.updated = js_timestamp();
        })
    }

    pub fn delete_project(&self, project_id: &str) -> Result<(), String> {
        // Flush y evictar del cache primero
        self.evict_from_cache(project_id);

        let project_dir = self.project_dir(project_id)?;
        if project_dir.exists() {
            std::fs::remove_dir_all(&project_dir)
                .map_err(|e| format!("Error eliminando proyecto: {}", e))?;
        }
        Ok(())
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    /// Lee project.json via cache, aplica closure de solo lectura
    pub fn with_project<F, R>(&self, project_id: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&ProjectFile) -> R,
    {
        self.load_into_cache(project_id)?;
        let cache = self.cache.lock().map_err(|e| e.to_string())?;
        let cached = cache.get(project_id)
            .ok_or_else(|| format!("Proyecto {} no encontrado en cache", project_id))?;
        Ok(f(&cached.data))
    }

    /// Lee, modifica project.json en cache y escribe a disco
    pub fn with_project_mut<F>(&self, project_id: &str, f: F) -> Result<(), String>
    where
        F: FnOnce(&mut ProjectFile),
    {
        self.load_into_cache(project_id)?;
        {
            let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
            let cached = cache.get_mut(project_id)
                .ok_or_else(|| format!("Proyecto {} no encontrado en cache", project_id))?;
            f(&mut cached.data);
            cached.dirty = true;
        }
        // Flush inmediato para garantizar persistencia
        self.flush_project(project_id)?;
        Ok(())
    }

    /// Lee, modifica project.json en cache, retorna valor, y escribe a disco
    #[allow(dead_code)]
    pub fn with_project_mut_ret<F, R>(&self, project_id: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut ProjectFile) -> R,
    {
        self.load_into_cache(project_id)?;
        let result;
        {
            let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
            let cached = cache.get_mut(project_id)
                .ok_or_else(|| format!("Proyecto {} no encontrado en cache", project_id))?;
            result = f(&mut cached.data);
            cached.dirty = true;
        }
        self.flush_project(project_id)?;
        Ok(result)
    }

    /// Directorio de imágenes de un proyecto
    pub fn project_images_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        Ok(self.project_dir(project_id)?.join("images"))
    }

    /// Directorio de thumbnails de un proyecto
    pub fn project_thumbnails_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        Ok(self.project_dir(project_id)?.join("thumbnails"))
    }

    /// Directorio de videos de un proyecto
    pub fn project_videos_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        Ok(self.project_dir(project_id)?.join("videos"))
    }

    /// Busca una imagen por ID dentro de un proyecto, retorna su ruta en disco
    pub fn get_image_file_path(&self, project_id: &str, image_id: &str) -> Result<PathBuf, String> {
        let file = self.with_project(project_id, |pf| {
            pf.images.iter().find(|i| i.id == image_id).map(|i| i.file.clone())
        })?;
        let file = file.ok_or_else(|| format!("Imagen {} no encontrada", image_id))?;
        let path = self.project_dir(project_id)?.join("images").join(&file);
        if !path.exists() {
            return Err(format!("Archivo de imagen no encontrado: {:?}", path));
        }
        Ok(path)
    }

    /// Lee el ProjectFile completo de un proyecto (copia desde cache)
    pub fn read_project_file(&self, project_id: &str) -> Result<ProjectFile, String> {
        self.with_project(project_id, |pf| pf.clone())
    }

    /// Obtiene una imagen por su ID
    #[allow(dead_code)]
    pub fn get_image_entry(&self, project_id: &str, image_id: &str) -> Result<Option<ImageEntry>, String> {
        self.with_project(project_id, |pf| {
            pf.images.iter().find(|i| i.id == image_id).cloned()
        })
    }
}
