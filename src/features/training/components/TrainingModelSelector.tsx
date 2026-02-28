import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { trainingService } from '../services/trainingService';
import { SIZE_LABELS, SIZE_DESCRIPTIONS } from '../utils/modelMapping';
import type { YoloModelInfo } from '../types';

interface TrainingModelSelectorProps {
  projectType: string;
  selectedVersion: string;
  selectedSize: string;
  onVersionChange: (version: string) => void;
  onSizeChange: (size: string) => void;
}

export function TrainingModelSelector({
  projectType,
  selectedVersion,
  selectedSize,
  onVersionChange,
  onSizeChange,
}: TrainingModelSelectorProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<YoloModelInfo[]>([]);

  useEffect(() => {
    trainingService.getYoloModels(projectType).then(setModels).catch(() => {});
  }, [projectType]);

  const selectedModel = models.find((m) => m.version === selectedVersion);

  return (
    <div className="space-y-4">
      {/* Version selector */}
      <div>
        <label className="text-sm font-medium mb-2 block">{t('training.model.version')}</label>
        <div className="flex flex-wrap gap-2">
          {models.map((model) => (
            <button
              key={model.version}
              onClick={() => {
                onVersionChange(model.version);
                // Reset size si no está disponible
                if (!model.sizes.includes(selectedSize)) {
                  onSizeChange(model.sizes[0]);
                }
              }}
              className={`px-3 py-1.5 rounded-md text-sm border transition-all ${
                selectedVersion === model.version
                  ? 'border-blue-500 bg-blue-500/20 text-blue-600'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {model.version.toUpperCase()}
              {model.recommended && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                  {t('training.model.recommended')}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Size selector */}
      {selectedModel && (
        <div>
          <label className="text-sm font-medium mb-2 block">{t('training.model.size')}</label>
          <div className="grid grid-cols-5 gap-2">
            {selectedModel.sizes.map((size) => (
              <button
                key={size}
                onClick={() => onSizeChange(size)}
                className={`p-2 rounded-md text-center border transition-all ${
                  selectedSize === size
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <span className="font-mono font-bold text-sm">{size.toUpperCase()}</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {SIZE_LABELS[size] || size}
                </p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t(SIZE_DESCRIPTIONS[selectedSize] || 'training.model.sizeDescMedium')}
          </p>
        </div>
      )}
    </div>
  );
}
