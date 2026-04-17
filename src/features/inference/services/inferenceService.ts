import { invoke } from '@tauri-apps/api/core';
import type {
  InferenceModelEntry,
  ClassMapping,
  PredictionEntry,
  InferenceConfig,
  ModelMetadata,
  ModelConfigResult,
} from '../types';

export const inferenceService = {
  // ─── Gestión de modelos ──────────────────────────────────────────────────

  uploadModel(
    projectId: string,
    sourcePath: string,
    name: string,
    format: string,
    task: string,
    classNames: string[],
    inputSize: number | null,
    outputFormat?: string | null,
    metadata?: Record<string, unknown> | null,
  ): Promise<InferenceModelEntry> {
    return invoke('upload_inference_model', {
      projectId,
      sourcePath,
      name,
      format,
      task,
      classNames,
      inputSize,
      outputFormat: outputFormat ?? null,
      metadata: metadata ?? null,
    });
  },

  deleteModel(projectId: string, modelId: string): Promise<void> {
    return invoke('delete_inference_model', { projectId, modelId });
  },

  listModels(projectId: string): Promise<InferenceModelEntry[]> {
    return invoke('list_inference_models', { projectId });
  },

  updateModelConfig(
    projectId: string,
    modelId: string,
    classMapping: ClassMapping[],
    inputSize: number | null,
    task: string | null,
    outputFormat?: string | null,
    classNames?: string[] | null,
  ): Promise<void> {
    return invoke('update_model_config', {
      projectId,
      modelId,
      classMapping,
      inputSize,
      task,
      outputFormat: outputFormat ?? null,
      classNames: classNames ?? null,
    });
  },

  // ─── Detección de metadatos ──────────────────────────────────────────────

  detectModelMetadata(modelPath: string): Promise<ModelMetadata> {
    return invoke('detect_model_metadata', { modelPath });
  },

  parseClassNames(filePath: string, format: string): Promise<string[]> {
    return invoke('parse_class_names', { filePath, format });
  },

  /** Parsea un JSON rico de configuración de modelo (clases, colores, task, etc.) */
  parseModelConfig(filePath: string): Promise<ModelConfigResult> {
    return invoke('parse_model_config', { filePath });
  },

  // ─── Ejecución de inferencia ─────────────────────────────────────────────

  startBatchInference(
    projectId: string,
    modelId: string,
    imageIds: string[],
    config: InferenceConfig,
  ): Promise<string> {
    return invoke('start_batch_inference', {
      projectId,
      modelId,
      imageIds,
      config,
    });
  },

  cancelInference(jobId: string): Promise<void> {
    return invoke('cancel_inference', { jobId });
  },

  runSingleInference(
    projectId: string,
    modelId: string,
    imageId: string,
    config: InferenceConfig,
  ): Promise<string> {
    return invoke('run_single_inference', {
      projectId,
      modelId,
      imageId,
      config,
    });
  },

  // ─── Gestión de predicciones ─────────────────────────────────────────────

  getPredictions(projectId: string, imageId: string): Promise<PredictionEntry[]> {
    return invoke('get_predictions', { projectId, imageId });
  },

  clearPredictions(projectId: string, imageId?: string): Promise<void> {
    return invoke('clear_predictions', { projectId, imageId: imageId ?? null });
  },

  acceptPrediction(projectId: string, imageId: string, predictionId: string): Promise<void> {
    return invoke('accept_prediction', { projectId, imageId, predictionId });
  },

  rejectPrediction(projectId: string, imageId: string, predictionId: string): Promise<void> {
    return invoke('reject_prediction', { projectId, imageId, predictionId });
  },

  convertPredictions(projectId: string, imageId: string): Promise<number> {
    return invoke('convert_predictions', { projectId, imageId });
  },
};
