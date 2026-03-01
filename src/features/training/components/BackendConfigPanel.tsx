import { useTranslation } from 'react-i18next';
import { TrainingParamGroup, type ParamDefinition } from './TrainingParamGroup';
import { TrainingAdvancedConfig } from './TrainingAdvancedConfig';
import { TrainingAugmentation } from './TrainingAugmentation';
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
    workers: number;
    amp: boolean;
  };
  backendParams: Record<string, unknown>;
  yoloConfig?: TrainingConfig;
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
  { key: 'valSplit', type: 'slider', min: 0.05, max: 0.5, step: 0.05 },
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

export function BackendConfigPanel({
  backend,
  commonParams,
  backendParams,
  yoloConfig,
  onCommonChange,
  onBackendParamChange,
  onYoloConfigChange,
  onYoloAugChange,
}: BackendConfigPanelProps) {
  const { t } = useTranslation();

  // YOLO uses the existing advanced config UI
  if (backend === 'yolo' && yoloConfig && onYoloConfigChange && onYoloAugChange) {
    return (
      <div className="space-y-4">
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
  }

  return (
    <div className="space-y-4">
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
