use rusqlite::OptionalExtension;

use super::models::{ImageMetadata, TimeSeriesAnnotation, TimeSeriesRecord};
use super::Database;

impl Database {
    pub fn create_timeseries(
        &self,
        project_id: i64,
        name: &str,
        data: &serde_json::Value,
        annotations: &[TimeSeriesAnnotation],
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let data_json = serde_json::to_string(data).map_err(|e| e.to_string())?;
        let annotations_json = serde_json::to_string(annotations).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO timeseries (project_id, name, data, annotations, metadata_uploaded, metadata_status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'pending')",
            rusqlite::params![project_id, name, data_json, annotations_json, now],
        )
        .map_err(|e| format!("Error creando timeseries: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_timeseries(&self, id: i64) -> Result<Option<TimeSeriesRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, data, annotations,
                 metadata_uploaded, metadata_annotated, metadata_status
                 FROM timeseries WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_row(rusqlite::params![id], |row| Ok(row_to_timeseries(row)))
            .optional()
            .map_err(|e| e.to_string())?;

        match result {
            Some(Ok(ts)) => Ok(Some(ts)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_timeseries_by_project(&self, project_id: i64) -> Result<Vec<TimeSeriesRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, data, annotations,
                 metadata_uploaded, metadata_annotated, metadata_status
                 FROM timeseries WHERE project_id = ?1 ORDER BY metadata_uploaded ASC",
            )
            .map_err(|e| e.to_string())?;

        let records = stmt
            .query_map(rusqlite::params![project_id], |row| {
                Ok(row_to_timeseries(row))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|r| r.ok())
            .collect();

        Ok(records)
    }

    pub fn save_ts_annotations(
        &self,
        timeseries_id: i64,
        annotations: &[TimeSeriesAnnotation],
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let annotations_json = serde_json::to_string(annotations).map_err(|e| e.to_string())?;
        let status = if annotations.is_empty() { "pending" } else { "annotated" };

        conn.execute(
            "UPDATE timeseries SET annotations = ?1, metadata_annotated = ?2, metadata_status = ?3
             WHERE id = ?4",
            rusqlite::params![
                annotations_json,
                if annotations.is_empty() { None } else { Some(now) },
                status,
                timeseries_id,
            ],
        )
        .map_err(|e| format!("Error guardando anotaciones TS: {}", e))?;

        Ok(())
    }

    pub fn delete_timeseries(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM timeseries WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Error eliminando timeseries: {}", e))?;

        Ok(())
    }

    pub fn count_timeseries_by_status(
        &self,
        project_id: i64,
        status: &str,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM timeseries WHERE project_id = ?1 AND metadata_status = ?2",
            rusqlite::params![project_id, status],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }
}

fn row_to_timeseries(row: &rusqlite::Row) -> Result<TimeSeriesRecord, String> {
    let data_json: String = row.get(3).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&data_json).unwrap_or_default();

    let annotations_json: String = row.get(4).map_err(|e| e.to_string())?;
    let annotations: Vec<TimeSeriesAnnotation> =
        serde_json::from_str(&annotations_json).unwrap_or_default();

    Ok(TimeSeriesRecord {
        id: Some(row.get(0).map_err(|e| e.to_string())?),
        project_id: row.get(1).map_err(|e| e.to_string())?,
        name: row.get(2).map_err(|e| e.to_string())?,
        data,
        annotations,
        metadata: ImageMetadata {
            uploaded: row.get(5).map_err(|e| e.to_string())?,
            annotated: row.get(6).map_err(|e| e.to_string())?,
            status: row.get(7).map_err(|e| e.to_string())?,
        },
    })
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
