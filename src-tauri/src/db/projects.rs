use super::models::{ClassDefinition, Project, ProjectMetadata};
use super::Database;

impl Database {
    pub fn create_project(&self, name: &str, project_type: &str, classes: &[ClassDefinition]) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let classes_json = serde_json::to_string(classes).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO projects (name, type, classes, metadata_created, metadata_updated, metadata_version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![name, project_type, classes_json, now, now, "2.0.0"],
        )
        .map_err(|e| format!("Error creando proyecto: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_project(&self, id: i64) -> Result<Option<Project>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, type, classes, metadata_created, metadata_updated, metadata_version
                 FROM projects WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let result = stmt
            .query_row(rusqlite::params![id], |row| {
                Ok(row_to_project(row))
            })
            .optional()
            .map_err(|e| e.to_string())?;

        match result {
            Some(Ok(project)) => Ok(Some(project)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    }

    pub fn list_projects(&self) -> Result<Vec<Project>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, type, classes, metadata_created, metadata_updated, metadata_version
                 FROM projects ORDER BY metadata_created DESC",
            )
            .map_err(|e| e.to_string())?;

        let projects = stmt
            .query_map([], |row| Ok(row_to_project(row)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .filter_map(|r| r.ok())
            .collect();

        Ok(projects)
    }

    pub fn update_project(&self, id: i64, name: Option<&str>, project_type: Option<&str>, classes: Option<&[ClassDefinition]>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = js_timestamp();

        let mut updates = vec!["metadata_updated = ?1".to_string()];
        let mut param_idx = 2u32;

        // Construir SQL dinámicamente
        let mut sql = String::from("UPDATE projects SET ");

        // Usamos un vector de Box<dyn rusqlite::types::ToSql>
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];

        if let Some(n) = name {
            updates.push(format!("name = ?{}", param_idx));
            params.push(Box::new(n.to_string()));
            param_idx += 1;
        }
        if let Some(t) = project_type {
            updates.push(format!("type = ?{}", param_idx));
            params.push(Box::new(t.to_string()));
            param_idx += 1;
        }
        if let Some(c) = classes {
            let json = serde_json::to_string(c).map_err(|e| e.to_string())?;
            updates.push(format!("classes = ?{}", param_idx));
            params.push(Box::new(json));
            param_idx += 1;
        }

        sql.push_str(&updates.join(", "));
        sql.push_str(&format!(" WHERE id = ?{}", param_idx));
        params.push(Box::new(id));

        let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, params_ref.as_slice())
            .map_err(|e| format!("Error actualizando proyecto: {}", e))?;

        Ok(())
    }

    pub fn delete_project(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])
            .map_err(|e| format!("Error eliminando proyecto: {}", e))?;

        Ok(())
    }
}

fn row_to_project(row: &rusqlite::Row) -> Result<Project, String> {
    let classes_json: String = row.get(3).map_err(|e| e.to_string())?;
    let classes: Vec<ClassDefinition> =
        serde_json::from_str(&classes_json).unwrap_or_default();

    Ok(Project {
        id: Some(row.get(0).map_err(|e| e.to_string())?),
        name: row.get(1).map_err(|e| e.to_string())?,
        project_type: row.get(2).map_err(|e| e.to_string())?,
        classes,
        metadata: ProjectMetadata {
            created: row.get(4).map_err(|e| e.to_string())?,
            updated: row.get(5).map_err(|e| e.to_string())?,
            version: row.get(6).map_err(|e| e.to_string())?,
        },
    })
}

/// Genera timestamp compatible con Date.now() de JS (milisegundos desde epoch)
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

use rusqlite::OptionalExtension;
