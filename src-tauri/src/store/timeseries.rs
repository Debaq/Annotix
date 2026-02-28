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
    pub data: serde_json::Value,
    pub annotations: Vec<TsAnnotationEntry>,
    pub metadata: TsMetadataResponse,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TsMetadataResponse {
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

fn entry_to_response(entry: &TimeSeriesEntry, project_id: &str) -> TimeSeriesResponse {
    TimeSeriesResponse {
        id: entry.id.clone(),
        project_id: project_id.to_string(),
        name: entry.name.clone(),
        data: entry.data.clone(),
        annotations: entry.annotations.clone(),
        metadata: TsMetadataResponse {
            uploaded: entry.uploaded,
            annotated: entry.annotated,
            status: entry.status.clone(),
        },
    }
}

impl AppState {
    pub fn create_timeseries(
        &self,
        project_id: &str,
        name: &str,
        data: serde_json::Value,
        annotations: &[TsAnnotationEntry],
    ) -> Result<String, String> {
        let now = js_timestamp();
        let id = uuid::Uuid::new_v4().to_string();
        let status = if annotations.is_empty() { "pending" } else { "annotated" };

        let entry = TimeSeriesEntry {
            id: id.clone(),
            name: name.to_string(),
            data,
            annotations: annotations.to_vec(),
            uploaded: now,
            annotated: if annotations.is_empty() { None } else { Some(now) },
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
        self.with_project(project_id, |pf| {
            pf.timeseries
                .iter()
                .find(|ts| ts.id == ts_id)
                .map(|ts| entry_to_response(ts, &pf.id))
        })
    }

    pub fn list_timeseries(
        &self,
        project_id: &str,
    ) -> Result<Vec<TimeSeriesResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.timeseries
                .iter()
                .map(|ts| entry_to_response(ts, &pf.id))
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
        self.with_project_mut(project_id, |pf| {
            if let Some(ts) = pf.timeseries.iter_mut().find(|ts| ts.id == ts_id) {
                ts.annotations = annotations.to_vec();
                ts.status = if annotations.is_empty() { "pending".to_string() } else { "annotated".to_string() };
                ts.annotated = if annotations.is_empty() { None } else { Some(now) };
            }
            pf.updated = now;
        })
    }

    pub fn delete_timeseries(
        &self,
        project_id: &str,
        ts_id: &str,
    ) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            pf.timeseries.retain(|ts| ts.id != ts_id);
            pf.updated = js_timestamp();
        })
    }
}
