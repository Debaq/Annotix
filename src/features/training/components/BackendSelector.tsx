import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { trainingService } from '../services/trainingService';
import type { BackendInfo, PythonEnvStatus, TrainingBackend } from '../types';

interface BackendSelectorProps {
  projectType: string;
  envStatus: PythonEnvStatus | null;
  onSelect: (backend: TrainingBackend) => void;
}

const BACKEND_ICONS: Record<string, string> = {
  yolo: 'fas fa-bolt',
  rt_detr: 'fas fa-atom',
  rf_detr: 'fas fa-bullseye',
  mmdetection: 'fas fa-cubes',
  smp: 'fas fa-layer-group',
  hf_segmentation: 'fas fa-brain',
  mmsegmentation: 'fas fa-puzzle-piece',
};

const BACKEND_COLORS: Record<string, string> = {
  yolo: 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10',
  rt_detr: 'border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10',
  rf_detr: 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10',
  mmdetection: 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10',
  smp: 'border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10',
  hf_segmentation: 'border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10',
  mmsegmentation: 'border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10',
};

const BACKEND_SELECTED_COLORS: Record<string, string> = {
  yolo: 'border-blue-500 bg-blue-500/20',
  rt_detr: 'border-purple-500 bg-purple-500/20',
  rf_detr: 'border-green-500 bg-green-500/20',
  mmdetection: 'border-orange-500 bg-orange-500/20',
  smp: 'border-teal-500 bg-teal-500/20',
  hf_segmentation: 'border-yellow-500 bg-yellow-500/20',
  mmsegmentation: 'border-rose-500 bg-rose-500/20',
};

export function BackendSelector({ projectType, envStatus, onSelect }: BackendSelectorProps) {
  const { t } = useTranslation();
  const [backends, setBackends] = useState<BackendInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    trainingService.getAvailableBackends(projectType).then(setBackends).catch(() => {});
  }, [projectType]);

  const isInstalled = (backend: BackendInfo) => {
    const id = backend.id;
    if (id === 'yolo' || id === 'rt_detr') {
      return envStatus?.ultralyticsVersion != null;
    }
    if (id === 'rf_detr') {
      return envStatus?.rfdetrVersion != null;
    }
    if (id === 'mmdetection') {
      return envStatus?.mmdetVersion != null;
    }
    if (id === 'smp') {
      return envStatus?.smpVersion != null;
    }
    if (id === 'hf_segmentation') {
      return envStatus?.hfTransformersVersion != null;
    }
    if (id === 'mmsegmentation') {
      return envStatus?.mmsegVersion != null;
    }
    return false;
  };

  const handleSelect = (backend: BackendInfo) => {
    setSelected(backend.id);
    onSelect(backend.id as TrainingBackend);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">{t('training.backend.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('training.backend.description')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {backends.map((backend) => {
          const installed = isInstalled(backend);
          const isSelected = selected === backend.id;
          const icon = BACKEND_ICONS[backend.id] || 'fas fa-cog';
          const colorClass = isSelected
            ? BACKEND_SELECTED_COLORS[backend.id] || ''
            : BACKEND_COLORS[backend.id] || '';

          return (
            <button
              key={backend.id}
              onClick={() => handleSelect(backend)}
              className={`relative p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${colorClass}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <i className={`${icon} text-lg`} />
                  <span className="font-semibold text-sm">{backend.name}</span>
                </div>
                {installed ? (
                  <Badge variant="secondary" className="text-[10px] bg-green-500/20 text-green-600">
                    <i className="fas fa-check mr-1" />
                    {t('training.backend.installed')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {t('training.backend.notInstalled')}
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground mb-2">{backend.description}</p>

              <div className="flex flex-wrap gap-1">
                {backend.supportedTasks.map((task) => (
                  <Badge key={task} variant="outline" className="text-[9px] px-1.5 py-0">
                    {task}
                  </Badge>
                ))}
              </div>

              <div className="text-[10px] text-muted-foreground mt-2">
                {backend.models.length} {t('training.backend.modelsAvailable')}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
