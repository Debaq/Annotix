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
}

// ─── Python Env ─────────────────────────────────────────────────────────────

export interface PythonEnvStatus {
  installed: boolean;
  pythonPath: string | null;
  ultralyticsVersion: string | null;
  torchVersion: string | null;
  cudaAvailable: boolean;
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

// ─── Training Preset ────────────────────────────────────────────────────────

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

// ─── Training Panel State ───────────────────────────────────────────────────

export type TrainingPhase = 'setup' | 'config' | 'training' | 'completed';
