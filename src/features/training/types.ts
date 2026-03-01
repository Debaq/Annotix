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
}

// ─── Multi-Backend Types ─────────────────────────────────────────────────────

export type TrainingBackend = 'yolo' | 'rt_detr' | 'rf_detr' | 'mmdetection';
export type ExecutionMode = 'local' | 'download_package';
export type DatasetFormat = 'yolo_txt' | 'coco_json';

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

// ─── Training Panel State ───────────────────────────────────────────────────

export type TrainingPhase = 'setup' | 'backend' | 'config' | 'execution' | 'training' | 'completed';
