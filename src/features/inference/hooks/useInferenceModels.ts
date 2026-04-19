import { useState, useCallback, useEffect, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import i18n from '@/lib/i18n';
import { inferenceService } from '../services/inferenceService';
import { useUIStore } from '../../core/store/uiStore';
import type { InferenceModelEntry, ClassMapping, ModelMetadata, ModelConfigResult } from '../types';

interface UseInferenceModelsResult {
  models: InferenceModelEntry[];
  selectedModel: InferenceModelEntry | null;
  loading: boolean;
  error: string | null;
  /** Metadata rica del último JSON de configuración cargado */
  lastConfigResult: ModelConfigResult | null;
  selectModel: (model: InferenceModelEntry | null) => void;
  uploadModel: () => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  updateMapping: (modelId: string, mapping: ClassMapping[]) => Promise<void>;
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

  const uploadModel = useCallback(async () => {
    if (!projectId) return;
    setError(null);

    try {
      // 1. Seleccionar archivo del modelo
      const file = await open({
        title: i18n.t('inference.selectModelFile'),
        filters: [
          { name: i18n.t('inference.dialogFilterModels'), extensions: ['pt', 'onnx'] },
        ],
      });

      if (!file) return;
      setLoading(true);

      const filePath = typeof file === 'string' ? file : file;
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const format = ext === 'pt' ? 'pt' : 'onnx';
      const baseName = filePath.split('/').pop()?.split('\\').pop() || 'model';

      let task = 'detect';
      let classNames: string[] = [];
      let inputSize: number | null = null;
      let outputFormat: string | null = null;
      let configResult: ModelConfigResult | null = null;
      let rawMetadata: Record<string, unknown> | null = null;

      // Intentar detectar metadata automáticamente (para .pt y .onnx)
      try {
        const meta: ModelMetadata = await inferenceService.detectModelMetadata(filePath);
        task = meta.task || task;
        classNames = meta.classNames || classNames;
        inputSize = meta.inputSize || inputSize;
        outputFormat = meta.outputFormat || outputFormat;
      } catch {
        // Fallo la detección automática, se pedirá config manual
      }

      // 2. Pedir archivo de configuración (JSON/YAML/TXT) para clases
      //    Para ONNX siempre, para PT solo si no se detectaron clases
      if (classNames.length === 0) {
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
    refreshModels,
  };
}
