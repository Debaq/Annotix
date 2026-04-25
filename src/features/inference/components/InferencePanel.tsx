import { ReactNode, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { projectService } from '../../projects/services/projectService';
import { useInferenceModels } from '../hooks/useInferenceModels';
import { ModelUploader } from './ModelUploader';
import { ClassMappingEditor } from './ClassMappingEditor';
import { PreprocessEditor } from './PreprocessEditor';
import { useTauriPathDrop } from '@/hooks/useTauriPathDrop';
import type { ClassDefinition, Project } from '@/lib/db';
import { DEFAULT_PREPROCESS, type PreprocessConfig } from '../types';

interface InferencePanelProps {
  trigger?: ReactNode;
  currentImageId?: string | null;
  project: Project | null;
}

export function InferencePanel({ trigger, project }: InferencePanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const projectId = project?.id || null;

  const [confidence, setConfidence] = useState(0.25);
  const [iouThreshold, setIouThreshold] = useState(0.45);
  const [device, setDevice] = useState('cpu');

  const {
    models,
    selectedModel,
    loading: modelLoading,
    lastConfigResult,
    selectModel,
    uploadModel,
    deleteModel,
    updateMapping,
    updatePreprocess,
  } = useInferenceModels(projectId);

  const { isDragging: isDraggingModel } = useTauriPathDrop({
    active: open && !selectedModel,
    extensions: ['pt', 'onnx', 'zip'],
    onDrop: (paths) => uploadModel(paths[0]),
  });

  const currentPreprocess: PreprocessConfig =
    ((selectedModel?.metadata as { preprocess?: PreprocessConfig } | null)?.preprocess) ??
    DEFAULT_PREPROCESS;

  const projectClasses = (project?.classes || []) as Array<{
    id: number;
    name: string;
    color: string;
  }>;

  const handleSyncClasses = useCallback(async () => {
    if (!projectId || !selectedModel) return;

    const colorPalette: Record<string, string> =
      (selectedModel.metadata as any)?.color_palette || {};
    const classNames = selectedModel.classNames;
    if (classNames.length === 0) return;

    const existingCount = projectClasses.length;
    const hasAnnotations = (project as any)?.images?.some(
      (img: any) => img.annotations && img.annotations.length > 0
    );

    let warning = t('inference.replaceClassesConfirm', { existing: existingCount, count: classNames.length });
    if (hasAnnotations) {
      warning += '\n\n' + t('inference.replaceClassesAnnotationWarn');
    }
    warning += '\n\n' + t('inference.replaceClassesAsk');

    if (!window.confirm(warning)) return;

    const defaultColors = [
      '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
      '#ec4899', '#06b6d4', '#f97316', '#a855f7', '#14b8a6',
      '#e11d48', '#84cc16',
    ];

    const newClasses: ClassDefinition[] = classNames.map((name, index) => ({
      id: index,
      name,
      color: colorPalette[name] || defaultColors[index % defaultColors.length],
    }));

    await projectService.update(projectId, { classes: newClasses });

    const newMapping = classNames.map((name, index) => ({
      modelClassId: index,
      modelClassName: name,
      projectClassId: String(index),
    }));
    await updateMapping(selectedModel.id, newMapping);
  }, [projectId, selectedModel, projectClasses, project, updateMapping]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="annotix-btn annotix-btn-outline">
            <i className="fas fa-brain mr-2" />
            {t('inference.title')}
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="annotix-dialog max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <i className="fas fa-brain" style={{ color: '#7c3aed' }} />
            {t('inference.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[calc(85vh-120px)] space-y-4 pb-2">
          {/* Info de fuente de imágenes */}
          <div
            className="text-xs p-2 rounded"
            style={{ background: 'var(--annotix-gray-light)' }}
          >
            <i className="fas fa-info-circle mr-2" />
            <strong>{t('inference.imageSource')}:</strong>{' '}
            {project?.imageFormat === 'webp' ? 'WebP' : 'JPG/PNG'}
            <span className="ml-1 opacity-70">
              ({t('inference.imageSourceNote')})
            </span>
          </div>

          {/* Modelo */}
          <ModelUploader
            model={selectedModel}
            loading={modelLoading}
            configResult={lastConfigResult}
            onUpload={() => uploadModel()}
            onDelete={deleteModel}
            isDragging={isDraggingModel}
          />

          {/* Sync clases */}
          {selectedModel && selectedModel.classNames.length > 0 && (
            <button
              className="annotix-btn w-full"
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#d97706',
                fontSize: '0.75rem',
              }}
              onClick={handleSyncClasses}
            >
              <i className="fas fa-sync-alt mr-2" />
              {t('inference.replaceClassesButton', { count: selectedModel.classNames.length })}
            </button>
          )}

          {/* Selector de modelo */}
          {models.length > 1 && (
            <div className="space-y-1">
              <label className="annotix-label">{t('inference.modelName')}</label>
              <div className="space-y-1">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectModel(m)}
                    className="w-full text-left px-3 py-2 rounded text-xs transition-colors"
                    style={{
                      background: selectedModel?.id === m.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--annotix-gray-light)',
                      border: selectedModel?.id === m.id ? '1px solid rgba(124, 58, 237, 0.4)' : '1px solid var(--annotix-border)',
                      color: selectedModel?.id === m.id ? '#7c3aed' : 'var(--annotix-dark)',
                    }}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 opacity-50 uppercase font-mono">{m.format}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedModel && (
            <>
              <Separator style={{ background: 'var(--annotix-border)' }} />

              {/* Mapeo de clases */}
              <ClassMappingEditor
                mapping={selectedModel.classMapping}
                projectClasses={projectClasses}
                onChange={(mapping) => updateMapping(selectedModel.id, mapping)}
              />

              <Separator style={{ background: 'var(--annotix-border)' }} />

              {/* Preprocesamiento */}
              <PreprocessEditor
                value={currentPreprocess}
                modelFormat={selectedModel.format}
                onChange={(pre) => updatePreprocess(selectedModel.id, pre)}
              />

              <Separator style={{ background: 'var(--annotix-border)' }} />

              {/* Configuración */}
              <div className="space-y-3">
                <label className="annotix-label">{t('inference.settings')}</label>

                {/* Confianza */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--annotix-gray)' }}>
                      {t('inference.confidenceThreshold')}
                    </span>
                    <span className="text-xs font-mono font-semibold" style={{ color: 'var(--annotix-dark)' }}>
                      {confidence.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={99}
                    value={Math.round(confidence * 100)}
                    onChange={(e) => setConfidence(Number(e.target.value) / 100)}
                    className="annotix-range w-full"
                  />
                </div>

                {/* IoU */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--annotix-gray)' }}>
                      {t('inference.iouThreshold')}
                    </span>
                    <span className="text-xs font-mono font-semibold" style={{ color: 'var(--annotix-dark)' }}>
                      {iouThreshold.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={95}
                    step={5}
                    value={Math.round(iouThreshold * 100)}
                    onChange={(e) => setIouThreshold(Number(e.target.value) / 100)}
                    className="annotix-range w-full"
                  />
                </div>

                {/* Dispositivo */}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--annotix-gray)' }}>
                    {t('inference.device')}
                  </span>
                  <select
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    className="annotix-select"
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                  >
                    <option value="cpu">CPU</option>
                    <option value="0">GPU 0</option>
                    <option value="1">GPU 1</option>
                    <option value="mps">MPS (Apple)</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <button className="annotix-btn annotix-btn-primary">
              <i className="fas fa-check mr-1" />
              {t('common.accept')}
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
