import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import type { AugmentationConfig } from '../types';

interface TrainingAugmentationProps {
  augmentation: AugmentationConfig;
  onChange: (partial: Partial<AugmentationConfig>) => void;
}

const SLIDERS: { key: keyof AugmentationConfig; min: number; max: number; step: number }[] = [
  { key: 'mosaic', min: 0, max: 1, step: 0.1 },
  { key: 'mixup', min: 0, max: 1, step: 0.1 },
  { key: 'hsv_h', min: 0, max: 0.1, step: 0.005 },
  { key: 'hsv_s', min: 0, max: 1, step: 0.1 },
  { key: 'hsv_v', min: 0, max: 1, step: 0.1 },
  { key: 'flipud', min: 0, max: 1, step: 0.1 },
  { key: 'fliplr', min: 0, max: 1, step: 0.1 },
  { key: 'degrees', min: 0, max: 45, step: 1 },
  { key: 'scale', min: 0, max: 1, step: 0.1 },
  { key: 'shear', min: 0, max: 10, step: 0.5 },
  { key: 'perspective', min: 0, max: 0.01, step: 0.0001 },
  { key: 'copy_paste', min: 0, max: 1, step: 0.1 },
  { key: 'erasing', min: 0, max: 1, step: 0.1 },
];

export function TrainingAugmentation({ augmentation, onChange }: TrainingAugmentationProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{t('training.config.augmentation')}</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {SLIDERS.map(({ key, min, max, step }) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between">
              <Label className="text-xs">{t(`training.augmentation.${key}`)}</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {augmentation[key].toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0)}
              </span>
            </div>
            <Slider
              min={min}
              max={max}
              step={step}
              value={[augmentation[key]]}
              onValueChange={([v]) => onChange({ [key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
