import { useTranslation } from 'react-i18next';
import { TrainingParamGroup, type ParamDefinition } from './TrainingParamGroup';
import { OPTIMIZERS } from '../utils/presets';
import type { TrainingConfig } from '../types';

interface TrainingAdvancedConfigProps {
  config: TrainingConfig;
  onChange: (partial: Partial<TrainingConfig>) => void;
}

const IMGSZ_OPTIONS = [
  { value: '256', label: '256px' },
  { value: '320', label: '320px' },
  { value: '416', label: '416px' },
  { value: '480', label: '480px' },
  { value: '640', label: '640px' },
  { value: '800', label: '800px' },
  { value: '960', label: '960px' },
  { value: '1024', label: '1024px' },
  { value: '1280', label: '1280px' },
];

const CACHE_OPTIONS = [
  { value: 'false', label: 'Off' },
  { value: 'ram', label: 'RAM' },
  { value: 'disk', label: 'Disk' },
];

const DEVICE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'cpu', label: 'CPU' },
  { value: 'cuda:0', label: 'CUDA:0' },
  { value: 'mps', label: 'MPS (Apple)' },
];

const TRAINING_PARAMS: ParamDefinition[] = [
  { key: 'epochs', type: 'number', min: 1, max: 9999 },
  { key: 'batchSize', type: 'number', min: -1, max: 512 },
  { key: 'imgsz', type: 'select', options: IMGSZ_OPTIONS },
  { key: 'patience', type: 'number', min: 0, max: 999 },
  { key: 'max_det', type: 'number', min: 1, max: 3000 },
  { key: 'multi_scale', type: 'slider', min: 0, max: 1, step: 0.05 },
  { key: 'rect', type: 'checkbox' },
  { key: 'cache', type: 'select', options: CACHE_OPTIONS },
];

const OPTIMIZER_PARAMS: ParamDefinition[] = [
  { key: 'optimizer', type: 'select', options: OPTIMIZERS },
  { key: 'lr0', type: 'number', min: 0.00001, max: 0.1, step: 0.001 },
  { key: 'lrf', type: 'number', min: 0.0001, max: 1, step: 0.001 },
  { key: 'cos_lr', type: 'checkbox' },
  { key: 'warmup_epochs', type: 'number', min: 0, max: 10, step: 0.5 },
  { key: 'momentum', type: 'number', min: 0.6, max: 0.98, step: 0.001 },
  { key: 'weight_decay', type: 'number', min: 0, max: 0.01, step: 0.0001 },
];

const LOSS_PARAMS: ParamDefinition[] = [
  { key: 'box', type: 'number', min: 0, max: 20, step: 0.5 },
  { key: 'cls', type: 'number', min: 0, max: 5, step: 0.1 },
  { key: 'dfl', type: 'number', min: 0, max: 5, step: 0.1 },
];

const TRANSFER_PARAMS: ParamDefinition[] = [
  { key: 'pretrained', type: 'checkbox' },
  { key: 'freeze', type: 'number', min: 0, max: 30, step: 1 },
];

const ADVANCED_PARAMS: ParamDefinition[] = [
  { key: 'amp', type: 'checkbox' },
  { key: 'nbs', type: 'number', min: 1, max: 128 },
  { key: 'single_cls', type: 'checkbox' },
  { key: 'warmup_momentum', type: 'number', min: 0, max: 0.95, step: 0.01 },
  { key: 'warmup_bias_lr', type: 'number', min: 0, max: 0.2, step: 0.01 },
  { key: 'valSplit', type: 'number', min: 0.05, max: 0.5, step: 0.05 },
  { key: 'workers', type: 'number', min: 0, max: 32 },
  { key: 'device', type: 'select', options: DEVICE_OPTIONS },
];

export function TrainingAdvancedConfig({ config, onChange }: TrainingAdvancedConfigProps) {
  const { t: _t } = useTranslation();

  // Flatten config to a Record for the param groups
  const flatValues: Record<string, unknown> = {
    epochs: config.epochs,
    batchSize: config.batchSize,
    imgsz: String(config.imgsz),
    patience: config.patience,
    max_det: config.max_det,
    multi_scale: config.multi_scale,
    rect: config.rect,
    cache: typeof config.cache === 'boolean' ? (config.cache ? 'ram' : 'false') : String(config.cache),
    optimizer: config.optimizer,
    lr0: config.lr0,
    lrf: config.lrf,
    cos_lr: config.cos_lr,
    warmup_epochs: config.warmup_epochs,
    momentum: config.momentum,
    weight_decay: config.weight_decay,
    box: config.box,
    cls: config.cls,
    dfl: config.dfl,
    pretrained: config.pretrained,
    freeze: config.freeze ?? 0,
    amp: config.amp,
    nbs: config.nbs,
    single_cls: config.single_cls,
    warmup_momentum: config.warmup_momentum,
    warmup_bias_lr: config.warmup_bias_lr,
    valSplit: config.valSplit,
    workers: config.workers,
    device: config.device,
  };

  const handleChange = (key: string, value: unknown) => {
    if (key === 'imgsz') {
      onChange({ imgsz: parseInt(value as string) });
    } else if (key === 'cache') {
      const v = value as string;
      onChange({ cache: v === 'false' ? false : v });
    } else if (key === 'freeze') {
      const n = value as number;
      onChange({ freeze: n === 0 ? null : n });
    } else {
      onChange({ [key]: value } as Partial<TrainingConfig>);
    }
  };

  return (
    <div className="space-y-2">
      <TrainingParamGroup
        titleKey="training.paramGroups.training"
        icon="fas fa-dumbbell"
        defaultOpen={true}
        params={TRAINING_PARAMS}
        values={flatValues}
        onChange={handleChange}
      />
      <TrainingParamGroup
        titleKey="training.paramGroups.optimizer"
        icon="fas fa-sliders-h"
        defaultOpen={true}
        params={OPTIMIZER_PARAMS}
        values={flatValues}
        onChange={handleChange}
      />
      <TrainingParamGroup
        titleKey="training.paramGroups.lossWeights"
        icon="fas fa-balance-scale"
        defaultOpen={false}
        params={LOSS_PARAMS}
        values={flatValues}
        onChange={handleChange}
      />
      <TrainingParamGroup
        titleKey="training.paramGroups.transferLearning"
        icon="fas fa-graduation-cap"
        defaultOpen={false}
        params={TRANSFER_PARAMS}
        values={flatValues}
        onChange={handleChange}
      />
      <TrainingParamGroup
        titleKey="training.paramGroups.advanced"
        icon="fas fa-cog"
        defaultOpen={false}
        params={ADVANCED_PARAMS}
        values={flatValues}
        onChange={handleChange}
      />
    </div>
  );
}
