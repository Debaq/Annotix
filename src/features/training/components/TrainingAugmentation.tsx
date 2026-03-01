import { useTranslation } from 'react-i18next';
import { TrainingParamGroup, type ParamDefinition } from './TrainingParamGroup';
import type { AugmentationConfig } from '../types';

interface TrainingAugmentationProps {
  augmentation: AugmentationConfig;
  closeMosaic: number;
  onChange: (partial: Partial<AugmentationConfig>) => void;
  onCloseMosaicChange: (value: number) => void;
}

const AUG_PARAMS: ParamDefinition[] = [
  { key: 'mosaic', type: 'slider', min: 0, max: 1, step: 0.1 },
  { key: 'close_mosaic', type: 'number', min: 0, max: 50 },
  { key: 'mixup', type: 'slider', min: 0, max: 1, step: 0.05 },
  { key: 'translate', type: 'slider', min: 0, max: 0.9, step: 0.05 },
  { key: 'scale', type: 'slider', min: 0, max: 1, step: 0.1 },
  { key: 'fliplr', type: 'slider', min: 0, max: 1, step: 0.1 },
  { key: 'flipud', type: 'slider', min: 0, max: 1, step: 0.1 },
  { key: 'degrees', type: 'number', min: 0, max: 180, step: 1 },
  { key: 'shear', type: 'number', min: 0, max: 10, step: 0.5 },
  { key: 'perspective', type: 'slider', min: 0, max: 0.001, step: 0.0001 },
  { key: 'hsv_h', type: 'slider', min: 0, max: 0.1, step: 0.005 },
  { key: 'hsv_s', type: 'slider', min: 0, max: 1, step: 0.1 },
  { key: 'hsv_v', type: 'slider', min: 0, max: 1, step: 0.1 },
  { key: 'copy_paste', type: 'slider', min: 0, max: 1, step: 0.1 },
  { key: 'erasing', type: 'slider', min: 0, max: 1, step: 0.05 },
];

export function TrainingAugmentation({
  augmentation,
  closeMosaic,
  onChange,
  onCloseMosaicChange,
}: TrainingAugmentationProps) {
  const { t: _t } = useTranslation();

  const values: Record<string, unknown> = {
    ...augmentation,
    close_mosaic: closeMosaic,
  };

  const handleChange = (key: string, value: unknown) => {
    if (key === 'close_mosaic') {
      onCloseMosaicChange(value as number);
    } else {
      onChange({ [key]: value } as Partial<AugmentationConfig>);
    }
  };

  return (
    <TrainingParamGroup
      titleKey="training.paramGroups.augmentation"
      icon="fas fa-magic"
      defaultOpen={false}
      params={AUG_PARAMS}
      values={values}
      onChange={handleChange}
    />
  );
}
