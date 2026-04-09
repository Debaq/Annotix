import { useState, useCallback, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { inferenceService } from '../services/inferenceService';
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
  const [selectedModel, setSelectedModel] = useState<InferenceModelEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastConfigResult, setLastConfigResult] = useState<ModelConfigResult | null>(null);

  const refreshModels = useCallback(async () => {
    if (!projectId) return;
    try {
      const list = await inferenceService.listModels(projectId);
      setModels(list);
      if (selectedModel) {
        const still = list.find((m) => m.id === selectedModel.id);
        setSelectedModel(still || list[0] || null);
      } else if (list.length > 0) {
        // Auto-seleccionar el primer modelo si no hay selección
        setSelectedModel(list[0]);
      }
    } catch (err) {
      setError(String(err));
    }
  }, [projectId, selectedModel]);

  useEffect(() => {
    refreshModels();
  }, [projectId]);

  const uploadModel = useCallback(async () => {
    if (!projectId) return;
    setError(null);

    try {
      // 1. Seleccionar archivo del modelo
      const file = await open({
        title: 'Seleccionar modelo (.onnx o .pt)',
        filters: [
          { name: 'Modelos', extensions: ['pt', 'onnx'] },
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
          title: 'Seleccionar archivo de configuración de clases',
          filters: [
            { name: 'Configuración', extensions: ['json', 'yaml', 'yml', 'txt'] },
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
              setError(`Error parseando JSON: ${err}`);
            }
          } else {
            // Parsear TXT o YAML simple
            try {
              classNames = await inferenceService.parseClassNames(configPath, configExt);
            } catch (err) {
              setError(`Error parseando archivo de clases: ${err}`);
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

      setSelectedModel(entry);
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
      if (selectedModel?.id === modelId) {
        setSelectedModel(null);
      }
      await refreshModels();
    } catch (err) {
      setError(String(err));
    }
  }, [projectId, selectedModel, refreshModels]);

  const updateMapping = useCallback(async (modelId: string, mapping: ClassMapping[]) => {
    if (!projectId) return;
    try {
      await inferenceService.updateModelConfig(projectId, modelId, mapping, null, null);
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
    selectModel: setSelectedModel,
    uploadModel,
    deleteModel,
    updateMapping,
    refreshModels,
  };
}
