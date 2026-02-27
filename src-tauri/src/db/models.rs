use serde::{Deserialize, Serialize};

// ─── Project Types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: Option<i64>,
    pub name: String,
    #[serde(rename = "type")]
    pub project_type: String,
    pub classes: Vec<ClassDefinition>,
    pub metadata: ProjectMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassDefinition {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub created: f64,
    pub updated: f64,
    pub version: String,
}

// ─── Image Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRecord {
    pub id: Option<i64>,
    #[serde(rename = "projectId")]
    pub project_id: i64,
    pub name: String,
    #[serde(rename = "blobPath")]
    pub blob_path: String,
    pub annotations: Vec<Annotation>,
    pub dimensions: ImageDimensions,
    pub metadata: ImageMetadata,
}

/// Formato AnnotixImage que el frontend espera (flattened)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotixImage {
    pub id: Option<i64>,
    #[serde(rename = "projectId")]
    pub project_id: i64,
    pub name: String,
    #[serde(rename = "blobPath")]
    pub blob_path: String,
    pub width: u32,
    pub height: u32,
    pub annotations: Vec<Annotation>,
    pub metadata: ImageMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageDimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

// ─── Annotation Types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: String,
    #[serde(rename = "type")]
    pub annotation_type: String,
    #[serde(rename = "classId")]
    pub class_id: i64,
    pub data: serde_json::Value,
}

// ─── TimeSeries Types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesRecord {
    pub id: Option<i64>,
    #[serde(rename = "projectId")]
    pub project_id: i64,
    pub name: String,
    pub data: serde_json::Value,
    pub annotations: Vec<TimeSeriesAnnotation>,
    pub metadata: ImageMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesAnnotation {
    pub id: String,
    #[serde(rename = "type")]
    pub annotation_type: String,
    #[serde(rename = "classId")]
    pub class_id: Option<i64>,
    pub data: serde_json::Value,
}

// ─── Inference Cache Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceCache {
    pub id: Option<i64>,
    #[serde(rename = "imageId")]
    pub image_id: i64,
    #[serde(rename = "modelHash")]
    pub model_hash: String,
    pub predictions: serde_json::Value,
    pub timestamp: f64,
}

// ─── Training Job Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingJob {
    pub id: Option<i64>,
    #[serde(rename = "projectId")]
    pub project_id: i64,
    pub status: String,
    pub config: serde_json::Value,
    pub progress: f64,
    pub logs: Vec<String>,
    pub metrics: Option<serde_json::Value>,
    #[serde(rename = "createdAt")]
    pub created_at: f64,
    #[serde(rename = "updatedAt")]
    pub updated_at: f64,
}

// ─── Storage Info ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInfo {
    pub usage: u64,
    pub quota: u64,
    pub percentage: f64,
}
