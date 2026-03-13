import { ReactNode, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { projectService } from '../../projects/services/projectService';
import { useInferenceModels } from '../hooks/useInferenceModels';
import { ModelUploader } from './ModelUploader';
import { ClassMappingEditor } from './ClassMappingEditor';
import type { ClassDefinition, Project } from '@/lib/db';

interface InferencePanelProps {
  trigger?: ReactNode;
  /** ID de la imagen seleccionada actualmente */
  currentImageId?: string | null;
  /** Proyecto actual (pasado desde Header para evitar fetch duplicado) */
  project: Project | null;
}

export function InferencePanel({ trigger, currentImageId, project }: InferencePanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const projectId = project?.id || null;

  // Estado de configuración
  const [confidence, setConfidence] = useState(0.25);
  const [iouThreshold, setIouThreshold] = useState(0.45);
  const [device, setDevice] = useState('cpu');

  // Hooks
  const {
    models,
    selectedModel,
    loading: modelLoading,
    lastConfigResult,
    selectModel,
    uploadModel,
    deleteModel,
    updateMapping,
  } = useInferenceModels(projectId);

  const projectClasses = (project?.classes || []) as Array<{
    id: number;
    name: string;
    color: string;
  }>;

  // Sincronizar clases del modelo al proyecto
  const handleSyncClasses = useCallback(async () => {
    if (!projectId || !selectedModel) return;

    // Obtener colores del JSON de metadata
    const colorPalette: Record<string, string> =
      (selectedModel.metadata as any)?.color_palette || {};

    const classNames = selectedModel.classNames;
    if (classNames.length === 0) return;

    const existingCount = projectClasses.length;
    const hasAnnotations = (project as any)?.images?.some(
      (img: any) => img.annotations && img.annotations.length > 0
    );

    // Construir mensaje de advertencia
    let warning = `Se reemplazarán las ${existingCount} clases actuales del proyecto por ${classNames.length} clases del modelo.`;
    if (hasAnnotations) {
      warning += '\n\n⚠️ ATENCIÓN: El proyecto tiene anotaciones existentes. Las anotaciones con clases que no coincidan podrían quedar huérfanas.';
    }
    warning += '\n\n¿Continuar?';

    if (!window.confirm(warning)) return;

    // Generar nuevas clases con colores del JSON
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

    // Actualizar el mapeo automáticamente (cada clase del modelo → clase del proyecto con mismo índice)
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
          <Button variant="outline" size="sm">
            <i className="fas fa-magic mr-2" />
            {t('inference.title')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[85vh] bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <i className="fas fa-magic text-purple-400" />
            {t('inference.title')}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            {t('inference.uploadHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[calc(85vh-100px)] pr-1 space-y-4 pb-4">
          {/* Sección: Modelo */}
          <ModelUploader
            model={selectedModel}
            loading={modelLoading}
            configResult={lastConfigResult}
            onUpload={uploadModel}
            onDelete={deleteModel}
          />

          {/* Botón sincronizar clases del modelo al proyecto */}
          {selectedModel && selectedModel.classNames.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              onClick={handleSyncClasses}
            >
              <i className="fas fa-sync-alt mr-2" />
              Reemplazar clases del proyecto con las del modelo ({selectedModel.classNames.length})
            </Button>
          )}

          {/* Selector de modelo activo si hay más de uno */}
          {models.length > 1 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {t('inference.modelName')}
              </h4>
              <div className="space-y-1">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectModel(m)}
                    className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                      selectedModel?.id === m.id
                        ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
                        : 'bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 text-gray-500 uppercase font-mono">{m.format}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedModel && (
            <>
              <Separator className="bg-gray-700" />

              {/* Mapeo de clases */}
              <ClassMappingEditor
                mapping={selectedModel.classMapping}
                projectClasses={projectClasses}
                onChange={(mapping) => updateMapping(selectedModel.id, mapping)}
              />

              <Separator className="bg-gray-700" />

              {/* Configuración */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {t('inference.settings')}
                </h4>

                {/* Umbral de confianza */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">
                      {t('inference.confidenceThreshold')}
                    </label>
                    <span className="text-xs font-mono text-gray-300">
                      {confidence.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[confidence]}
                    onValueChange={([v]) => setConfidence(v)}
                    min={0.01}
                    max={0.99}
                    step={0.01}
                    className="w-full"
                  />
                </div>

                {/* Umbral IoU */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">
                      {t('inference.iouThreshold')}
                    </label>
                    <span className="text-xs font-mono text-gray-300">
                      {iouThreshold.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[iouThreshold]}
                    onValueChange={([v]) => setIouThreshold(v)}
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    className="w-full"
                  />
                </div>

                {/* Dispositivo */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">{t('inference.device')}</label>
                  <select
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
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
      </DialogContent>
    </Dialog>
  );
}
