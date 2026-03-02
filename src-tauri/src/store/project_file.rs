use serde::{Deserialize, Serialize};

// ─── ProjectFile: todo el contenido de project.json ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFile {
    pub version: u32,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub project_type: String,
    pub classes: Vec<ClassDef>,
    pub created: f64,
    pub updated: f64,
    #[serde(default)]
    pub images: Vec<ImageEntry>,
    #[serde(default)]
    pub timeseries: Vec<TimeSeriesEntry>,
    #[serde(default)]
    pub videos: Vec<VideoEntry>,
    #[serde(default)]
    pub training_jobs: Vec<TrainingJobEntry>,
    #[serde(default)]
    pub tabular_data: Vec<TabularDataEntry>,
    #[serde(default)]
    pub p2p: Option<P2pProjectConfig>,
}

// ─── P2P ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct P2pProjectConfig {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub role: String,
    #[serde(rename = "namespaceId")]
    pub namespace_id: String,
    #[serde(rename = "authorId")]
    pub author_id: String,
    #[serde(rename = "hostNodeId")]
    pub host_node_id: String,
    #[serde(rename = "lockMode")]
    pub lock_mode: String,
}

// ─── Clases ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassDef {
    pub id: i64,
    pub name: String,
    pub color: String,
}

// ─── Imágenes ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    pub width: u32,
    pub height: u32,
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
    #[serde(default)]
    pub annotations: Vec<AnnotationEntry>,
    #[serde(default, rename = "videoId")]
    pub video_id: Option<String>,
    #[serde(default, rename = "frameIndex")]
    pub frame_index: Option<i64>,
    #[serde(default, rename = "lockedBy")]
    pub locked_by: Option<String>,
    #[serde(default, rename = "lockExpires")]
    pub lock_expires: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub annotation_type: String,
    #[serde(rename = "classId")]
    pub class_id: i64,
    pub data: serde_json::Value,
}

// ─── TimeSeries ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesEntry {
    pub id: String,
    pub name: String,
    pub data: serde_json::Value,
    #[serde(default)]
    pub annotations: Vec<TsAnnotationEntry>,
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TsAnnotationEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub annotation_type: String,
    #[serde(rename = "classId")]
    pub class_id: Option<i64>,
    pub data: serde_json::Value,
}

// ─── Videos ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    #[serde(rename = "fpsExtraction")]
    pub fps_extraction: f64,
    #[serde(rename = "fpsOriginal")]
    pub fps_original: Option<f64>,
    #[serde(rename = "totalFrames")]
    pub total_frames: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    pub width: i64,
    pub height: i64,
    pub uploaded: f64,
    pub status: String,
    #[serde(default)]
    pub tracks: Vec<TrackEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackEntry {
    pub id: String,
    #[serde(rename = "classId")]
    pub class_id: i64,
    pub label: Option<String>,
    pub enabled: bool,
    #[serde(default)]
    pub keyframes: Vec<KeyframeEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyframeEntry {
    #[serde(rename = "frameIndex")]
    pub frame_index: i64,
    #[serde(rename = "bboxX")]
    pub bbox_x: f64,
    #[serde(rename = "bboxY")]
    pub bbox_y: f64,
    #[serde(rename = "bboxWidth")]
    pub bbox_width: f64,
    #[serde(rename = "bboxHeight")]
    pub bbox_height: f64,
    #[serde(rename = "isKeyframe")]
    pub is_keyframe: bool,
    pub enabled: bool,
}

// ─── Tabular Data ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabularDataEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    pub uploaded: f64,
    pub rows: usize,
    pub columns: Vec<TabularColumnInfo>,
    #[serde(default, rename = "targetColumn")]
    pub target_column: Option<String>,
    #[serde(default, rename = "featureColumns")]
    pub feature_columns: Vec<String>,
    #[serde(default, rename = "taskType")]
    pub task_type: Option<String>, // "classification" | "regression" | null (auto)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabularColumnInfo {
    pub name: String,
    #[serde(rename = "dtype")]
    pub dtype: String, // "numeric" | "categorical" | "text" | "datetime"
    #[serde(rename = "uniqueCount")]
    pub unique_count: usize,
    #[serde(rename = "nullCount")]
    pub null_count: usize,
    #[serde(default)]
    pub sample_values: Vec<String>,
}

// ─── Training Jobs ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingJobEntry {
    pub id: String,
    pub status: String,
    pub config: serde_json::Value,
    pub progress: f64,
    #[serde(default)]
    pub logs: Vec<String>,
    pub metrics: Option<serde_json::Value>,
    #[serde(rename = "createdAt")]
    pub created_at: f64,
    #[serde(rename = "updatedAt")]
    pub updated_at: f64,
    #[serde(default, rename = "resultDir")]
    pub result_dir: Option<String>,
    #[serde(default, rename = "bestModelPath")]
    pub best_model_path: Option<String>,
    #[serde(default, rename = "datasetDir")]
    pub dataset_dir: Option<String>,
    #[serde(default, rename = "cloudProvider")]
    pub cloud_provider: Option<String>,
    #[serde(default, rename = "cloudJobId")]
    pub cloud_job_id: Option<String>,
    #[serde(default, rename = "cloudJobUrl")]
    pub cloud_job_url: Option<String>,
    #[serde(default, rename = "modelDownloadUrl")]
    pub model_download_url: Option<String>,
}
