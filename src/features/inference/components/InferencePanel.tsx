import { ReactNode, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useInferenceModels } from '../hooks/useInferenceModels';
import { useInferenceRunner } from '../hooks/useInferenceRunner';
import { usePredictions } from '../hooks/usePredictions';
import { ModelUploader } from './ModelUploader';
import { ClassMappingEditor } from './ClassMappingEditor';
import { PredictionsList } from './PredictionsList';
import { BatchInferenceProgress } from './BatchInferenceProgress';
import type { InferenceConfig, InferenceResultEvent } from '../types';

interface InferencePanelProps {
  trigger?: ReactNode;
  /** ID de la imagen seleccionada actualmente */
  currentImageId?: string | null;
}

export function InferencePanel({ trigger, currentImageId }: InferencePanelProps) {
  const { t } = useTranslation('inference');
  const { project } = useCurrentProject();
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
    selectModel,
    uploadModel,
    deleteModel,
    updateMapping,
  } = useInferenceModels(projectId);

  const {
    predictions,
    accept,
    reject,
    acceptAll,
    rejectAll,
    convertAccepted,
    clearAll,
    refresh: refreshPredictions,
  } = usePredictions(projectId, currentImageId || null);

  const handleResult = useCallback(
    (_event: InferenceResultEvent) => {
      // Refrescar predicciones cuando llega un resultado para la imagen actual
      refreshPredictions();
    },
    [refreshPredictions],
  );

  const {
    running,
    progress,
    lastError,
    startSingle,
    startBatch,
    cancel,
  } = useInferenceRunner(handleResult, undefined, undefined);

  // Construir config de inferencia
  const buildConfig = useCallback((): InferenceConfig => ({
    confidenceThreshold: confidence,
    inputSize: selectedModel?.inputSize || null,
    device,
    iouThreshold,
  }), [confidence, iouThreshold, device, selectedModel]);

  // Ejecutar en imagen actual
  const handleRunCurrent = useCallback(async () => {
    if (!projectId || !selectedModel || !currentImageId) return;
    await startSingle(projectId, selectedModel.id, currentImageId, buildConfig());
  }, [projectId, selectedModel, currentImageId, startSingle, buildConfig]);

  // Ejecutar en todas las imágenes
  const handleRunAll = useCallback(async () => {
    if (!projectId || !selectedModel || !project) return;
    // Obtener IDs de todas las imágenes (project contiene images como array de objetos)
    const imageIds = (project as any).images?.map((img: any) => img.id) || [];
    if (imageIds.length === 0) return;
    await startBatch(projectId, selectedModel.id, imageIds, buildConfig());
  }, [projectId, selectedModel, project, startBatch, buildConfig]);

  // Convertir predicciones aceptadas
  const handleConvert = useCallback(async () => {
    const count = await convertAccepted();
    if (count > 0) {
      // Emitir evento para refrescar la vista de anotaciones
      window.dispatchEvent(new CustomEvent('annotix:annotations-changed'));
    }
  }, [convertAccepted]);

  const projectClasses = (project?.classes || []) as Array<{
    id: number;
    name: string;
    color: string;
  }>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <i className="fas fa-magic mr-2" />
            {t('title')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <i className="fas fa-magic text-purple-400" />
            {t('title')}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            {t('uploadHint')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)] pr-2">
          <div className="space-y-4 pb-4">
            {/* Sección: Modelo */}
            <ModelUploader
              model={selectedModel}
              loading={modelLoading}
              onUpload={uploadModel}
              onDelete={deleteModel}
            />

            {/* Lista de modelos disponibles si hay más de uno */}
            {models.length > 1 && (
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {t('modelName')}
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
                    {t('settings')}
                  </h4>

                  {/* Umbral de confianza */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-400">
                        {t('confidenceThreshold')}
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
                        {t('iouThreshold')}
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
                    <label className="text-xs text-gray-400">{t('device')}</label>
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

                <Separator className="bg-gray-700" />

                {/* Botones de ejecución */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                      disabled={running || !currentImageId}
                      onClick={handleRunCurrent}
                    >
                      <i className="fas fa-play mr-2" />
                      {t('runOnCurrent')}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      disabled={running}
                      onClick={handleRunAll}
                    >
                      <i className="fas fa-layer-group mr-1" />
                      {t('runOnAll')}
                    </Button>
                  </div>
                </div>

                {/* Progreso de batch */}
                <BatchInferenceProgress
                  progress={progress}
                  running={running}
                  onCancel={cancel}
                />

                {/* Error */}
                {lastError && (
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    <i className="fas fa-exclamation-triangle mr-1" />
                    {lastError}
                  </div>
                )}

                <Separator className="bg-gray-700" />

                {/* Predicciones de la imagen actual */}
                <div>
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    {t('predictions')} {currentImageId ? '' : ''}
                  </h4>
                  <PredictionsList
                    predictions={predictions}
                    onAccept={accept}
                    onReject={reject}
                    onAcceptAll={acceptAll}
                    onRejectAll={rejectAll}
                    onConvert={handleConvert}
                    onClear={clearAll}
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
