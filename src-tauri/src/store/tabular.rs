use std::collections::HashSet;
use std::path::PathBuf;

use crate::store::project_file::{TabularColumnInfo, TabularDataEntry};
use super::AppState;

/// Response for tabular preview
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TabularPreview {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    #[serde(rename = "totalRows")]
    pub total_rows: usize,
}

impl AppState {
    /// Returns the tabular data directory for a project, creating it if needed.
    pub fn project_tabular_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        let dir = self.project_dir(project_id)?.join("tabular");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Error creando directorio tabular: {}", e))?;
        Ok(dir)
    }

    /// Upload a CSV file into the project, parse headers and detect column types.
    pub fn upload_tabular_file(&self, project_id: &str, source_path: &str, file_name: &str) -> Result<TabularDataEntry, String> {
        let tabular_dir = self.project_tabular_dir(project_id)?;

        let entry_id = uuid::Uuid::new_v4().to_string();
        let safe_name = format!("{}_{}", &entry_id[..8], file_name);
        let dest = tabular_dir.join(&safe_name);

        // Copy file
        std::fs::copy(source_path, &dest)
            .map_err(|e| format!("Error copiando archivo CSV: {}", e))?;

        // Parse CSV to get column info
        let (columns, row_count) = parse_csv_columns(&dest)?;

        let now = chrono::Utc::now().timestamp_millis() as f64;

        let entry = TabularDataEntry {
            id: entry_id,
            name: file_name.to_string(),
            file: safe_name,
            uploaded: now,
            rows: row_count,
            columns,
            target_column: None,
            feature_columns: Vec::new(),
            task_type: None,
        };

        self.with_project_mut(project_id, |pf| {
            pf.tabular_data.push(entry.clone());
        })?;

        Ok(entry)
    }

    /// Get preview rows for a tabular data entry.
    pub fn get_tabular_preview(&self, project_id: &str, data_id: &str, max_rows: usize) -> Result<TabularPreview, String> {
        let tabular_dir = self.project_tabular_dir(project_id)?;

        let file_name = self.with_project(project_id, |pf| {
            pf.tabular_data.iter()
                .find(|d| d.id == data_id)
                .map(|d| d.file.clone())
                .ok_or_else(|| "Datos tabulares no encontrados".to_string())
        })??;

        let path = tabular_dir.join(&file_name);
        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(true)
            .from_path(&path)
            .map_err(|e| format!("Error leyendo CSV: {}", e))?;

        let headers: Vec<String> = rdr.headers()
            .map_err(|e| format!("Error leyendo headers: {}", e))?
            .iter()
            .map(|h| h.to_string())
            .collect();

        let mut rows = Vec::new();
        let mut total = 0usize;
        for result in rdr.records() {
            let record = result.map_err(|e| format!("Error leyendo fila: {}", e))?;
            total += 1;
            if rows.len() < max_rows {
                rows.push(record.iter().map(|f| f.to_string()).collect());
            }
        }

        Ok(TabularPreview {
            columns: headers,
            rows,
            total_rows: total,
        })
    }

    /// Update target column, feature columns, and task type for a tabular data entry.
    pub fn update_tabular_config(
        &self,
        project_id: &str,
        data_id: &str,
        target_column: Option<String>,
        feature_columns: Vec<String>,
        task_type: Option<String>,
    ) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            if let Some(entry) = pf.tabular_data.iter_mut().find(|d| d.id == data_id) {
                entry.target_column = target_column;
                entry.feature_columns = feature_columns;
                entry.task_type = task_type;
            }
        })
    }

    /// Delete a tabular data entry and its file.
    pub fn delete_tabular_data(&self, project_id: &str, data_id: &str) -> Result<(), String> {
        let tabular_dir = self.project_tabular_dir(project_id)?;

        let file_name = self.with_project(project_id, |pf| {
            pf.tabular_data.iter()
                .find(|d| d.id == data_id)
                .map(|d| d.file.clone())
        })?;

        if let Some(file) = file_name {
            let _ = std::fs::remove_file(tabular_dir.join(file));
        }

        self.with_project_mut(project_id, |pf| {
            pf.tabular_data.retain(|d| d.id != data_id);
        })
    }
}

/// Parse a CSV file and return column info + row count.
fn parse_csv_columns(path: &PathBuf) -> Result<(Vec<TabularColumnInfo>, usize), String> {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_path(path)
        .map_err(|e| format!("Error leyendo CSV: {}", e))?;

    let headers: Vec<String> = rdr.headers()
        .map_err(|e| format!("Error leyendo headers: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let num_cols = headers.len();
    let mut unique_sets: Vec<HashSet<String>> = vec![HashSet::new(); num_cols];
    let mut null_counts: Vec<usize> = vec![0; num_cols];
    let mut sample_values: Vec<Vec<String>> = vec![Vec::new(); num_cols];
    let mut numeric_counts: Vec<usize> = vec![0; num_cols];
    let mut row_count = 0usize;

    for result in rdr.records() {
        let record = result.map_err(|e| format!("Error leyendo fila: {}", e))?;
        row_count += 1;

        for (i, field) in record.iter().enumerate() {
            if i >= num_cols { break; }

            let val = field.trim();
            if val.is_empty() || val.eq_ignore_ascii_case("null") || val.eq_ignore_ascii_case("nan") || val == "NA" {
                null_counts[i] += 1;
            } else {
                unique_sets[i].insert(val.to_string());
                if sample_values[i].len() < 5 {
                    sample_values[i].push(val.to_string());
                }
                if val.parse::<f64>().is_ok() {
                    numeric_counts[i] += 1;
                }
            }
        }
    }

    let columns: Vec<TabularColumnInfo> = headers.iter().enumerate().map(|(i, name)| {
        let non_null = row_count - null_counts[i];
        let dtype = if non_null == 0 {
            "text".to_string()
        } else if numeric_counts[i] as f64 / non_null as f64 > 0.9 {
            "numeric".to_string()
        } else if unique_sets[i].len() <= 50 || (unique_sets[i].len() as f64 / non_null as f64) < 0.05 {
            "categorical".to_string()
        } else {
            "text".to_string()
        };

        TabularColumnInfo {
            name: name.clone(),
            dtype,
            unique_count: unique_sets[i].len(),
            null_count: null_counts[i],
            sample_values: sample_values[i].clone(),
        }
    }).collect();

    Ok((columns, row_count))
}
