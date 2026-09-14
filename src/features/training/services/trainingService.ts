import { invoke } from '@tauri-apps/api/core';
import type {
  TrainingConfig,
  TrainingEnvInfo,
  GpuInfo,
  TrainingPreset,
  YoloModelInfo,
  TrainingJob,
  BackendInfo,
  TrainingRequest,
  CloudProviderConfig,
  FamilyInfo,
  SplitPolicy,
  BiomedPreset,
  ReadinessReport,
  AugmentationPlan,
  AugmentationCatalogEntry,
  AugmentationPreview,
} from '../types';

export const trainingService = {
  checkPythonEnv(): Promise<TrainingEnvInfo> {
    return invoke('check_python_env');
  },

  setupPythonEnv(pythonVersion: string): Promise<TrainingEnvInfo> {
    return invoke('setup_python_env', { pythonVersion });
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

  resumeTraining(projectId: string, jobId: string): Promise<void> {
    return invoke('resume_training', { projectId, jobId });
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

  downloadTrainedModel(srcPath: string, destPath: string): Promise<void> {
    return invoke('download_trained_model', { srcPath, destPath });
  },

  // Multi-backend API
  getAvailableBackends(projectType: string): Promise<BackendInfo[]> {
    return invoke('get_available_backends', { projectType });
  },

  getModelFamilies(): Promise<FamilyInfo[]> {
    return invoke('get_model_families');
  },

  /** Catálogo completo, sin filtrar por tipo de proyecto. */
  getAllBackends(): Promise<BackendInfo[]> {
    return invoke('get_all_backends');
  },

  /** `train.py` de un backend generado con el mismo código que entrena. */
  previewTrainScript(backend: string, task: string): Promise<string> {
    return invoke('preview_train_script', { backend, task });
  },

  /** Siempre devuelve una política: la declarada o la de por defecto. */
  getSplitPolicy(projectId: string): Promise<SplitPolicy> {
    return invoke('get_split_policy', { projectId });
  },

  /** `null` retira la política y vuelve al reparto de siempre. */
  setSplitPolicy(projectId: string, policy: SplitPolicy | null): Promise<void> {
    return invoke('set_split_policy', { projectId, policy });
  },

  /** El catálogo de transformaciones, servido desde Rust por lo mismo. */
  getAugmentationCatalog(): Promise<AugmentationCatalogEntry[]> {
    return invoke('get_augmentation_catalog');
  },

  getAugmentationPlan(projectId: string): Promise<AugmentationPlan> {
    return invoke('get_augmentation_plan', { projectId });
  },

  /** `null` retira el plan y el dataset vuelve a ser el corpus tal cual. */
  setAugmentationPlan(projectId: string, plan: AugmentationPlan | null): Promise<void> {
    return invoke('set_augmentation_plan', { projectId, plan });
  },

  /**
   * Genera una variante con el plan que se está editando.
   *
   * Corre el mismo materializador que el entrenamiento, así que lo que se ve es
   * lo que va a entrar al dataset —no una aproximación dibujada aparte, que es
   * como una vista previa acaba mintiendo—.
   */
  previewAugmentation(
    projectId: string,
    plan: AugmentationPlan,
    imageId?: string | null,
    variant?: number,
  ): Promise<AugmentationPreview> {
    return invoke('preview_augmentation', { projectId, plan, imageId: imageId ?? null, variant });
  },

  /** Presets biomédicos, servidos desde Rust para que no haya dos listas. */
  getBiomedPresets(): Promise<BiomedPreset[]> {
    return invoke('get_biomed_presets');
  },

  /** Qué nivel de evidencia saldría si se entrenara ahora. No bloquea nada. */
  getReadiness(projectId: string, testSplit: number, fliplr: number): Promise<ReadinessReport> {
    return invoke('get_training_readiness', { projectId, testSplit, fliplr });
  },

  getProjectDomain(projectId: string): Promise<string> {
    return invoke('get_project_domain', { projectId });
  },

  setProjectDomain(projectId: string, domain: 'general' | 'biomedical'): Promise<void> {
    return invoke('set_project_domain', { projectId, domain });
  },

  installBackendPackages(backend: string): Promise<void> {
    return invoke('install_backend_packages', { backend });
  },

  startTrainingV2(projectId: string, request: TrainingRequest): Promise<string> {
    return invoke('start_training_v2', { projectId, request });
  },

  generateTrainingPackage(projectId: string, request: TrainingRequest, outputPath: string): Promise<string> {
    return invoke('generate_training_package', { projectId, request, outputPath });
  },

  // Cloud provider config
  getCloudProvidersConfig(): Promise<CloudProviderConfig> {
    return invoke('get_cloud_providers_config');
  },

  saveCloudProviderConfig(provider: string, configData: Record<string, unknown>): Promise<void> {
    return invoke('save_cloud_provider_config', { provider, configData });
  },

  validateCloudCredentials(provider: string): Promise<void> {
    return invoke('validate_cloud_credentials', { provider });
  },

  downloadCloudModel(projectId: string, jobId: string, outputPath: string): Promise<string> {
    return invoke('download_cloud_model', { projectId, jobId, outputPath });
  },
};
