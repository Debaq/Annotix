use rusqlite::OptionalExtension;

use super::models::{AnnotixImage, Annotation, ImageMetadata};
use super::Database;

impl Database {
    pub fn create_image(
        &self,
        project_id: i64,
        name: &str,
        blob_path: &str,
        width: u32,
        height: u32,
        annotations: &[Annotation],
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let annotations_json = serde_json::to_string(annotations).map_err(|e| e.to_string())?;
        let status = if annotations.is_empty() { "pending" } else { "annotated" };

        conn.execute(
            "INSERT INTO images (project_id, name, blob_path, annotations, dim_width, dim_height,
             metadata_uploaded, metadata_annotated, metadata_status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                project_id, name, blob_path, annotations_json,
                width, height, now,
                if annotations.is_empty() { None } else { Some(now) },
                status,
            ],
        )
        .map_err(|e| format!("Error creando imagen: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_image(&self, id: i64) -> Result<Option<AnnotixImage>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, blob_path, annotations, dim_width, dim_height,
                 metadata_uploaded, metadata_annotated, metadata_status
                 FROM images WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_row(rusqlite::params![id], |row| Ok(row_to_annotix_image(row)))
            .optional()
            .map_err(|e| e.to_string())?;

        match result {
            Some(Ok(image)) => Ok(Some(image)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_images_by_project(&self, project_id: i64) -> Result<Vec<AnnotixImage>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, blob_path, annotations, dim_width, dim_height,
                 metadata_uploaded, metadata_annotated, metadata_status
                 FROM images WHERE project_id = ?1 ORDER BY metadata_uploaded ASC",
            )
            .map_err(|e| e.to_string())?;

        let images = stmt
            .query_map(rusqlite::params![project_id], |row| {
                Ok(row_to_annotix_image(row))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|r| r.ok())
            .collect();

        Ok(images)
    }

    pub fn save_annotations(&self, image_id: i64, annotations: &[Annotation]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let annotations_json = serde_json::to_string(annotations).map_err(|e| e.to_string())?;
        let status = if annotations.is_empty() { "pending" } else { "annotated" };

        conn.execute(
            "UPDATE images SET annotations = ?1, metadata_annotated = ?2, metadata_status = ?3
             WHERE id = ?4",
            rusqlite::params![
                annotations_json,
                if annotations.is_empty() { None } else { Some(now) },
                status,
                image_id,
            ],
        )
        .map_err(|e| format!("Error guardando anotaciones: {}", e))?;

        Ok(())
    }

    pub fn delete_image(&self, id: i64) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Obtener blob_path antes de eliminar
        let blob_path: Option<String> = conn
            .query_row(
                "SELECT blob_path FROM images WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM images WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Error eliminando imagen: {}", e))?;

        Ok(blob_path)
    }

    pub fn count_images_by_project(&self, project_id: i64) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM images WHERE project_id = ?1",
            rusqlite::params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }
}

fn row_to_annotix_image(row: &rusqlite::Row) -> Result<AnnotixImage, String> {
    let annotations_json: String = row.get(4).map_err(|e| e.to_string())?;
    let annotations: Vec<Annotation> =
        serde_json::from_str(&annotations_json).unwrap_or_default();

    Ok(AnnotixImage {
        id: Some(row.get(0).map_err(|e| e.to_string())?),
        project_id: row.get(1).map_err(|e| e.to_string())?,
        name: row.get(2).map_err(|e| e.to_string())?,
        blob_path: row.get(3).map_err(|e| e.to_string())?,
        width: row.get::<_, u32>(5).map_err(|e| e.to_string())?,
        height: row.get::<_, u32>(6).map_err(|e| e.to_string())?,
        annotations,
        metadata: ImageMetadata {
            uploaded: row.get(7).map_err(|e| e.to_string())?,
            annotated: row.get(8).map_err(|e| e.to_string())?,
            status: row.get(9).map_err(|e| e.to_string())?,
        },
    })
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
