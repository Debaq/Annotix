use rusqlite::OptionalExtension;

use super::models::InferenceCache;
use super::Database;

impl Database {
    pub fn create_inference_cache(
        &self,
        image_id: i64,
        model_hash: &str,
        predictions: &serde_json::Value,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let predictions_json = serde_json::to_string(predictions).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO inference_cache (image_id, model_hash, predictions, timestamp)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![image_id, model_hash, predictions_json, now],
        )
        .map_err(|e| format!("Error creando cache de inferencia: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_inference_cache(
        &self,
        image_id: i64,
        model_hash: &str,
    ) -> Result<Option<InferenceCache>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, image_id, model_hash, predictions, timestamp
                 FROM inference_cache WHERE image_id = ?1 AND model_hash = ?2",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_row(rusqlite::params![image_id, model_hash], |row| {
                Ok(row_to_inference_cache(row))
            })
            .optional()
            .map_err(|e| e.to_string())?;

        match result {
            Some(Ok(cache)) => Ok(Some(cache)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn delete_inference_cache_by_image(&self, image_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM inference_cache WHERE image_id = ?1",
            rusqlite::params![image_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn row_to_inference_cache(row: &rusqlite::Row) -> Result<InferenceCache, String> {
    let predictions_json: String = row.get(3).map_err(|e| e.to_string())?;
    let predictions: serde_json::Value =
        serde_json::from_str(&predictions_json).unwrap_or_default();

    Ok(InferenceCache {
        id: Some(row.get(0).map_err(|e| e.to_string())?),
        image_id: row.get(1).map_err(|e| e.to_string())?,
        model_hash: row.get(2).map_err(|e| e.to_string())?,
        predictions,
        timestamp: row.get(4).map_err(|e| e.to_string())?,
    })
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
