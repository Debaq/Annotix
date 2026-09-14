import { TrainingParamGroup, type ParamDefinition } from './TrainingParamGroup';
import { TrainingAdvancedConfig } from './TrainingAdvancedConfig';
import { TrainingAugmentation } from './TrainingAugmentation';
import { DatasetSplitVisualizer } from './DatasetSplitVisualizer';
import { SplitPolicyPanel } from './SplitPolicyPanel';
import type { TrainingBackend, TrainingConfig } from '../types';
import { OPTIMIZERS } from '../utils/presets';

interface BackendConfigPanelProps {
  backend: TrainingBackend;
  /** Proyecto cuya política de partición se declara junto al reparto. */
  projectId?: string;
  /** Resolución mínima del backend, de `BackendInfo.minImageSize`. */
  minImageSize?: number;
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

// Sólo los parámetros que el script generado lee de verdad: los que había antes
// (momentum, warmup_iters, checkpoint_interval) venían de los configs de OpenMMLab y
// no los consumía nadie.
const HF_DETECTION_PARAMS: ParamDefinition[] = [
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.0001 },
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

const HF_INSTANCE_PARAMS: ParamDefinition[] = [
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
];

const HF_POSE_PARAMS: ParamDefinition[] = [
  { key: 'weight_decay', type: 'number', min: 0, max: 0.1, step: 0.001 },
  // Dispersión del heatmap gaussiano por keypoint, en píxeles de la salida.
  { key: 'heatmap_sigma', type: 'number', min: 0.5, max: 6, step: 0.5 },
];

export function BackendConfigPanel({
  backend,
  projectId,
  minImageSize,
  commonParams,
  backendParams,
  yoloConfig,
  totalImages,
  onCommonChange,
  onBackendParamChange,
  onYoloConfigChange,
  onYoloAugChange,
}: BackendConfigPanelProps) {
  // El mínimo lo publica el backend (BackendInfo.minImageSize): RT-DETR y RF-DETR
  // no arrancan por debajo de 320 px y el runner rechaza la corrida, así que el
  // control no debe dejar bajar de ahí.
  const paramsComunes: ParamDefinition[] = COMMON_PARAMS.map((p) =>
    p.key === 'imageSize' ? { ...p, min: minImageSize ?? p.min } : p,
  );

  // La política va pegada al visor del reparto: describen lo mismo, una lo que se
  // declaró y el otro lo que sale de aplicarlo a este corpus.
  const splitVisualizer = (
    <div className="space-y-2">
      <DatasetSplitVisualizer
        total={totalImages ?? 0}
        valSplit={commonParams.valSplit}
        testSplit={commonParams.testSplit}
      />
      {projectId && (
        <SplitPolicyPanel
          projectId={projectId}
          valSplit={commonParams.valSplit}
          testSplit={commonParams.testSplit}
          onApplyFractions={(val, test) => {
            onCommonChange('valSplit', val);
            onCommonChange('testSplit', test);
          }}
        />
      )}
    </div>
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
          params={paramsComunes}
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
    case 'hf_detection':
      specificParams = HF_DETECTION_PARAMS;
      specificTitle = 'training.params.hfDetectionTitle';
      break;
    case 'smp':
      specificParams = SMP_PARAMS;
      specificTitle = 'training.params.smpTitle';
      break;
    case 'hf_segmentation':
      specificParams = HF_SEG_PARAMS;
      specificTitle = 'training.params.hfSegTitle';
      break;
    case 'hf_instance':
      specificParams = HF_INSTANCE_PARAMS;
      specificTitle = 'training.params.hfInstanceTitle';
      break;
    case 'hf_pose':
      specificParams = HF_POSE_PARAMS;
      specificTitle = 'training.params.hfPoseTitle';
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
