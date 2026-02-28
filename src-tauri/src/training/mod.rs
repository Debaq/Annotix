use serde::{Deserialize, Serialize};

// ─── Training Config ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingConfig {
    #[serde(rename = "yoloVersion")]
    pub yolo_version: String,
    pub task: String,
    #[serde(rename = "modelSize")]
    pub model_size: String,
    pub epochs: u32,
    #[serde(rename = "batchSize")]
    pub batch_size: i32,
    pub imgsz: u32,
    pub device: String,
    pub optimizer: String,
    pub lr0: f64,
    pub lrf: f64,
    pub patience: u32,
    #[serde(rename = "valSplit")]
    pub val_split: f64,
    pub workers: u32,
    pub augmentation: AugmentationConfig,
    #[serde(rename = "exportFormats")]
    pub export_formats: Vec<String>,
    pub resume: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AugmentationConfig {
    pub mosaic: f64,
    pub mixup: f64,
    pub hsv_h: f64,
    pub hsv_s: f64,
    pub hsv_v: f64,
    pub flipud: f64,
    pub fliplr: f64,
    pub degrees: f64,
    pub scale: f64,
    pub shear: f64,
    pub perspective: f64,
    pub copy_paste: f64,
    pub erasing: f64,
}

// ─── Python Env Status ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonEnvStatus {
    pub installed: bool,
    #[serde(rename = "pythonPath")]
    pub python_path: Option<String>,
    #[serde(rename = "ultralyticsVersion")]
    pub ultralytics_version: Option<String>,
    #[serde(rename = "torchVersion")]
    pub torch_version: Option<String>,
    #[serde(rename = "cudaAvailable")]
    pub cuda_available: bool,
}

// ─── GPU Info ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    #[serde(rename = "cudaAvailable")]
    pub cuda_available: bool,
    #[serde(rename = "cudaVersion")]
    pub cuda_version: Option<String>,
    pub gpus: Vec<GpuDevice>,
    #[serde(rename = "mpsAvailable")]
    pub mps_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuDevice {
    pub index: u32,
    pub name: String,
    #[serde(rename = "memoryTotal")]
    pub memory_total: u64,
    #[serde(rename = "memoryFree")]
    pub memory_free: u64,
}

// ─── Training Progress ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingProgressEvent {
    #[serde(rename = "jobId")]
    pub job_id: String,
    pub epoch: u32,
    #[serde(rename = "totalEpochs")]
    pub total_epochs: u32,
    pub progress: f64,
    pub metrics: Option<TrainingEpochMetrics>,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingEpochMetrics {
    #[serde(rename = "trainLoss")]
    pub train_loss: Option<f64>,
    #[serde(rename = "valLoss")]
    pub val_loss: Option<f64>,
    #[serde(rename = "boxLoss")]
    pub box_loss: Option<f64>,
    #[serde(rename = "clsLoss")]
    pub cls_loss: Option<f64>,
    #[serde(rename = "dflLoss")]
    pub dfl_loss: Option<f64>,
    pub precision: Option<f64>,
    pub recall: Option<f64>,
    #[serde(rename = "mAP50")]
    pub map50: Option<f64>,
    #[serde(rename = "mAP50_95")]
    pub map50_95: Option<f64>,
    pub lr: Option<f64>,
}

// ─── Training Result ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingResult {
    #[serde(rename = "bestModelPath")]
    pub best_model_path: Option<String>,
    #[serde(rename = "lastModelPath")]
    pub last_model_path: Option<String>,
    #[serde(rename = "resultsDir")]
    pub results_dir: Option<String>,
    #[serde(rename = "finalMetrics")]
    pub final_metrics: Option<TrainingEpochMetrics>,
    #[serde(rename = "exportedModels")]
    pub exported_models: Vec<ExportedModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedModel {
    pub format: String,
    pub path: String,
}

// ─── Training Preset ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingPreset {
    pub name: String,
    pub epochs: u32,
    #[serde(rename = "batchSize")]
    pub batch_size: i32,
    #[serde(rename = "imageSize")]
    pub image_size: u32,
    pub patience: u32,
    #[serde(rename = "augmentationLevel")]
    pub augmentation_level: String,
}

// ─── YOLO Model Info ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoloModelInfo {
    pub version: String,
    pub tasks: Vec<String>,
    pub sizes: Vec<String>,
    pub recommended: bool,
}

pub mod python_env;
pub mod gpu;
pub mod dataset;
pub mod scripts;
pub mod runner;
pub mod model_export;
