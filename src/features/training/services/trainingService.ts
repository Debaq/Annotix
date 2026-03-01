import { invoke } from '@tauri-apps/api/core';
import type {
  TrainingConfig,
  TrainingEnvInfo,
  GpuInfo,
  TrainingPreset,
  YoloModelInfo,
  TrainingJob,
} from '../types';

export const trainingService = {
  checkPythonEnv(): Promise<TrainingEnvInfo> {
    return invoke('check_python_env');
  },

  setupPythonEnv(): Promise<TrainingEnvInfo> {
    return invoke('setup_python_env');
  },

  detectGpu(): Promise<GpuInfo> {
    return invoke('detect_gpu');
  },

  getTrainingPresets(projectType: string): Promise<TrainingPreset[]> {
    return invoke('get_training_presets', { projectType });
  },

  getYoloModels(projectType: string): Promise<YoloModelInfo[]> {
    return invoke('get_yolo_models', { projectType });
  },

  startTraining(projectId: string, config: TrainingConfig): Promise<string> {
    return invoke('start_training', { projectId, config });
  },

  cancelTraining(projectId: string, jobId: string): Promise<void> {
    return invoke('cancel_training', { projectId, jobId });
  },

  getTrainingJob(projectId: string, jobId: string): Promise<TrainingJob | null> {
    return invoke('get_training_job', { projectId, jobId });
  },

  listTrainingJobs(projectId: string): Promise<TrainingJob[]> {
    return invoke('list_training_jobs', { projectId });
  },

  deleteTrainingJob(projectId: string, jobId: string): Promise<void> {
    return invoke('delete_training_job', { projectId, jobId });
  },

  exportTrainedModel(modelPath: string, format: string): Promise<string> {
    return invoke('export_trained_model', { modelPath, format });
  },
};
