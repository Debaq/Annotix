use super::Database;

pub fn run_migrations(db: &Database) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Obtener versión actual del schema
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);

    if version < 1 {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                classes TEXT NOT NULL DEFAULT '[]',
                metadata_created REAL NOT NULL,
                metadata_updated REAL NOT NULL,
                metadata_version TEXT NOT NULL DEFAULT '2.0.0'
            );

            CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
            CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
            CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(metadata_created);

            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                blob_path TEXT NOT NULL,
                annotations TEXT NOT NULL DEFAULT '[]',
                dim_width INTEGER NOT NULL DEFAULT 0,
                dim_height INTEGER NOT NULL DEFAULT 0,
                metadata_uploaded REAL NOT NULL,
                metadata_annotated REAL,
                metadata_status TEXT NOT NULL DEFAULT 'pending',
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id);
            CREATE INDEX IF NOT EXISTS idx_images_status ON images(metadata_status);
            CREATE INDEX IF NOT EXISTS idx_images_uploaded ON images(metadata_uploaded);

            CREATE TABLE IF NOT EXISTS timeseries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                data TEXT NOT NULL DEFAULT '{}',
                annotations TEXT NOT NULL DEFAULT '[]',
                metadata_uploaded REAL NOT NULL,
                metadata_annotated REAL,
                metadata_status TEXT NOT NULL DEFAULT 'pending',
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_timeseries_project ON timeseries(project_id);
            CREATE INDEX IF NOT EXISTS idx_timeseries_status ON timeseries(metadata_status);

            CREATE TABLE IF NOT EXISTS inference_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_id INTEGER NOT NULL,
                model_hash TEXT NOT NULL,
                predictions TEXT NOT NULL DEFAULT '[]',
                timestamp REAL NOT NULL,
                FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_inference_image ON inference_cache(image_id);
            CREATE INDEX IF NOT EXISTS idx_inference_model ON inference_cache(model_hash);

            CREATE TABLE IF NOT EXISTS training_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                config TEXT NOT NULL DEFAULT '{}',
                progress REAL NOT NULL DEFAULT 0,
                logs TEXT NOT NULL DEFAULT '[]',
                metrics TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_training_project ON training_jobs(project_id);
            CREATE INDEX IF NOT EXISTS idx_training_status ON training_jobs(status);

            PRAGMA user_version = 1;
            ",
        )
        .map_err(|e| format!("Error en migración v1: {}", e))?;

        log::info!("Migración v1 aplicada: schema inicial");
    }

    Ok(())
}
