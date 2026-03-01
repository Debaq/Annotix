import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { BackendModelInfo, TrainingBackend } from '../types';
import { SIZE_LABELS } from '../utils/modelMapping';

interface BackendModelSelectorProps {
  backend: TrainingBackend;
  models: BackendModelInfo[];
  selectedModelId: string;
  selectedSize: string | null;
  onModelChange: (modelId: string) => void;
  onSizeChange?: (size: string) => void;
}

export function BackendModelSelector({
  backend,
  models,
  selectedModelId,
  selectedSize,
  onModelChange,
  onSizeChange,
}: BackendModelSelectorProps) {
  const { t } = useTranslation();
  const selectedModel = models.find((m) => m.id === selectedModelId);

  // For YOLO: version + size grid
  if (backend === 'yolo') {
    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">{t('training.model.version')}</label>
          <div className="flex flex-wrap gap-2">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onModelChange(model.id);
                  if (model.sizes && selectedSize && !model.sizes.includes(selectedSize)) {
                    onSizeChange?.(model.sizes[0]);
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-sm border transition-all ${
                  selectedModelId === model.id
                    ? 'border-blue-500 bg-blue-500/20 text-blue-600'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {model.name}
                {model.recommended && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                    {t('training.model.recommended')}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {selectedModel?.sizes && (
          <div>
            <label className="text-sm font-medium mb-2 block">{t('training.model.size')}</label>
            <div className="grid grid-cols-5 gap-2">
              {selectedModel.sizes.map((size) => (
                <button
                  key={size}
                  onClick={() => onSizeChange?.(size)}
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
          </div>
        )}
      </div>
    );
  }

  // For other backends: grouped model list
  const families = [...new Set(models.map((m) => m.family))];

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium block">{t('training.model.selectModel')}</label>

      {families.map((family) => {
        const familyModels = models.filter((m) => m.family === family);
        return (
          <div key={family} className="space-y-2">
            {families.length > 1 && (
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {family}
              </p>
            )}
            <div className="grid gap-2">
              {familyModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => onModelChange(model.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedModelId === model.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{model.name}</span>
                      {model.recommended && (
                        <Badge variant="secondary" className="text-[10px] px-1">
                          {t('training.model.recommended')}
                        </Badge>
                      )}
                    </div>
                    {model.paramsCount && (
                      <span className="text-xs text-muted-foreground font-mono">{model.paramsCount}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
