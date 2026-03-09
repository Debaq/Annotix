import { useState, useCallback, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { inferenceService } from '../services/inferenceService';
import type { InferenceModelEntry, ClassMapping, ModelMetadata } from '../types';

interface UseInferenceModelsResult {
  models: InferenceModelEntry[];
  selectedModel: InferenceModelEntry | null;
  loading: boolean;
  error: string | null;
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

  const refreshModels = useCallback(async () => {
    if (!projectId) return;
    try {
      const list = await inferenceService.listModels(projectId);
      setModels(list);
      // Mantener selección si el modelo aún existe
      if (selectedModel) {
        const still = list.find((m) => m.id === selectedModel.id);
        setSelectedModel(still || null);
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
      // Seleccionar archivo del modelo
      const file = await open({
        title: 'Seleccionar modelo',
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

      // Intentar detectar metadatos
      let metadata: ModelMetadata | null = null;
      try {
        metadata = await inferenceService.detectModelMetadata(filePath);
      } catch {
        // Si falla la detección, continuamos con valores por defecto
      }

      const task = metadata?.task || 'detect';
      const classNames = metadata?.classNames || [];
      const inputSize = metadata?.inputSize || null;

      // Subir modelo
      const entry = await inferenceService.uploadModel(
        projectId,
        filePath,
        baseName,
        format,
        task,
        classNames,
        inputSize,
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
    selectModel: setSelectedModel,
    uploadModel,
    deleteModel,
    updateMapping,
    refreshModels,
  };
}
