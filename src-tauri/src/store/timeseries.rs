use std::path::PathBuf;

use crate::store::project_file::{TimeSeriesEntry, TsAnnotationEntry};
use crate::store::state::AppState;

/// Timestamp compatible con JS Date.now()
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

/// Respuesta de serie temporal para el frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TimeSeriesResponse {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub name: String,
    /// Datos completos. Solo lo rellena `get_timeseries`; el listado lo deja
    /// nulo y usa `pointCount`/`seriesCount` para describir la serie.
    pub data: Option<serde_json::Value>,
    #[serde(rename = "pointCount")]
    pub point_count: usize,
    #[serde(rename = "seriesCount")]
    pub series_count: usize,
    pub columns: Option<Vec<String>>,
    pub annotations: Vec<TsAnnotationEntry>,
    pub metadata: TsMetadataResponse,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TsMetadataResponse {
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

fn entry_to_response(
    entry: &TimeSeriesEntry,
    project_id: &str,
    data: Option<serde_json::Value>,
) -> TimeSeriesResponse {
    TimeSeriesResponse {
        id: entry.id.clone(),
        project_id: project_id.to_string(),
        name: entry.name.clone(),
        data,
        point_count: entry.point_count,
        series_count: entry.series_count,
        columns: entry.columns.clone(),
        annotations: entry.annotations.clone(),
        metadata: TsMetadataResponse {
            uploaded: entry.uploaded,
            annotated: entry.annotated,
            status: entry.status.clone(),
        },
    }
}

/// Cuenta puntos, variables y nombres de columna a partir del JSON de datos.
pub fn describe_data(data: &serde_json::Value) -> (usize, usize, Option<Vec<String>>) {
    let point_count = data
        .get("timestamps")
        .and_then(|t| t.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let series_count = match data.get("values").and_then(|v| v.as_array()) {
        Some(values) => match values.first() {
            Some(first) if first.is_array() => values.len(),
            _ => 1,
        },
        None => 1,
    };

    let columns = data.get("columns").and_then(|c| c.as_array()).map(|a| {
        a.iter()
            .map(|v| v.as_str().unwrap_or("").to_string())
            .collect()
    });

    (point_count, series_count, columns)
}

impl AppState {
    /// Directorio donde viven los datos de las series temporales de un proyecto.
    pub fn project_timeseries_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        Ok(self.project_dir(project_id)?.join("timeseries"))
    }

    fn timeseries_data_path(&self, project_id: &str, ts_id: &str) -> Result<PathBuf, String> {
        Ok(self
            .project_timeseries_dir(project_id)?
            .join(format!("{}.json", ts_id)))
    }

    /// Escribe los datos de una serie a su archivo (atómico: .tmp + rename).
    pub fn write_timeseries_data(
        &self,
        project_id: &str,
        ts_id: &str,
        data: &serde_json::Value,
    ) -> Result<(), String> {
        let dir = self.project_timeseries_dir(project_id)?;
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Error creando directorio de series: {}", e))?;

        let path = self.timeseries_data_path(project_id, ts_id)?;
        let tmp = path.with_extension("json.tmp");
        let content = serde_json::to_vec(data)
            .map_err(|e| format!("Error serializando datos de serie: {}", e))?;
        std::fs::write(&tmp, &content)
            .map_err(|e| format!("Error escribiendo datos de serie: {}", e))?;
        std::fs::rename(&tmp, &path)
            .map_err(|e| format!("Error renombrando datos de serie: {}", e))?;
        Ok(())
    }

    /// Lee los datos de una serie. Devuelve `None` si el archivo no existe.
    pub fn read_timeseries_data(
        &self,
        project_id: &str,
        ts_id: &str,
    ) -> Result<Option<serde_json::Value>, String> {
        let path = self.timeseries_data_path(project_id, ts_id)?;
        if !path.exists() {
            return Ok(None);
        }
        let content =
            std::fs::read(&path).map_err(|e| format!("Error leyendo datos de serie: {}", e))?;
        let data = serde_json::from_slice(&content)
            .map_err(|e| format!("Error parseando datos de serie: {}", e))?;
        Ok(Some(data))
    }

    fn delete_timeseries_data(&self, project_id: &str, ts_id: &str) {
        if let Ok(path) = self.timeseries_data_path(project_id, ts_id) {
            let _ = std::fs::remove_file(path);
        }
    }

    pub fn create_timeseries(
        &self,
        project_id: &str,
        name: &str,
        data: serde_json::Value,
        annotations: &[TsAnnotationEntry],
    ) -> Result<String, String> {
        let now = js_timestamp();
        let id = uuid::Uuid::new_v4().to_string();
        let status = if annotations.is_empty() {
            "pending"
        } else {
            "annotated"
        };
        let (point_count, series_count, columns) = describe_data(&data);

        // Los datos van a disco antes de registrarse en project.json: si la
        // escritura falla, no queda una serie apuntando a un archivo ausente.
        self.write_timeseries_data(project_id, &id, &data)?;

        let entry = TimeSeriesEntry {
            id: id.clone(),
            name: name.to_string(),
            data: None,
            point_count,
            series_count,
            columns,
            annotations: annotations.to_vec(),
            uploaded: now,
            annotated: if annotations.is_empty() {
                None
            } else {
                Some(now)
            },
            status: status.to_string(),
        };

        self.with_project_mut(project_id, |pf| {
            pf.timeseries.push(entry);
            pf.updated = now;
        })?;

        Ok(id)
    }

    pub fn get_timeseries(
        &self,
        project_id: &str,
        ts_id: &str,
    ) -> Result<Option<TimeSeriesResponse>, String> {
        let entry = self.with_project(project_id, |pf| {
            pf.timeseries
                .iter()
                .find(|ts| ts.id == ts_id)
                .cloned()
                .map(|ts| (ts, pf.id.clone()))
        })?;

        let Some((entry, pid)) = entry else {
            return Ok(None);
        };

        let data = self.read_timeseries_data(project_id, ts_id)?;
        Ok(Some(entry_to_response(&entry, &pid, data)))
    }

    /// Listado sin datos: la galería solo necesita nombre, estado y tamaño.
    pub fn list_timeseries(&self, project_id: &str) -> Result<Vec<TimeSeriesResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.timeseries
                .iter()
                .map(|ts| entry_to_response(ts, &pf.id, None))
                .collect()
        })
    }

    pub fn save_ts_annotations(
        &self,
        project_id: &str,
        ts_id: &str,
        annotations: &[TsAnnotationEntry],
    ) -> Result<(), String> {
        let now = js_timestamp();
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = match pf.timeseries.iter_mut().find(|ts| ts.id == ts_id) {
                Some(ts) => {
                    ts.annotations = annotations.to_vec();
                    ts.status = if annotations.is_empty() {
                        "pending".to_string()
                    } else {
                        "annotated".to_string()
                    };
                    ts.annotated = if annotations.is_empty() {
                        None
                    } else {
                        Some(now)
                    };
                    true
                }
                None => false,
            };
            pf.updated = now;
            found
        })?;

        if found {
            Ok(())
        } else {
            Err(format!("Serie temporal no encontrada: {}", ts_id))
        }
    }

    pub fn delete_timeseries(&self, project_id: &str, ts_id: &str) -> Result<(), String> {
        let found = self.with_project_mut_ret(project_id, |pf| {
            let before = pf.timeseries.len();
            pf.timeseries.retain(|ts| ts.id != ts_id);
            pf.updated = js_timestamp();
            pf.timeseries.len() != before
        })?;

        if !found {
            return Err(format!("Serie temporal no encontrada: {}", ts_id));
        }

        self.delete_timeseries_data(project_id, ts_id);
        Ok(())
    }
}
