import { useTranslation } from 'react-i18next';
import { TrainingParamGroup, type ParamDefinition } from './TrainingParamGroup';
import { TrainingAdvancedConfig } from './TrainingAdvancedConfig';
import { TrainingAugmentation } from './TrainingAugmentation';
import { DatasetSplitVisualizer } from './DatasetSplitVisualizer';
import type { TrainingBackend, TrainingConfig, TrainingRequest } from '../types';
import { OPTIMIZERS } from '../utils/presets';

interface BackendConfigPanelProps {
  backend: TrainingBackend;
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
  yoloConfig?: TrainingConfig;
  totalImages?: number;
  onCommonChange: (key: string, value: unknown) => void;
  onBackendParamChange: (key: string, value: unknown) => void;
  onYoloConfigChange?: (partial: Partial<TrainingConfig>) => void;
  onYoloAugChange?: (partial: Partial<TrainingConfig['augmentation']>) => void;
}

// Common params shared across all backends
const COMMON_PARAMS: ParamDefinition[] = [
  { key: 'epochs', type: 'number', min: 1, max: 10000 },
  { key: 'batchSize', type: 'number', min: -1, max: 256 },
  { key: 'imageSize', type: 'number', min: 32, max: 4096, step: 32 },
  { key: 'lr', type: 'number', min: 0.000001, max: 1, step: 0.0001 },
  { key: 'patience', type: 'number', min: 0, max: 1000 },
  { key: 'valSplit', type: 'slider', min: 0, max: 0.5, step: 0.05 },
  { key: 'testSplit', type: 'slider', min: 0, max: 0.5, step: 0.05 },
  { key: 'workers', type: 'number', min: 0, max: 32 },
  { key: 'amp', type: 'checkbox' },
];

const RTDETR_PARAMS: ParamDefinition[] = [
  { key: 'optimizer', type: 'select', options: OPTIMIZERS },
  { key: 'lrf', type: 'number', min: 0.0001, max: 1, step: 0.001 },
  { key: 'warmup_epochs', type: 'number', min: 0, max: 20, step: 0.5 },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.0001 },
  { key: 'freeze', type: 'number', min: 0, max: 50 },
];

const RFDETR_PARAMS: ParamDefinition[] = [
  { key: 'resolution', type: 'number', min: 56, max: 1568, step: 56 },
  { key: 'lr_encoder', type: 'number', min: 0.000001, max: 0.01, step: 0.000001 },
  { key: 'grad_accum_steps', type: 'number', min: 1, max: 16 },
  { key: 'use_ema', type: 'checkbox' },
  { key: 'early_stopping', type: 'checkbox' },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.0001 },
  { key: 'gradient_checkpointing', type: 'checkbox' },
];

const MMDET_PARAMS: ParamDefinition[] = [
  { key: 'optimizer_type', type: 'select', options: [
    { value: 'SGD', label: 'SGD' },
    { value: 'Adam', label: 'Adam' },
    { value: 'AdamW', label: 'AdamW' },
  ]},
  { key: 'momentum', type: 'number', min: 0, max: 1, step: 0.01 },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.0001 },
  { key: 'lr_schedule', type: 'select', options: [
    { value: 'step', label: 'Step LR' },
    { value: 'cosine', label: 'Cosine Annealing' },
  ]},
  { key: 'warmup_iters', type: 'number', min: 0, max: 5000 },
  { key: 'checkpoint_interval', type: 'number', min: 1, max: 50 },
];

const SMP_PARAMS: ParamDefinition[] = [
  { key: 'loss_type', type: 'select', options: [
    { value: 'dice+ce', label: 'Dice + CE' },
    { value: 'dice', label: 'Dice Loss' },
    { value: 'ce', label: 'Cross Entropy' },
    { value: 'focal', label: 'Focal Loss' },
    { value: 'jaccard', label: 'Jaccard / IoU Loss' },
  ]},
  { key: 'scheduler', type: 'select', options: [
    { value: 'cosine', label: 'Cosine Annealing' },
    { value: 'poly', label: 'Polynomial' },
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
    { value: 'cosine', label: 'Cosine' },
    { value: 'linear', label: 'Linear' },
    { value: 'polynomial', label: 'Polynomial' },
  ]},
];

const MMSEG_PARAMS: ParamDefinition[] = [
  { key: 'optimizer_type', type: 'select', options: [
    { value: 'AdamW', label: 'AdamW' },
    { value: 'SGD', label: 'SGD' },
  ]},
  { key: 'lr_schedule', type: 'select', options: [
    { value: 'poly', label: 'Polynomial' },
    { value: 'cosine', label: 'Cosine Annealing' },
    { value: 'step', label: 'Step LR' },
  ]},
  { key: 'crop_size', type: 'number', min: 256, max: 1024, step: 32 },
  { key: 'warmup_iters', type: 'number', min: 0, max: 5000 },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
  { key: 'checkpoint_interval', type: 'number', min: 1, max: 50 },
];

export function BackendConfigPanel({
  backend,
  commonParams,
  backendParams,
  yoloConfig,
  totalImages,
  onCommonChange,
  onBackendParamChange,
  onYoloConfigChange,
  onYoloAugChange,
}: BackendConfigPanelProps) {
  const { t } = useTranslation();

  const splitVisualizer = (
    <DatasetSplitVisualizer
      total={totalImages ?? 0}
      valSplit={commonParams.valSplit}
      testSplit={commonParams.testSplit}
    />
  );

  // YOLO uses the existing advanced config UI
  if (backend === 'yolo' && yoloConfig && onYoloConfigChange && onYoloAugChange) {
    return (
      <div className="space-y-4">
        {splitVisualizer}
        <TrainingParamGroup
          titleKey="training.params.commonTitle"
          icon="fas fa-sliders-h"
          defaultOpen={true}
          params={COMMON_PARAMS}
          values={commonParams}
          onChange={onCommonChange}
        />
        <TrainingAdvancedConfig config={yoloConfig} onChange={onYoloConfigChange} />
        <TrainingAugmentation
          augmentation={yoloConfig.augmentation}
          closeMosaic={yoloConfig.close_mosaic}
          onChange={onYoloAugChange}
          onCloseMosaicChange={(v) => onYoloConfigChange({ close_mosaic: v })}
        />
      </div>
    );
  }

  // Other backends: common + backend-specific params
  let specificParams: ParamDefinition[] = [];
  let specificTitle = '';
  switch (backend) {
    case 'rt_detr':
      specificParams = RTDETR_PARAMS;
      specificTitle = 'training.params.rtdetrTitle';
      break;
    case 'rf_detr':
      specificParams = RFDETR_PARAMS;
      specificTitle = 'training.params.rfdetrTitle';
      break;
    case 'mmdetection':
      specificParams = MMDET_PARAMS;
      specificTitle = 'training.params.mmdetTitle';
      break;
    case 'smp':
      specificParams = SMP_PARAMS;
      specificTitle = 'training.params.smpTitle';
      break;
    case 'hf_segmentation':
      specificParams = HF_SEG_PARAMS;
      specificTitle = 'training.params.hfSegTitle';
      break;
    case 'mmsegmentation':
      specificParams = MMSEG_PARAMS;
      specificTitle = 'training.params.mmsegTitle';
      break;
  }

  return (
    <div className="space-y-4">
      {splitVisualizer}
      <TrainingParamGroup
        titleKey="training.params.commonTitle"
        icon="fas fa-sliders-h"
        defaultOpen={true}
        params={COMMON_PARAMS}
        values={commonParams}
        onChange={onCommonChange}
      />

      {specificParams.length > 0 && (
        <TrainingParamGroup
          titleKey={specificTitle}
          icon="fas fa-cog"
          defaultOpen={true}
          params={specificParams}
          values={backendParams}
          onChange={onBackendParamChange}
        />
      )}
    </div>
  );
}
