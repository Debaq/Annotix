use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use super::config::AppConfig;
use super::io;
use super::project_file::ProjectFile;

/// Proyecto abierto en cache
pub(crate) struct CachedProject {
    pub(crate) data: ProjectFile,
    pub(crate) dir: PathBuf,
    pub(crate) dirty: bool,
}

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub data_dir: PathBuf,
    /// Cache de proyectos en memoria: project_id -> CachedProject
    pub(crate) cache: Mutex<HashMap<String, CachedProject>>,
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
