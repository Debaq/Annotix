use rusqlite::OptionalExtension;

use super::models::TrainingJob;
use super::Database;

impl Database {
    pub fn create_training_job(
        &self,
        project_id: i64,
        config: &serde_json::Value,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let config_json = serde_json::to_string(config).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO training_jobs (project_id, status, config, progress, logs, created_at, updated_at)
             VALUES (?1, 'pending', ?2, 0, '[]', ?3, ?4)",
            rusqlite::params![project_id, config_json, now, now],
        )
        .map_err(|e| format!("Error creando training job: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_training_job(&self, id: i64) -> Result<Option<TrainingJob>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, status, config, progress, logs, metrics, created_at, updated_at
                 FROM training_jobs WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_row(rusqlite::params![id], |row| Ok(row_to_training_job(row)))
            .optional()
            .map_err(|e| e.to_string())?;

        match result {
            Some(Ok(job)) => Ok(Some(job)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_training_jobs_by_project(&self, project_id: i64) -> Result<Vec<TrainingJob>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, status, config, progress, logs, metrics, created_at, updated_at
                 FROM training_jobs WHERE project_id = ?1 ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let jobs = stmt
            .query_map(rusqlite::params![project_id], |row| {
                Ok(row_to_training_job(row))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|r| r.ok())
            .collect();

        Ok(jobs)
    }

    pub fn update_training_job(
        &self,
        id: i64,
        status: Option<&str>,
        progress: Option<f64>,
        logs: Option<&[String]>,
        metrics: Option<&serde_json::Value>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();

        let mut updates = vec!["updated_at = ?1".to_string()];
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
        let mut idx = 2u32;

        if let Some(s) = status {
            updates.push(format!("status = ?{}", idx));
            params.push(Box::new(s.to_string()));
            idx += 1;
        }
        if let Some(p) = progress {
            updates.push(format!("progress = ?{}", idx));
            params.push(Box::new(p));
            idx += 1;
        }
        if let Some(l) = logs {
            let json = serde_json::to_string(l).map_err(|e| e.to_string())?;
            updates.push(format!("logs = ?{}", idx));
            params.push(Box::new(json));
            idx += 1;
        }
        if let Some(m) = metrics {
            let json = serde_json::to_string(m).map_err(|e| e.to_string())?;
            updates.push(format!("metrics = ?{}", idx));
            params.push(Box::new(json));
            idx += 1;
        }

        let sql = format!(
            "UPDATE training_jobs SET {} WHERE id = ?{}",
            updates.join(", "),
            idx
        );
        params.push(Box::new(id));

        let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, params_ref.as_slice())
            .map_err(|e| format!("Error actualizando training job: {}", e))?;

        Ok(())
    }
}

fn row_to_training_job(row: &rusqlite::Row) -> Result<TrainingJob, String> {
    let config_json: String = row.get(3).map_err(|e| e.to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_json).unwrap_or_default();

    let logs_json: String = row.get(5).map_err(|e| e.to_string())?;
    let logs: Vec<String> = serde_json::from_str(&logs_json).unwrap_or_default();

    let metrics_json: Option<String> = row.get(6).map_err(|e| e.to_string())?;
    let metrics = metrics_json.and_then(|j| serde_json::from_str(&j).ok());

    Ok(TrainingJob {
        id: Some(row.get(0).map_err(|e| e.to_string())?),
        project_id: row.get(1).map_err(|e| e.to_string())?,
        status: row.get(2).map_err(|e| e.to_string())?,
        config,
        progress: row.get(4).map_err(|e| e.to_string())?,
        logs,
        metrics,
        created_at: row.get(7).map_err(|e| e.to_string())?,
        updated_at: row.get(8).map_err(|e| e.to_string())?,
    })
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
