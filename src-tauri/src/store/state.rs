use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;

use super::config::AppConfig;
use super::io::{self, ProjectSummaryRaw};
use super::project_file::ProjectFile;

/// Proyecto abierto en cache
pub(crate) struct CachedProject {
    pub(crate) data: ProjectFile,
    pub(crate) dir: PathBuf,
    pub(crate) dirty: bool,
}

/// Entrada de cache para summaries (lectura ligera + mtime de project.json)
pub(crate) struct CachedSummary {
    pub(crate) mtime: SystemTime,
    pub(crate) summary: ProjectSummaryRaw,
}

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub data_dir: PathBuf,
    /// Cache de proyectos en memoria: project_id -> CachedProject
    pub(crate) cache: Mutex<HashMap<String, CachedProject>>,
    /// Cache de summaries para list_projects (clave: ruta absoluta del project.json)
    pub(crate) summary_cache: Mutex<HashMap<PathBuf, CachedSummary>>,
    /// Extracciones de fotogramas en curso, por `video_id`. La entrada existe
    /// mientras el hilo de extracción corre; se marca para cancelar quitándola
    /// de `extracting_videos` y añadiéndola a `cancelled_extractions`.
    extracting_videos: Mutex<HashSet<String>>,
    cancelled_extractions: Mutex<HashSet<String>>,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let base_dir = directories::ProjectDirs::from("com", "tecmedhub", "annotix")
            .ok_or("No se pudo determinar el directorio de datos")?;

        let data_dir = base_dir.data_dir().to_path_buf();
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("No se pudo crear directorio de datos: {}", e))?;

        let config = AppConfig::load(&data_dir);

        log::info!("AppState inicializado, data_dir: {:?}", data_dir);

        Ok(Self {
            config: Mutex::new(config),
            data_dir,
            cache: Mutex::new(HashMap::new()),
            summary_cache: Mutex::new(HashMap::new()),
            extracting_videos: Mutex::new(HashSet::new()),
            cancelled_extractions: Mutex::new(HashSet::new()),
        })
    }

    pub fn projects_dir(&self) -> Result<PathBuf, String> {
        let config = self.config.lock().map_err(|e| e.to_string())?;
        config
            .projects_dir
            .clone()
            .ok_or_else(|| "Directorio de proyectos no configurado".to_string())
    }

    pub fn project_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        let projects_dir = self.projects_dir()?;
        Ok(projects_dir.join(project_id))
    }

    // ─── Extracciones en curso ──────────────────────────────────────────────

    /// Reserva la extracción de un video. Devuelve `false` si ya hay una en
    /// curso, que es lo que evita que el resume automático del arranque y una
    /// pulsación del usuario escriban los mismos fotogramas dos veces.
    pub fn begin_extraction(&self, video_id: &str) -> Result<bool, String> {
        let mut extracting = self.extracting_videos.lock().map_err(|e| e.to_string())?;
        if extracting.contains(video_id) {
            return Ok(false);
        }
        extracting.insert(video_id.to_string());
        self.cancelled_extractions
            .lock()
            .map_err(|e| e.to_string())?
            .remove(video_id);
        Ok(true)
    }

    /// Libera la reserva al terminar (con éxito, con error o cancelada).
    pub fn end_extraction(&self, video_id: &str) {
        if let Ok(mut extracting) = self.extracting_videos.lock() {
            extracting.remove(video_id);
        }
        if let Ok(mut cancelled) = self.cancelled_extractions.lock() {
            cancelled.remove(video_id);
        }
    }

    /// Pide la cancelación de una extracción en curso.
    pub fn cancel_extraction(&self, video_id: &str) -> Result<bool, String> {
        let extracting = self.extracting_videos.lock().map_err(|e| e.to_string())?;
        if !extracting.contains(video_id) {
            return Ok(false);
        }
        self.cancelled_extractions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(video_id.to_string());
        Ok(true)
    }

    /// ¿Se pidió cancelar esta extracción?
    pub fn is_extraction_cancelled(&self, video_id: &str) -> bool {
        self.cancelled_extractions
            .lock()
            .map(|c| c.contains(video_id))
            .unwrap_or(false)
    }

    // ─── Cache helpers ──────────────────────────────────────────────────────

    /// Carga un proyecto en cache si no está ya.
    pub(crate) fn load_into_cache(&self, project_id: &str) -> Result<(), String> {
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        if cache.contains_key(project_id) {
            return Ok(());
        }

        let dir = self.project_dir(project_id)?;
        let pf = io::read_project(&dir)?;
        cache.insert(project_id.to_string(), CachedProject {
            data: pf,
            dir,
            dirty: false,
        });
        Ok(())
    }

    /// Escribe todos los proyectos dirty a disco
    #[allow(dead_code)]
    pub fn flush_all(&self) -> Result<(), String> {
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        for (_id, cached) in cache.iter_mut() {
            if cached.dirty {
                io::write_project(&cached.dir, &cached.data)?;
                cached.dirty = false;
            }
        }
        Ok(())
    }

    /// Escribe un proyecto específico si está dirty
    pub fn flush_project(&self, project_id: &str) -> Result<(), String> {
        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
        if let Some(cached) = cache.get_mut(project_id) {
            if cached.dirty {
                io::write_project(&cached.dir, &cached.data)?;
                cached.dirty = false;
            }
        }
        Ok(())
    }

    /// Devuelve una copia de la config actual
    pub fn get_app_config(&self) -> Result<AppConfig, String> {
        let config = self.config.lock().map_err(|e| e.to_string())?;
        Ok(config.clone())
    }

    /// Elimina un proyecto del cache
    pub fn evict_from_cache(&self, project_id: &str) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.remove(project_id);
        }
    }

    /// Vacía los caches de proyectos y summaries. Necesario cuando algo
    /// mueve carpetas o reescribe ids fuera del flujo normal (restauración de
    /// una carpeta de trabajo, cambio de `projects_dir`).
    pub fn clear_caches(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
        if let Ok(mut summaries) = self.summary_cache.lock() {
            summaries.clear();
        }
    }

    /// Inserta directamente un proyecto en cache (para proyectos recién creados)
    pub fn insert_into_cache(&self, project_id: &str, pf: ProjectFile, dir: PathBuf) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(project_id.to_string(), CachedProject {
                data: pf,
                dir,
                dirty: false,
            });
        }
    }
}
