import { invoke } from '@tauri-apps/api/core';
import { studyLog } from '../../study/studyLog';
import { emitAnnotCommit, emitAnnotDelete } from '../../study/studySession';
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
      request: {
        projectId,
        sourcePath,
        name,
        format,
        task,
        classNames,
        inputSize,
        outputFormat: outputFormat ?? null,
        metadata: metadata ?? null,
      },
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
    metadataPatch?: Record<string, unknown> | null,
  ): Promise<void> {
    return invoke('update_model_config', {
      request: {
        projectId,
        modelId,
        classMapping,
        inputSize,
        task,
        outputFormat: outputFormat ?? null,
        classNames: classNames ?? null,
        metadataPatch: metadataPatch ?? null,
      },
    });
  },

  // ─── Detección de metadatos ──────────────────────────────────────────────

  detectModelMetadata(modelPath: string): Promise<ModelMetadata> {
    return invoke('detect_model_metadata', { modelPath });
  },

  extractModelArchive(archivePath: string): Promise<{ path: string; originalName: string; format: string }> {
    return invoke('extract_model_archive', { archivePath });
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

  async runSingleInference(
    projectId: string,
    modelId: string,
    imageId: string,
    config: InferenceConfig,
  ): Promise<string> {
    const t0 = performance.now();
    const jobId = await invoke<string>('run_single_inference', {
      projectId,
      modelId,
      imageId,
      config,
    });
    // La propuesta asistida se mide de extremo a extremo: lo que el usuario
    // espera, no solo lo que tarda el motor.
    const proposals = await invoke<PredictionEntry[]>('get_predictions', { projectId, imageId })
      .catch(() => [] as PredictionEntry[]);
    studyLog.emit('assist.propose', {
      n_proposals: proposals.length,
      latency_ms: Math.round(performance.now() - t0),
    });
    return jobId;
  },

  // ─── Gestión de predicciones ─────────────────────────────────────────────

  getPredictions(projectId: string, imageId: string): Promise<PredictionEntry[]> {
    return invoke('get_predictions', { projectId, imageId });
  },

  clearPredictions(projectId: string, imageId?: string): Promise<void> {
    return invoke('clear_predictions', { projectId, imageId: imageId ?? null });
  },

  async acceptPrediction(projectId: string, imageId: string, predictionId: string): Promise<void> {
    await invoke('accept_prediction', { projectId, imageId, predictionId });
    emitAnnotCommit('assist', 'assisted_accepted');
  },

  async rejectPrediction(projectId: string, imageId: string, predictionId: string): Promise<void> {
    await invoke('reject_prediction', { projectId, imageId, predictionId });
    emitAnnotDelete('assist', 'assisted_rejected');
  },

  async convertPredictions(projectId: string, imageId: string): Promise<number> {
    const n = await invoke<number>('convert_predictions', { projectId, imageId });
    for (let i = 0; i < n; i += 1) {
      emitAnnotCommit('assist', 'assisted_accepted');
    }
    return n;
  },
};
