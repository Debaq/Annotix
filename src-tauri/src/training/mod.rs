use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

// ─── Training Config ────────────────────────────────────────────────────────

fn default_cos_lr() -> bool { false }
fn default_warmup_epochs() -> f64 { 3.0 }
fn default_warmup_momentum() -> f64 { 0.8 }
fn default_warmup_bias_lr() -> f64 { 0.1 }
fn default_momentum() -> f64 { 0.937 }
fn default_weight_decay() -> f64 { 0.0005 }
fn default_nbs() -> u32 { 64 }
fn default_box_weight() -> f64 { 7.5 }
fn default_cls_weight() -> f64 { 0.5 }
fn default_dfl_weight() -> f64 { 1.5 }
fn default_close_mosaic() -> u32 { 10 }
fn default_max_det() -> u32 { 300 }
fn default_multi_scale() -> f64 { 0.0 }
fn default_rect() -> bool { false }
fn default_cache() -> CacheOption { CacheOption::Bool(false) }
fn default_amp() -> bool { true }
fn default_single_cls() -> bool { false }
fn default_pretrained() -> bool { true }
fn default_translate() -> f64 { 0.1 }

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
    // Optimizer
    #[serde(default = "default_cos_lr")]
    pub cos_lr: bool,
    #[serde(default = "default_warmup_epochs")]
    pub warmup_epochs: f64,
    #[serde(default = "default_warmup_momentum")]
    pub warmup_momentum: f64,
    #[serde(default = "default_warmup_bias_lr")]
    pub warmup_bias_lr: f64,
    #[serde(default = "default_momentum")]
    pub momentum: f64,
    #[serde(default = "default_weight_decay")]
    pub weight_decay: f64,
    #[serde(default = "default_nbs")]
    pub nbs: u32,
    // Loss weights
    #[serde(default = "default_box_weight", rename = "box")]
    pub box_weight: f64,
    #[serde(default = "default_cls_weight")]
    pub cls: f64,
    #[serde(default = "default_dfl_weight")]
    pub dfl: f64,
    // Advanced training
    #[serde(default = "default_close_mosaic")]
    pub close_mosaic: u32,
    #[serde(default = "default_max_det")]
    pub max_det: u32,
    #[serde(default = "default_multi_scale")]
    pub multi_scale: f64,
    #[serde(default = "default_rect")]
    pub rect: bool,
    #[serde(default = "default_cache")]
    pub cache: CacheOption,
    #[serde(default = "default_amp")]
    pub amp: bool,
    #[serde(default = "default_single_cls")]
    pub single_cls: bool,
    // Transfer learning
    #[serde(default = "default_pretrained")]
    pub pretrained: bool,
    #[serde(default)]
    pub freeze: Option<u32>,
    #[serde(default, rename = "baseModelPath")]
    pub base_model_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CacheOption {
    Bool(bool),
    Str(String),
}

impl CacheOption {
    pub fn to_python(&self) -> String {
        match self {
            CacheOption::Bool(true) => "\"ram\"".to_string(),
            CacheOption::Bool(false) => "False".to_string(),
            CacheOption::Str(s) => format!("\"{}\"", s),
        }
    }
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
    #[serde(default = "default_translate")]
    pub translate: f64,
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
    #[serde(rename = "rfdetrVersion", skip_serializing_if = "Option::is_none")]
    pub rfdetr_version: Option<String>,
    #[serde(rename = "mmdetVersion", skip_serializing_if = "Option::is_none")]
    pub mmdet_version: Option<String>,
    #[serde(rename = "smpVersion", skip_serializing_if = "Option::is_none")]
    pub smp_version: Option<String>,
    #[serde(rename = "hfTransformersVersion", skip_serializing_if = "Option::is_none")]
    pub hf_transformers_version: Option<String>,
    #[serde(rename = "mmsegVersion", skip_serializing_if = "Option::is_none")]
    pub mmseg_version: Option<String>,
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
    // Semantic segmentation metrics
    #[serde(rename = "meanIoU", skip_serializing_if = "Option::is_none")]
    pub mean_iou: Option<f64>,
    #[serde(rename = "meanAccuracy", skip_serializing_if = "Option::is_none")]
    pub mean_accuracy: Option<f64>,
    #[serde(rename = "diceLoss", skip_serializing_if = "Option::is_none")]
    pub dice_loss: Option<f64>,
    #[serde(rename = "segLoss", skip_serializing_if = "Option::is_none")]
    pub seg_loss: Option<f64>,
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

// ─── Multi-Backend Enums ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TrainingBackend {
    Yolo,
    RtDetr,
    RfDetr,
    MmDetection,
    Smp,
    HfSegmentation,
    MmSegmentation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DatasetFormat {
    YoloTxt,
    CocoJson,
    MaskPng,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionMode {
    Local,
    DownloadPackage,
}

// ─── Training Request (multi-backend) ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingRequest {
    pub backend: TrainingBackend,
    #[serde(rename = "modelId")]
    pub model_id: String,
    pub task: String,
    #[serde(rename = "executionMode")]
    pub execution_mode: ExecutionMode,
    // Common params
    pub epochs: u32,
    #[serde(rename = "batchSize")]
    pub batch_size: i32,
    #[serde(rename = "imageSize")]
    pub image_size: u32,
    pub device: String,
    pub lr: f64,
    pub patience: u32,
    #[serde(rename = "valSplit")]
    pub val_split: f64,
    pub workers: u32,
    pub amp: bool,
    pub resume: bool,
    #[serde(rename = "exportFormats")]
    pub export_formats: Vec<String>,
    // Backend-specific params as free JSON
    #[serde(rename = "backendParams", default)]
    pub backend_params: JsonValue,
    #[serde(default, rename = "baseModelPath")]
    pub base_model_path: Option<String>,
}

// ─── Backend Catalog ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "supportedTasks")]
    pub supported_tasks: Vec<String>,
    pub models: Vec<BackendModelInfo>,
    #[serde(rename = "datasetFormat")]
    pub dataset_format: DatasetFormat,
    #[serde(rename = "pipPackages")]
    pub pip_packages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendModelInfo {
    pub id: String,
    pub name: String,
    pub family: String,
    pub description: String,
    #[serde(rename = "paramsCount")]
    pub params_count: Option<String>,
    pub tasks: Vec<String>,
    pub sizes: Option<Vec<String>>,
    pub recommended: bool,
}

pub mod python_env;
pub mod gpu;
pub mod dataset;
pub mod scripts;
pub mod runner;
pub mod model_export;
pub mod backends;
pub mod package;
pub mod notebook;

/// En Windows, configura CREATE_NO_WINDOW para evitar que aparezca una ventana de consola.
#[cfg(windows)]
pub fn hide_console_window(cmd: &mut std::process::Command) -> &mut std::process::Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000) // CREATE_NO_WINDOW
}

#[cfg(not(windows))]
pub fn hide_console_window(cmd: &mut std::process::Command) -> &mut std::process::Command {
    cmd
}

// ─── Training Env Cache ─────────────────────────────────────────────────────

use std::sync::Mutex;

/// Resultado combinado de check_env + detect_gpu
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TrainingEnvInfo {
    pub env: PythonEnvStatus,
    pub gpu: GpuInfo,
}

/// Cache en memoria para evitar levantar Python cada vez que se abre el modal
pub struct TrainingEnvCache {
    inner: Mutex<Option<TrainingEnvInfo>>,
}

impl TrainingEnvCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn get(&self) -> Option<TrainingEnvInfo> {
        self.inner.lock().ok()?.clone()
    }

    pub fn set(&self, info: TrainingEnvInfo) {
        if let Ok(mut cache) = self.inner.lock() {
            *cache = Some(info);
        }
    }

    pub fn invalidate(&self) {
        if let Ok(mut cache) = self.inner.lock() {
            *cache = None;
        }
    }
}
