import { useState, useCallback, useEffect, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import i18n from '@/lib/i18n';
import { inferenceService } from '../services/inferenceService';
import { useUIStore } from '../../core/store/uiStore';
import { toast } from '@/components/hooks/use-toast';
import type { InferenceModelEntry, ClassMapping, ModelMetadata, ModelConfigResult, PreprocessConfig } from '../types';

interface UseInferenceModelsResult {
  models: InferenceModelEntry[];
  selectedModel: InferenceModelEntry | null;
  loading: boolean;
  error: string | null;
  /** Metadata rica del último JSON de configuración cargado */
  lastConfigResult: ModelConfigResult | null;
  selectModel: (model: InferenceModelEntry | null) => void;
  uploadModel: (prefilledPath?: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  updateMapping: (modelId: string, mapping: ClassMapping[]) => Promise<void>;
  updatePreprocess: (modelId: string, preprocess: PreprocessConfig | null) => Promise<void>;
  refreshModels: () => Promise<void>;
}

export function useInferenceModels(projectId: string | null): UseInferenceModelsResult {
  const [models, setModels] = useState<InferenceModelEntry[]>([]);
  const selectedModelId = useUIStore((s) => s.selectedInferenceModelId);
  const setSelectedModelId = useUIStore((s) => s.setSelectedInferenceModelId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastConfigResult, setLastConfigResult] = useState<ModelConfigResult | null>(null);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );

  const refreshModels = useCallback(async () => {
    if (!projectId) return;
    try {
      const list = await inferenceService.listModels(projectId);
      setModels(list);
      const currentId = useUIStore.getState().selectedInferenceModelId;
      if (currentId) {
        const still = list.find((m) => m.id === currentId);
        if (!still) setSelectedModelId(list[0]?.id ?? null);
      } else if (list.length > 0) {
        setSelectedModelId(list[0].id);
      }
    } catch (err) {
      setError(String(err));
    }
  }, [projectId, setSelectedModelId]);

  useEffect(() => {
    refreshModels();
  }, [projectId]);

  // Si selectedId cambió globalmente (upload en otra instancia) y no está
  // en la lista local, refrescar.
  useEffect(() => {
    if (!projectId || !selectedModelId) return;
    if (!models.find((m) => m.id === selectedModelId)) {
      refreshModels();
    }
  }, [selectedModelId, models, projectId, refreshModels]);

  const uploadModel = useCallback(async (prefilledPath?: string) => {
    if (!projectId) return;
    setError(null);

    try {
      let filePath: string;
      if (prefilledPath) {
        filePath = prefilledPath;
      } else {
        const file = await open({
          title: i18n.t('inference.selectModelFile'),
          filters: [
            { name: i18n.t('inference.dialogFilterModels'), extensions: ['pt', 'onnx', 'zip'] },
          ],
        });
        if (!file) return;
        filePath = typeof file === 'string' ? file : file;
      }
      setLoading(true);

      let ext = filePath.split('.').pop()?.toLowerCase() || '';

      if (ext === 'zip') {
        try {
          const extracted = await inferenceService.extractModelArchive(filePath);
          filePath = extracted.path;
          ext = extracted.format;
        } catch (err) {
          setError(String(err));
          return;
        }
      }

      if (ext !== 'pt' && ext !== 'onnx') {
        setError(i18n.t('inference.error.invalidModelFile', { ext }));
        return;
      }
      const format = ext === 'pt' ? 'pt' : 'onnx';
      const baseName = filePath.split('/').pop()?.split('\\').pop() || 'model';

      let task = 'detect';
      let classNames: string[] = [];
      let inputSize: number | null = null;
      let outputFormat: string | null = null;
      let configResult: ModelConfigResult | null = null;
      let rawMetadata: Record<string, unknown> | null = null;

      // Intentar detectar metadata automáticamente (para .pt y .onnx)
      let detectFailed = false;
      try {
        const meta: ModelMetadata = await inferenceService.detectModelMetadata(filePath);
        task = meta.task || task;
        classNames = meta.classNames || classNames;
        inputSize = meta.inputSize || inputSize;
        outputFormat = meta.outputFormat || outputFormat;
        if (meta.error) detectFailed = true;
      } catch {
        detectFailed = true;
      }

      // .pt: clases embebidas en el archivo. No pedir JSON nunca: si la
      // detección falló (Python/ultralytics no listo), guardar igual y avisar.
      // .onnx: pedir JSON solo si no se detectaron clases.
      if (format === 'onnx' && classNames.length === 0) {
        const configFile = await open({
          title: i18n.t('inference.selectConfigFile'),
          filters: [
            { name: i18n.t('inference.dialogFilterConfig'), extensions: ['json', 'yaml', 'yml', 'txt'] },
          ],
        });

        if (configFile) {
          const configPath = typeof configFile === 'string' ? configFile : configFile;
          const configExt = configPath.split('.').pop()?.toLowerCase() || '';

          if (configExt === 'json') {
            // Parsear JSON rico con toda la metadata
            try {
              configResult = await inferenceService.parseModelConfig(configPath);
              classNames = configResult.classNames;
              task = configResult.task || task;
              inputSize = configResult.inputSize || inputSize;
              outputFormat = configResult.outputFormat || outputFormat;
              rawMetadata = configResult.rawMetadata;
              setLastConfigResult(configResult);
            } catch (err) {
              setError(i18n.t('inference.parseJsonError', { error: String(err) }));
            }
          } else {
            // Parsear TXT o YAML simple
            try {
              classNames = await inferenceService.parseClassNames(configPath, configExt);
            } catch (err) {
              setError(i18n.t('inference.parseClassesError', { error: String(err) }));
            }
          }
        }
      }

      // 3. Subir modelo con metadata rica si disponible
      const entry = await inferenceService.uploadModel(
        projectId,
        filePath,
        baseName,
        format,
        task,
        classNames,
        inputSize,
        outputFormat,
        rawMetadata,
      );

      setSelectedModelId(entry.id);
      await refreshModels();

      if (format === 'pt' && (detectFailed || classNames.length === 0)) {
        toast({
          title: i18n.t('inference.ptDetectFailedTitle'),
          description: i18n.t('inference.ptDetectFailedDesc'),
          duration: 8000,
        });
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, refreshModels]);

  const deleteModel = useCallback(async (modelId: string) => {
    if (!projectId) return;
    try {
      await inferenceService.deleteModel(projectId, modelId);
      if (useUIStore.getState().selectedInferenceModelId === modelId) {
        setSelectedModelId(null);
      }
      await refreshModels();
    } catch (err) {
      setError(String(err));
    }
  }, [projectId, setSelectedModelId, refreshModels]);

  const updateMapping = useCallback(async (modelId: string, mapping: ClassMapping[]) => {
    if (!projectId) return;
    try {
      const classNames = mapping.map((m) => m.modelClassName);
      await inferenceService.updateModelConfig(projectId, modelId, mapping, null, null, null, classNames);
      await refreshModels();
    } catch (err) {
      setError(String(err));
    }
  }, [projectId, refreshModels]);

  const updatePreprocess = useCallback(async (modelId: string, preprocess: PreprocessConfig | null) => {
    if (!projectId) return;
    try {
      const model = models.find((m) => m.id === modelId);
      if (!model) return;
      await inferenceService.updateModelConfig(
        projectId, modelId, model.classMapping, null, null, null, null,
        { preprocess },
      );
      await refreshModels();
    } catch (err) {
      setError(String(err));
    }
  }, [projectId, models, refreshModels]);

  return {
    models,
    selectedModel,
    loading,
    error,
    lastConfigResult,
    selectModel: (model) => setSelectedModelId(model?.id ?? null),
    uploadModel,
    deleteModel,
    updateMapping,
    updatePreprocess,
    refreshModels,
  };
}
