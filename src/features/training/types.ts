// ─── Training Config ────────────────────────────────────────────────────────

export interface TrainingConfig {
  yoloVersion: string;
  task: string;
  modelSize: string;
  epochs: number;
  batchSize: number;
  imgsz: number;
  device: string;
  optimizer: string;
  lr0: number;
  lrf: number;
  patience: number;
  valSplit: number;
  workers: number;
  augmentation: AugmentationConfig;
  exportFormats: string[];
  resume: boolean;
  // Optimizer
  cos_lr: boolean;
  warmup_epochs: number;
  warmup_momentum: number;
  warmup_bias_lr: number;
  momentum: number;
  weight_decay: number;
  nbs: number;
  // Loss weights
  box: number;
  cls: number;
  dfl: number;
  // Advanced training
  close_mosaic: number;
  max_det: number;
  multi_scale: number;
  rect: boolean;
  cache: string | boolean;
  amp: boolean;
  single_cls: boolean;
  // Transfer learning
  pretrained: boolean;
  freeze: number | null;
}

export interface AugmentationConfig {
  mosaic: number;
  mixup: number;
  hsv_h: number;
  hsv_s: number;
  hsv_v: number;
  flipud: number;
  fliplr: number;
  degrees: number;
  scale: number;
  shear: number;
  perspective: number;
  copy_paste: number;
  erasing: number;
  translate: number;
}

// ─── Scenario Presets ──────────────────────────────────────────────────────

export type ScenarioPresetId =
  | 'small_objects'
  | 'industrial'
  | 'traffic'
  | 'edge_mobile'
  | 'medical'
  | 'aerial';

export interface ScenarioPreset {
  id: ScenarioPresetId;
  icon: string;
  color: string;
  selectedColor: string;
  suggestedModelSize: string;
  suggestedImgsz: number;
  config: Omit<TrainingConfig, 'yoloVersion' | 'task' | 'modelSize' | 'device' | 'exportFormats' | 'resume' | 'valSplit' | 'workers'>;
}

// ─── Python Env ─────────────────────────────────────────────────────────────

export interface PythonEnvStatus {
  installed: boolean;
  pythonPath: string | null;
  ultralyticsVersion: string | null;
  torchVersion: string | null;
  cudaAvailable: boolean;
  rfdetrVersion?: string | null;
  mmdetVersion?: string | null;
  smpVersion?: string | null;
  hfTransformersVersion?: string | null;
  mmsegVersion?: string | null;
  detectron2Version?: string | null;
  mmposeVersion?: string | null;
  mmrotateVersion?: string | null;
  timmVersion?: string | null;
  tsaiVersion?: string | null;
  pytorchForecastingVersion?: string | null;
  pyodVersion?: string | null;
  tslearnVersion?: string | null;
  pypotsVersion?: string | null;
  stumpyVersion?: string | null;
}

export interface TrainingEnvInfo {
  env: PythonEnvStatus;
  gpu: GpuInfo;
}

// ─── GPU ────────────────────────────────────────────────────────────────────

export interface GpuInfo {
  cudaAvailable: boolean;
  cudaVersion: string | null;
  gpus: GpuDevice[];
  mpsAvailable: boolean;
}

export interface GpuDevice {
  index: number;
  name: string;
  memoryTotal: number;
  memoryFree: number;
}

// ─── Training Progress ──────────────────────────────────────────────────────

export interface TrainingProgressEvent {
  jobId: string;
  epoch: number;
  totalEpochs: number;
  progress: number;
  metrics: TrainingEpochMetrics | null;
  phase: string;
}

export interface TrainingEpochMetrics {
  trainLoss?: number | null;
  valLoss?: number | null;
  boxLoss?: number | null;
  clsLoss?: number | null;
  dflLoss?: number | null;
  precision?: number | null;
  recall?: number | null;
  mAP50?: number | null;
  mAP50_95?: number | null;
  lr?: number | null;
  // Semantic segmentation metrics
  meanIoU?: number | null;
  meanAccuracy?: number | null;
  diceLoss?: number | null;
  segLoss?: number | null;
  // Instance segmentation / keypoints metrics
  maskAP?: number | null;
  keypointAP?: number | null;
  // Classification metrics
  accuracy?: number | null;
  f1Score?: number | null;
  // Time series metrics
  mae?: number | null;
  rmse?: number | null;
  aucRoc?: number | null;
  silhouetteScore?: number | null;
}

// ─── Training Result ────────────────────────────────────────────────────────

export interface TrainingResult {
  bestModelPath: string | null;
  lastModelPath: string | null;
  resultsDir: string | null;
  finalMetrics: TrainingEpochMetrics | null;
  exportedModels: ExportedModel[];
}

export interface ExportedModel {
  format: string;
  path: string;
}

// ─── Training Preset (legacy, kept for backend compat) ─────────────────────

export interface TrainingPreset {
  name: string;
  epochs: number;
  batchSize: number;
  imageSize: number;
  patience: number;
  augmentationLevel: string;
}

// ─── YOLO Model Info ────────────────────────────────────────────────────────

export interface YoloModelInfo {
  version: string;
  tasks: string[];
  sizes: string[];
  recommended: boolean;
}

// ─── Training Job (from DB) ─────────────────────────────────────────────────

export interface TrainingJob {
  id: string | null;
  projectId: string;
  status: string;
  config: TrainingConfig | Record<string, unknown>;
  progress: number;
  logs: string[];
  metrics: TrainingEpochMetrics | null;
  createdAt: number;
  updatedAt: number;
  bestModelPath?: string | null;
}

// ─── Multi-Backend Types ─────────────────────────────────────────────────────

export type TrainingBackend =
  | 'yolo' | 'rt_detr' | 'rf_detr' | 'mmdetection' | 'smp' | 'hf_segmentation' | 'mmsegmentation'
  | 'detectron2' | 'mmpose' | 'mmrotate' | 'timm' | 'hf_classification'
  | 'tsai' | 'pytorch_forecasting' | 'pyod' | 'tslearn' | 'pypots' | 'stumpy';
export type ExecutionMode = 'local' | 'download_package';
export type DatasetFormat = 'yolo_txt' | 'coco_json' | 'mask_png'
  | 'coco_instance_json' | 'coco_keypoints_json' | 'dota_txt'
  | 'image_folder' | 'multi_label_csv' | 'time_series_csv';

export interface TrainingRequest {
  backend: TrainingBackend;
  modelId: string;
  task: string;
  executionMode: ExecutionMode;
  epochs: number;
  batchSize: number;
  imageSize: number;
  device: string;
  lr: number;
  patience: number;
  valSplit: number;
  workers: number;
  amp: boolean;
  resume: boolean;
  exportFormats: string[];
  backendParams: Record<string, unknown>;
  baseModelPath?: string | null;
}

export interface BackendInfo {
  id: string;
  name: string;
  description: string;
  supportedTasks: string[];
  models: BackendModelInfo[];
  datasetFormat: DatasetFormat;
  pipPackages: string[];
}

export interface BackendModelInfo {
  id: string;
  name: string;
  family: string;
  description: string;
  paramsCount: string | null;
  tasks: string[];
  sizes: string[] | null;
  recommended: boolean;
}

// Backend-specific params interfaces

export interface YoloBackendParams {
  modelSize: string;
  optimizer: string;
  lrf: number;
  cos_lr: boolean;
  warmup_epochs: number;
  warmup_momentum: number;
  warmup_bias_lr: number;
  momentum: number;
  weight_decay: number;
  nbs: number;
  box: number;
  cls: number;
  dfl: number;
  close_mosaic: number;
  max_det: number;
  multi_scale: number;
  rect: boolean;
  cache: string | boolean;
  single_cls: boolean;
  pretrained: boolean;
  freeze: number | null;
  augmentation: AugmentationConfig;
}

export interface RtDetrBackendParams {
  optimizer: string;
  lrf: number;
  warmup_epochs: number;
  weight_decay: number;
  freeze: number | null;
}

export interface RfDetrBackendParams {
  resolution: number;
  lr_encoder: number;
  grad_accum_steps: number;
  use_ema: boolean;
  early_stopping: boolean;
  weight_decay: number;
  gradient_checkpointing: boolean;
}

export interface MmDetBackendParams {
  optimizer_type: string;
  momentum: number;
  weight_decay: number;
  lr_schedule: string;
  milestones: number[];
  warmup_iters: number;
  checkpoint_interval: number;
}

export interface SmpBackendParams {
  loss_type: string;
  scheduler: string;
  encoder_depth: number;
  freeze_encoder: boolean;
}

export interface HfSegBackendParams {
  do_reduce_labels: boolean;
  warmup_ratio: number;
  weight_decay: number;
  lr_scheduler_type: string;
}

export interface MmSegBackendParams {
  optimizer_type: string;
  lr_schedule: string;
  crop_size: number;
  warmup_iters: number;
  weight_decay: number;
  checkpoint_interval: number;
}

export interface Detectron2BackendParams {
  optimizer_type: string;
  momentum: number;
  weight_decay: number;
  lr_schedule: string;
  warmup_iters: number;
  checkpoint_interval: number;
  mask_head: boolean;
}

export interface MmPoseBackendParams {
  optimizer_type: string;
  weight_decay: number;
  lr_schedule: string;
  warmup_iters: number;
  input_size_h: number;
  input_size_w: number;
  checkpoint_interval: number;
}

export interface MmRotateBackendParams {
  optimizer_type: string;
  momentum: number;
  weight_decay: number;
  lr_schedule: string;
  warmup_iters: number;
  angle_version: string;
  checkpoint_interval: number;
}

export interface TimmBackendParams {
  optimizer_type: string;
  weight_decay: number;
  scheduler: string;
  mixup: number;
  cutmix: number;
  label_smoothing: number;
  drop_rate: number;
}

export interface HfClassificationBackendParams {
  warmup_ratio: number;
  weight_decay: number;
  lr_scheduler_type: string;
  label_smoothing: number;
}

export interface TsaiBackendParams {
  optimizer_type: string;
  weight_decay: number;
  scheduler: string;
  window_size: number;
  stride: number;
}

export interface PytorchForecastingBackendParams {
  max_prediction_length: number;
  max_encoder_length: number;
  gradient_clip_val: number;
  hidden_size: number;
  dropout: number;
}

export interface PyodBackendParams {
  contamination: number;
  hidden_neurons: string;
  n_estimators: number;
}

export interface TslearnBackendParams {
  n_clusters: number;
  metric: string;
  max_iter: number;
}

export interface PypotsBackendParams {
  n_layers: number;
  d_model: number;
  d_ffn: number;
  n_heads: number;
}

export interface StumpyBackendParams {
  window_size: number;
  normalize: boolean;
}

// ─── Training Panel State ───────────────────────────────────────────────────

export type TrainingPhase = 'setup' | 'backend' | 'config' | 'execution' | 'installing_backend' | 'training' | 'completed';
