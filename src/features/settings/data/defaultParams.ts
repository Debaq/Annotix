/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface ParamDefinition {
  key: string;
  type: 'number' | 'checkbox' | 'select' | 'slider';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

/* ─── Common params (shared by YOLO-based backends) ──────────────────────── */

const COMMON_PARAMS: ParamDefinition[] = [
  { key: 'epochs', type: 'number', min: 1, max: 10000 },
  { key: 'batchSize', type: 'number', min: -1, max: 256 },
  { key: 'imageSize', type: 'number', min: 32, max: 4096, step: 32 },
  { key: 'lr', type: 'number', min: 0.000001, max: 1, step: 0.0001 },
  { key: 'patience', type: 'number', min: 0, max: 1000 },
  { key: 'valSplit', type: 'slider', min: 0.05, max: 0.5, step: 0.05 },
  { key: 'workers', type: 'number', min: 0, max: 32 },
  { key: 'amp', type: 'checkbox' },
];

const RTDETR_PARAMS: ParamDefinition[] = [
  { key: 'optimizer', type: 'select', options: [
    { value: 'auto', label: 'Auto' }, { value: 'SGD', label: 'SGD' },
    { value: 'Adam', label: 'Adam' }, { value: 'AdamW', label: 'AdamW' },
    { value: 'NAdam', label: 'NAdam' }, { value: 'RAdam', label: 'RAdam' },
    { value: 'RMSProp', label: 'RMSProp' },
  ]},
  { key: 'lrf', type: 'number', min: 0.0001, max: 1, step: 0.001 },
  { key: 'warmup_epochs', type: 'number', min: 0, max: 20, step: 0.5 },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.0001 },
  { key: 'freeze', type: 'number', min: 0, max: 50 },
];

const RFDETR_PARAMS: ParamDefinition[] = [
  // Múltiplos de 32: RF-DETR rechaza cualquier otro valor.
  { key: 'resolution', type: 'number', min: 320, max: 1568, step: 32 },
  { key: 'lr_encoder', type: 'number', min: 0.000001, max: 0.01, step: 0.000001 },
  { key: 'grad_accum_steps', type: 'number', min: 1, max: 16 },
  { key: 'use_ema', type: 'checkbox' },
  { key: 'early_stopping', type: 'checkbox' },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.0001 },
  { key: 'gradient_checkpointing', type: 'checkbox' },
];

const HF_DETECTION_PARAMS: ParamDefinition[] = [
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.0001 },
];

const SMP_PARAMS: ParamDefinition[] = [
  { key: 'loss_type', type: 'select', options: [
    { value: 'dice+ce', label: 'Dice + CE' }, { value: 'dice', label: 'Dice Loss' },
    { value: 'ce', label: 'Cross Entropy' }, { value: 'focal', label: 'Focal Loss' },
    { value: 'jaccard', label: 'Jaccard / IoU Loss' },
  ]},
  { key: 'scheduler', type: 'select', options: [
    { value: 'cosine', label: 'Cosine Annealing' }, { value: 'poly', label: 'Polynomial' },
    { value: 'step', label: 'Step LR' },
  ]},
  { key: 'encoder_depth', type: 'number', min: 3, max: 5 },
  { key: 'freeze_encoder', type: 'checkbox' },
];

const HF_SEG_PARAMS: ParamDefinition[] = [
  { key: 'do_reduce_labels', type: 'checkbox' },
  { key: 'warmup_ratio', type: 'number', min: 0, max: 0.2, step: 0.01 },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
  { key: 'lr_scheduler_type', type: 'select', options: [
    { value: 'cosine', label: 'Cosine' }, { value: 'linear', label: 'Linear' },
    { value: 'polynomial', label: 'Polynomial' },
  ]},
];

const HF_INSTANCE_PARAMS: ParamDefinition[] = [
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
];

const HF_POSE_PARAMS: ParamDefinition[] = [
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
  { key: 'heatmap_sigma', type: 'number', min: 0.5, max: 6, step: 0.5 },
];

const TIMM_PARAMS: ParamDefinition[] = [
  { key: 'optimizer_type', type: 'select', options: [
    { value: 'AdamW', label: 'AdamW' }, { value: 'SGD', label: 'SGD' }, { value: 'LAMB', label: 'LAMB' },
  ]},
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
  { key: 'scheduler', type: 'select', options: [
    { value: 'cosine', label: 'Cosine' }, { value: 'step', label: 'Step LR' }, { value: 'plateau', label: 'ReduceOnPlateau' },
  ]},
  { key: 'mixup', type: 'number', min: 0, max: 1, step: 0.1 },
  { key: 'cutmix', type: 'number', min: 0, max: 1, step: 0.1 },
  { key: 'label_smoothing', type: 'number', min: 0, max: 0.3, step: 0.01 },
  { key: 'drop_rate', type: 'number', min: 0, max: 0.5, step: 0.05 },
];

const HF_CLS_PARAMS: ParamDefinition[] = [
  { key: 'warmup_ratio', type: 'number', min: 0, max: 0.2, step: 0.01 },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
  { key: 'lr_scheduler_type', type: 'select', options: [
    { value: 'cosine', label: 'Cosine' }, { value: 'linear', label: 'Linear' },
  ]},
  { key: 'label_smoothing', type: 'number', min: 0, max: 0.3, step: 0.01 },
];

const TSAI_PARAMS: ParamDefinition[] = [
  { key: 'optimizer_type', type: 'select', options: [
    { value: 'Adam', label: 'Adam' }, { value: 'AdamW', label: 'AdamW' }, { value: 'SGD', label: 'SGD' },
  ]},
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
  { key: 'scheduler', type: 'select', options: [
    { value: 'one_cycle', label: 'One Cycle' }, { value: 'cosine', label: 'Cosine' }, { value: 'step', label: 'Step LR' },
  ]},
  { key: 'window_size', type: 'number', min: 8, max: 1024, step: 8 },
  { key: 'stride', type: 'number', min: 1, max: 512 },
];

const PYTORCH_FCST_PARAMS: ParamDefinition[] = [
  { key: 'max_prediction_length', type: 'number', min: 1, max: 365 },
  { key: 'max_encoder_length', type: 'number', min: 1, max: 1000 },
  { key: 'gradient_clip_val', type: 'number', min: 0, max: 10, step: 0.1 },
  { key: 'hidden_size', type: 'number', min: 8, max: 512, step: 8 },
  { key: 'dropout', type: 'number', min: 0, max: 0.5, step: 0.05 },
];

const PYOD_PARAMS: ParamDefinition[] = [
  { key: 'contamination', type: 'number', min: 0.01, max: 0.5, step: 0.01 },
  { key: 'n_estimators', type: 'number', min: 10, max: 500 },
];

const TSLEARN_PARAMS: ParamDefinition[] = [
  { key: 'n_clusters', type: 'number', min: 2, max: 50 },
  { key: 'metric', type: 'select', options: [
    { value: 'dtw', label: 'DTW' }, { value: 'euclidean', label: 'Euclidean' }, { value: 'softdtw', label: 'Soft-DTW' },
  ]},
  { key: 'max_iter', type: 'number', min: 10, max: 1000 },
];

const PYPOTS_PARAMS: ParamDefinition[] = [
  { key: 'n_layers', type: 'number', min: 1, max: 12 },
  { key: 'd_model', type: 'number', min: 32, max: 512, step: 32 },
  { key: 'd_ffn', type: 'number', min: 64, max: 2048, step: 64 },
  { key: 'n_heads', type: 'number', min: 1, max: 16 },
];

const STUMPY_PARAMS: ParamDefinition[] = [
  { key: 'window_size', type: 'number', min: 3, max: 1000 },
  { key: 'normalize', type: 'checkbox' },
];

const SKLEARN_PARAMS: ParamDefinition[] = [
  { key: 'valSplit', type: 'slider', min: 0.05, max: 0.5, step: 0.05 },
  { key: 'n_estimators', type: 'number', min: 10, max: 2000 },
  { key: 'max_depth', type: 'number', min: 0, max: 100 },
  { key: 'n_neighbors', type: 'number', min: 1, max: 50 },
  { key: 'C', type: 'number', min: 0.001, max: 100, step: 0.1 },
  { key: 'alpha', type: 'number', min: 0.0001, max: 10, step: 0.01 },
];

/* ─── Backend → params mapping ───────────────────────────────────────────── */

const COMMON_TS: ParamDefinition[] = COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'lr', 'valSplit', 'patience'].includes(p.key));
const COMMON_IMG: ParamDefinition[] = COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'imageSize', 'lr', 'valSplit', 'workers'].includes(p.key));

export const BACKEND_PARAMS: Record<string, ParamDefinition[]> = {
  yolo: [...COMMON_PARAMS, ...RTDETR_PARAMS],
  rt_detr: [...COMMON_PARAMS, ...RTDETR_PARAMS],
  rf_detr: [...COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'lr', 'valSplit'].includes(p.key)), ...RFDETR_PARAMS],
  hf_detection: [...COMMON_IMG, ...HF_DETECTION_PARAMS],
  smp: [...COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'imageSize', 'lr', 'valSplit', 'workers', 'amp'].includes(p.key)), ...SMP_PARAMS],
  hf_segmentation: [...COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'imageSize', 'lr', 'valSplit'].includes(p.key)), ...HF_SEG_PARAMS],

  hf_instance: [...COMMON_IMG, ...HF_INSTANCE_PARAMS],
  hf_pose: [...COMMON_IMG, ...HF_POSE_PARAMS],

  timm: [...COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'imageSize', 'lr', 'valSplit', 'workers', 'amp'].includes(p.key)), ...TIMM_PARAMS],
  hf_classification: [...COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'imageSize', 'lr', 'valSplit'].includes(p.key)), ...HF_CLS_PARAMS],
  tsai: [...COMMON_TS, ...TSAI_PARAMS],
  pytorch_forecasting: [...COMMON_TS, ...PYTORCH_FCST_PARAMS],
  pyod: [...COMMON_PARAMS.filter(p => ['epochs', 'batchSize', 'lr', 'valSplit'].includes(p.key)), ...PYOD_PARAMS],
  tslearn: [...COMMON_PARAMS.filter(p => ['valSplit'].includes(p.key)), ...TSLEARN_PARAMS],
  pypots: [...COMMON_TS, ...PYPOTS_PARAMS],
  stumpy: [...COMMON_PARAMS.filter(p => ['valSplit'].includes(p.key)), ...STUMPY_PARAMS],
  sklearn: SKLEARN_PARAMS,
};

/* ─── Default values per backend ─────────────────────────────────────────── */

export const DEFAULT_VALUES: Record<string, Record<string, unknown>> = {
  yolo: {
    epochs: 100, batchSize: 16, imageSize: 640, lr: 0.01,
    patience: 50, valSplit: 0.2, workers: 8, amp: true,
    optimizer: 'auto', lrf: 0.01, warmup_epochs: 3.0, weight_decay: 0.0005, freeze: 0,
  },
  rt_detr: {
    epochs: 100, batchSize: 16, imageSize: 640, lr: 0.0002,
    patience: 50, valSplit: 0.2, workers: 8, amp: true,
    optimizer: 'AdamW', lrf: 0.01, warmup_epochs: 3.0, weight_decay: 0.0001, freeze: 0,
  },
  rf_detr: {
    epochs: 100, batchSize: 16, lr: 0.0004, valSplit: 0.2,
    resolution: 576, lr_encoder: 0.00001, grad_accum_steps: 4,
    use_ema: true, early_stopping: true, weight_decay: 0.0001, gradient_checkpointing: false,
  },
  smp: {
    epochs: 100, batchSize: 16, imageSize: 512, lr: 0.0001, valSplit: 0.2, workers: 4, amp: true,
    loss_type: 'dice+ce', scheduler: 'cosine', encoder_depth: 5, freeze_encoder: false,
  },
  hf_segmentation: {
    epochs: 100, batchSize: 16, imageSize: 512, lr: 0.00006, valSplit: 0.2,
    do_reduce_labels: false, warmup_ratio: 0.05, weight_decay: 0.01, lr_scheduler_type: 'cosine',
  },
  hf_detection: { weight_decay: 0.0001 },
  hf_instance: { weight_decay: 0.0001 },
  hf_pose: { weight_decay: 0.0001, heatmap_sigma: 2 },
  timm: {
    epochs: 100, batchSize: 32, imageSize: 224, lr: 0.001, valSplit: 0.2, workers: 4, amp: true,
    optimizer_type: 'AdamW', weight_decay: 0.05, scheduler: 'cosine',
    mixup: 0.0, cutmix: 0.0, label_smoothing: 0.1, drop_rate: 0.0,
  },
  hf_classification: {
    epochs: 30, batchSize: 32, imageSize: 224, lr: 0.00005, valSplit: 0.2,
    warmup_ratio: 0.1, weight_decay: 0.01, lr_scheduler_type: 'cosine', label_smoothing: 0.0,
  },
  tsai: {
    epochs: 100, batchSize: 64, lr: 0.001, valSplit: 0.2, patience: 20,
    optimizer_type: 'Adam', weight_decay: 0.0001, scheduler: 'one_cycle',
    window_size: 64, stride: 1,
  },
  pytorch_forecasting: {
    epochs: 100, batchSize: 64, lr: 0.001, valSplit: 0.2, patience: 10,
    max_prediction_length: 24, max_encoder_length: 168,
    gradient_clip_val: 0.1, hidden_size: 64, dropout: 0.1,
  },
  pyod: {
    epochs: 100, batchSize: 32, lr: 0.001, valSplit: 0.2,
    contamination: 0.1, n_estimators: 100,
  },
  tslearn: {
    valSplit: 0.2,
    n_clusters: 3, metric: 'dtw', max_iter: 50,
  },
  pypots: {
    epochs: 100, batchSize: 32, lr: 0.001, valSplit: 0.2, patience: 10,
    n_layers: 2, d_model: 128, d_ffn: 256, n_heads: 4,
  },
  stumpy: {
    valSplit: 0.2,
    window_size: 50, normalize: true,
  },
  sklearn: {
    valSplit: 0.2,
    n_estimators: 100, max_depth: 0, n_neighbors: 5, C: 1.0, alpha: 1.0,
  },
};
