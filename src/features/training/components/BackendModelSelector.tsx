import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { BackendModelInfo, TrainingBackend } from '../types';
import { SIZE_LABELS } from '../utils/modelMapping';
import { findFamily, useModelFamilies } from '../hooks/useModelFamilies';
import { ModelFamilyInfo } from './ModelFamilyInfo';
import { ModelCatalogFilters } from './ModelCatalogFilters';
import {
  FILTROS_VACIOS,
  pasaFiltros,
  type CatalogFilters,
} from '../utils/catalogFilters';

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
  const { families: catalogo } = useModelFamilies();
  const [filtros, setFiltros] = useState<CatalogFilters>(FILTROS_VACIOS);

  // Familias presentes en este backend, con su ficha. Las fichas son la fuente de
  // los filtros: sin catálogo la lista se comporta como antes.
  const fichasPresentes = useMemo(() => {
    const vistas = [...new Set(models.map((m) => m.family))];
    return vistas
      .map((f) => findFamily(catalogo, backend, f))
      .filter((f): f is NonNullable<typeof f> => !!f);
  }, [models, catalogo, backend]);

  // For YOLO: version + size grid
  if (backend === 'yolo') {
    const fichaYolo = findFamily(catalogo, backend, 'yolo');
    return (
      <div className="space-y-4">
        {fichaYolo && <ModelFamilyInfo info={fichaYolo} />}
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
  const todasLasFamilias = [...new Set(models.map((m) => m.family))];
  const families = todasLasFamilias.filter((f) =>
    pasaFiltros(findFamily(catalogo, backend, f), filtros),
  );

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium block">{t('training.model.selectModel')}</label>

      <ModelCatalogFilters present={fichasPresentes} value={filtros} onChange={setFiltros} />

      {families.length === 0 && (
        <div className="text-xs text-muted-foreground space-y-2 py-2">
          <p>{t('training.families.filters.noneMatch')}</p>
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_VACIOS)}
            className="text-blue-500 hover:underline"
          >
            {t('training.families.filters.clear')}
          </button>
        </div>
      )}

      {families.map((family) => {
        const familyModels = models.filter((m) => m.family === family);
        const ficha = findFamily(catalogo, backend, family);
        return (
          <div key={family} className="space-y-2">
            {todasLasFamilias.length > 1 && (
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {family}
              </p>
            )}
            {ficha && <ModelFamilyInfo info={ficha} />}
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
