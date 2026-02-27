use rusqlite::OptionalExtension;

use super::models::{VideoMetadata, VideoRecord};
use super::Database;

impl Database {
    pub fn create_video(
        &self,
        project_id: i64,
        name: &str,
        source_path: &str,
        fps_extraction: f64,
        fps_original: Option<f64>,
        total_frames: i64,
        duration_ms: i64,
        width: i64,
        height: i64,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();

        conn.execute(
            "INSERT INTO videos (project_id, name, source_path, fps_extraction, fps_original,
             total_frames, duration_ms, dim_width, dim_height, metadata_uploaded, metadata_status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                project_id, name, source_path, fps_extraction, fps_original,
                total_frames, duration_ms, width, height, now, "processing",
            ],
        )
        .map_err(|e| format!("Error creando video: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_video(&self, id: i64) -> Result<Option<VideoRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, source_path, fps_extraction, fps_original,
                 total_frames, duration_ms, dim_width, dim_height, metadata_uploaded, metadata_status
                 FROM videos WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_row(rusqlite::params![id], |row| Ok(row_to_video(row)))
            .optional()
            .map_err(|e| e.to_string())?;

        match result {
            Some(Ok(video)) => Ok(Some(video)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_videos_by_project(&self, project_id: i64) -> Result<Vec<VideoRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, source_path, fps_extraction, fps_original,
                 total_frames, duration_ms, dim_width, dim_height, metadata_uploaded, metadata_status
                 FROM videos WHERE project_id = ?1 ORDER BY metadata_uploaded DESC",
            )
            .map_err(|e| e.to_string())?;

        let videos = stmt
            .query_map(rusqlite::params![project_id], |row| {
                Ok(row_to_video(row))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|r| r.ok())
            .collect();

        Ok(videos)
    }

    pub fn update_video_status(&self, id: i64, status: &str, total_frames: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE videos SET metadata_status = ?1, total_frames = ?2 WHERE id = ?3",
            rusqlite::params![status, total_frames, id],
        )
        .map_err(|e| format!("Error actualizando video: {}", e))?;
        Ok(())
    }

    pub fn delete_video(&self, id: i64) -> Result<Option<(i64, String)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Obtener project_id y source_path antes de eliminar
        let info: Option<(i64, String)> = conn
            .query_row(
                "SELECT project_id, source_path FROM videos WHERE id = ?1",
                rusqlite::params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        // CASCADE borrará tracks, keyframes e imágenes vinculadas
        conn.execute("DELETE FROM videos WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Error eliminando video: {}", e))?;

        Ok(info)
    }
}

fn row_to_video(row: &rusqlite::Row) -> Result<VideoRecord, String> {
    Ok(VideoRecord {
        id: Some(row.get(0).map_err(|e| e.to_string())?),
        project_id: row.get(1).map_err(|e| e.to_string())?,
        name: row.get(2).map_err(|e| e.to_string())?,
        source_path: row.get(3).map_err(|e| e.to_string())?,
        fps_extraction: row.get(4).map_err(|e| e.to_string())?,
        fps_original: row.get(5).map_err(|e| e.to_string())?,
        total_frames: row.get(6).map_err(|e| e.to_string())?,
        duration_ms: row.get(7).map_err(|e| e.to_string())?,
        width: row.get(8).map_err(|e| e.to_string())?,
        height: row.get(9).map_err(|e| e.to_string())?,
        metadata: VideoMetadata {
            uploaded: row.get(10).map_err(|e| e.to_string())?,
            status: row.get(11).map_err(|e| e.to_string())?,
        },
    })
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
