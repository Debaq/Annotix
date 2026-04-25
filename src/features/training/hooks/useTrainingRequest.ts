import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  TrainingBackend,
  ExecutionMode,
  TrainingRequest,
  BackendInfo,
  CloudProvider,
  CloudTrainingConfig,
} from '../types';
import { projectTypeToTask } from '../utils/modelMapping';
import { trainingService } from '../services/trainingService';

// ─── Persistencia en localStorage ──────────────────────────────────────────

const STORAGE_KEY = 'annotix_training_config';

interface PersistedConfig {
  backend: TrainingBackend;
  modelId: string;
  modelSize: string;
  executionMode: ExecutionMode;
  commonParams: {
    epochs: number;
    batchSize: number;
    imageSize: number;
    lr: number;
    patience: number;
    valSplit: number;
    testSplit: number;
    workers: number;
    amp: boolean;
  };
  backendParams: Record<string, unknown>;
  exportFormats: string[];
  timestamp: number;
}

function loadPersistedConfig(): PersistedConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedConfig;
    // Expirar después de 24h
    if (Date.now() - parsed.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedConfig(config: PersistedConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage lleno o no disponible — ignorar
  }
}

// Default backend-specific params
const DEFAULT_BACKEND_PARAMS: Record<TrainingBackend, Record<string, unknown>> = {
  yolo: {
    modelSize: 'n',
    optimizer: 'auto',
    lrf: 0.01,
    cos_lr: false,
    warmup_epochs: 3.0,
    warmup_momentum: 0.8,
    warmup_bias_lr: 0.1,
    momentum: 0.937,
    weight_decay: 0.0005,
    nbs: 64,
    box: 7.5,
    cls: 0.5,
    dfl: 1.5,
    close_mosaic: 10,
    max_det: 300,
    multi_scale: 0.0,
    rect: false,
    cache: false,
    single_cls: false,
    pretrained: true,
    freeze: null,
    augmentation: {
      mosaic: 1.0,
      mixup: 0.0,
      hsv_h: 0.015,
      hsv_s: 0.7,
      hsv_v: 0.4,
      flipud: 0.0,
      fliplr: 0.5,
      degrees: 0.0,
      scale: 0.5,
      shear: 0.0,
      perspective: 0.0,
      copy_paste: 0.0,
      erasing: 0.4,
      translate: 0.1,
    },
  },
  rt_detr: {
    optimizer: 'AdamW',
    lrf: 0.01,
    warmup_epochs: 3.0,
    weight_decay: 0.0001,
    freeze: null,
  },
  rf_detr: {
    resolution: 560,
    lr_encoder: 0.00001,
    grad_accum_steps: 4,
    use_ema: true,
    early_stopping: true,
    weight_decay: 0.0001,
    gradient_checkpointing: false,
  },
  mmdetection: {
    optimizer_type: 'SGD',
    momentum: 0.9,
    weight_decay: 0.0001,
    lr_schedule: 'step',
    milestones: [],
    warmup_iters: 500,
    checkpoint_interval: 1,
  },
  smp: {
    loss_type: 'dice+ce',
    scheduler: 'cosine',
    encoder_depth: 5,
    freeze_encoder: false,
  },
  hf_segmentation: {
    do_reduce_labels: false,
    warmup_ratio: 0.05,
    weight_decay: 0.01,
    lr_scheduler_type: 'cosine',
  },
  mmsegmentation: {
    optimizer_type: 'AdamW',
    lr_schedule: 'poly',
    crop_size: 512,
    warmup_iters: 500,
    weight_decay: 0.01,
    checkpoint_interval: 1,
  },
  detectron2: {
    optimizer_type: 'SGD',
    momentum: 0.9,
    weight_decay: 0.0001,
    warmup_iters: 1000,
    checkpoint_period: 5000,
    roi_head_batch_size: 512,
  },
  mmpose: {
    optimizer_type: 'Adam',
    weight_decay: 0.0,
    lr_schedule: 'step',
    warmup_iters: 500,
    checkpoint_interval: 10,
    flip_test: true,
  },
  mmrotate: {
    optimizer_type: 'SGD',
    momentum: 0.9,
    weight_decay: 0.0001,
    lr_schedule: 'step',
    warmup_iters: 500,
    checkpoint_interval: 1,
  },
  timm: {
    optimizer_type: 'AdamW',
    weight_decay: 0.05,
    lr_schedule: 'cosine',
    warmup_epochs: 5,
    label_smoothing: 0.1,
    mixup_alpha: 0.8,
    cutmix_alpha: 1.0,
  },
  hf_classification: {
    warmup_ratio: 0.1,
    weight_decay: 0.01,
    lr_scheduler_type: 'cosine',
    gradient_accumulation_steps: 1,
  },
  tsai: {
    optimizer_type: 'Adam',
    weight_decay: 0.01,
    lr_schedule: 'one_cycle',
    sequence_length: 100,
    stride: 1,
  },
  pytorch_forecasting: {
    max_prediction_length: 24,
    max_encoder_length: 96,
    gradient_clip_val: 0.1,
    hidden_size: 64,
    attention_head_size: 4,
  },
  pyod: {
    contamination: 0.1,
    hidden_neurons: [64, 32],
    n_estimators: 100,
  },
  tslearn: {
    n_clusters: 3,
    max_iter: 50,
    metric: 'dtw',
  },
  pypots: {
    n_layers: 2,
    d_model: 256,
    d_ffn: 128,
    n_heads: 4,
  },
  stumpy: {
    window_size: 50,
    normalize: true,
  },
  sklearn: {
    n_estimators: 100,
    max_depth: null,
    n_neighbors: 5,
    C: 1.0,
    alpha: 1.0,
    target_column: '',
    feature_columns: [],
    task_type: '',
  },
};

const DEFAULT_LR: Record<TrainingBackend, number> = {
  yolo: 0.01,
  rt_detr: 0.0002,
  rf_detr: 0.0004,
  mmdetection: 0.02,
  smp: 0.0001,
  hf_segmentation: 0.00006,
  mmsegmentation: 0.0001,
  detectron2: 0.0025,
  mmpose: 0.0005,
  mmrotate: 0.01,
  timm: 0.001,
  hf_classification: 0.00005,
  tsai: 0.001,
  pytorch_forecasting: 0.001,
  pyod: 0.001,
  tslearn: 0.001,
  pypots: 0.001,
  stumpy: 0.001,
  sklearn: 0.001,
};

export function useTrainingRequest(projectType: string) {
  const task = projectTypeToTask(projectType);
  const persisted = useRef(loadPersistedConfig());

  const [backend, setBackend] = useState<TrainingBackend>(persisted.current?.backend ?? 'yolo');
  const [modelId, setModelId] = useState(persisted.current?.modelId ?? 'yolo11');
  const [modelSize, setModelSize] = useState(persisted.current?.modelSize ?? 'n');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(persisted.current?.executionMode ?? 'local');
  const [backends, setBackends] = useState<BackendInfo[]>([]);

  const [commonParams, setCommonParams] = useState(() => {
    const persistedCommon = persisted.current?.commonParams;
    return {
      epochs: 100,
      batchSize: -1,
      imageSize: 640,
      lr: 0.01,
      patience: 50,
      valSplit: 0.2,
      testSplit: 0,
      workers: 4,
      amp: true,
      ...(persistedCommon ?? {}),
    };
  });

  const [backendParams, setBackendParams] = useState<Record<string, unknown>>(
    persisted.current?.backendParams ?? DEFAULT_BACKEND_PARAMS.yolo
  );

  const [exportFormats, setExportFormats] = useState<string[]>(persisted.current?.exportFormats ?? []);
  const [baseModelPath, setBaseModelPath] = useState<string | null>(null);
  const [cloudProvider, setCloudProvider] = useState<CloudProvider | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudTrainingConfig | null>(null);

  // Persistir config en localStorage cuando cambia
  useEffect(() => {
    savePersistedConfig({
      backend,
      modelId,
      modelSize,
      executionMode,
      commonParams,
      backendParams,
      exportFormats,
      timestamp: Date.now(),
    });
  }, [backend, modelId, modelSize, executionMode, commonParams, backendParams, exportFormats]);

  // Fetch backends on mount
  useEffect(() => {
    trainingService.getAvailableBackends(projectType).then(setBackends).catch(() => {});
  }, [projectType]);

  // Reset params when backend changes
  const changeBackend = useCallback((newBackend: TrainingBackend) => {
    setBackend(newBackend);
    setBackendParams({ ...DEFAULT_BACKEND_PARAMS[newBackend] });
    setCommonParams((prev) => ({
      ...prev,
      lr: DEFAULT_LR[newBackend],
    }));

    // Pick first recommended model of this backend
    const backendInfo = backends.find((b) => b.id === newBackend);
    if (backendInfo && backendInfo.models.length > 0) {
      const recommended = backendInfo.models.find((m) => m.recommended) || backendInfo.models[0];
      setModelId(recommended.id);
      if (recommended.sizes) {
        setModelSize(recommended.sizes[0]);
      }
    }
  }, [backends]);

  const updateCommonParam = useCallback((key: string, value: unknown) => {
    setCommonParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateBackendParam = useCallback((key: string, value: unknown) => {
    setBackendParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const currentBackendInfo = backends.find((b) => b.id === backend) || null;
  const currentModels = currentBackendInfo?.models || [];

  const updateCloudConfig = useCallback((key: string, value: unknown) => {
    setCloudConfig((prev) => {
      if (!prev) return null;
      return { ...prev, [key]: value };
    });
  }, []);

  const buildRequest = useCallback((): TrainingRequest => {
    const params = { ...backendParams };
    if (backend === 'yolo') {
      params.modelSize = modelSize;
    }

    const req: TrainingRequest = {
      backend,
      modelId,
      task,
      executionMode,
      epochs: commonParams.epochs,
      batchSize: commonParams.batchSize,
      imageSize: commonParams.imageSize,
      device: 'auto',
      lr: commonParams.lr,
      patience: commonParams.patience,
      valSplit: commonParams.valSplit,
      testSplit: commonParams.testSplit,
      workers: commonParams.workers,
      amp: commonParams.amp,
      resume: false,
      exportFormats,
      backendParams: params,
      baseModelPath: baseModelPath || undefined,
    };

    if (executionMode === 'cloud' && cloudConfig) {
      req.cloudConfig = cloudConfig;
    }

    return req;
  }, [backend, modelId, modelSize, task, executionMode, commonParams, backendParams, exportFormats, baseModelPath, cloudConfig]);

  return {
    backend,
    setBackend: changeBackend,
    modelId,
    setModelId,
    modelSize,
    setModelSize,
    executionMode,
    setExecutionMode,
    commonParams,
    updateCommonParam,
    backendParams,
    updateBackendParam,
    exportFormats,
    setExportFormats,
    backends,
    currentBackendInfo,
    currentModels,
    buildRequest,
    baseModelPath,
    setBaseModelPath,
    cloudProvider,
    setCloudProvider,
    cloudConfig,
    setCloudConfig,
    updateCloudConfig,
  };
}
