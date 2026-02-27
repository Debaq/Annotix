use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

use super::migrations;

pub struct Database {
    pub conn: Mutex<Connection>,
    pub data_dir: PathBuf,
}

impl Database {
    pub fn new() -> Result<Self, String> {
        let base_dir = directories::ProjectDirs::from("com", "tecmedhub", "annotix")
            .ok_or("No se pudo determinar el directorio de datos")?;

        let data_dir = base_dir.data_dir().to_path_buf();
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("No se pudo crear directorio de datos: {}", e))?;

        let db_path = data_dir.join("annotix.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("No se pudo abrir la base de datos: {}", e))?;

        // Habilitar WAL mode y foreign keys
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;"
        )
        .map_err(|e| format!("Error configurando pragmas: {}", e))?;

        let db = Database {
            conn: Mutex::new(conn),
            data_dir,
        };

        migrations::run_migrations(&db)?;

        log::info!("Base de datos inicializada en: {:?}", db_path);
        Ok(db)
    }

    /// Directorio de imágenes para un proyecto
    pub fn project_images_dir(&self, project_id: i64) -> PathBuf {
        self.data_dir.join("projects").join(project_id.to_string()).join("images")
    }

    /// Directorio de thumbnails para un proyecto
    pub fn project_thumbnails_dir(&self, project_id: i64) -> PathBuf {
        self.data_dir.join("projects").join(project_id.to_string()).join("thumbnails")
    }

    /// Ruta absoluta al archivo de imagen
    pub fn get_image_file_path(&self, project_id: i64, blob_path: &str) -> Result<PathBuf, String> {
        let path = self.project_images_dir(project_id).join(blob_path);
        if !path.exists() {
            return Err(format!("Archivo de imagen no encontrado: {:?}", path));
        }
        Ok(path)
    }
}
