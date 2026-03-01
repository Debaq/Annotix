import { ReactNode, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useTrainingConfig } from '../hooks/useTrainingConfig';
import { useTrainingProgress } from '../hooks/useTrainingProgress';
import { useTrainingRequest } from '../hooks/useTrainingRequest';
import { trainingService } from '../services/trainingService';
import { PythonEnvSetup } from './PythonEnvSetup';
import { BackendSelector } from './BackendSelector';
import { BackendModelSelector } from './BackendModelSelector';
import { BackendConfigPanel } from './BackendConfigPanel';
import { ExecutionModeSelector } from './ExecutionModeSelector';
import { TrainingPresets } from './TrainingPresets';
import { GpuIndicator } from './GpuIndicator';
import { TrainingMonitor } from './TrainingMonitor';
import { TrainingResult } from './TrainingResult';
import { TrainingJobList } from './TrainingJobList';
import type { TrainingPhase, PythonEnvStatus, ScenarioPresetId, TrainingJob, TrainingBackend } from '../types';
import type { GpuInfo } from '../types';

interface TrainingPanelProps {
  trigger?: ReactNode;
}

export function TrainingPanel({ trigger }: TrainingPanelProps) {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const [open, setOpen] = useState(false);
  // Start directly on backend selection — no Python check upfront
  const [phase, setPhase] = useState<TrainingPhase>('backend');
  const [envStatus, setEnvStatus] = useState<PythonEnvStatus | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<ScenarioPresetId | null>('small_objects');
  const [fineTuneSource, setFineTuneSource] = useState<string | null>(null);

  const projectType = project?.type || 'bbox';

  // Legacy YOLO config (for presets + backward compat)
  const { config: yoloConfig, updateConfig: updateYoloConfig, updateAugmentation: updateYoloAug, applyPreset } = useTrainingConfig(projectType);

  // Multi-backend request
  const {
    backend,
    setBackend,
    modelId,
    setModelId,
    modelSize,
    setModelSize,
    executionMode,
    setExecutionMode,
    commonParams,
    updateCommonParam,
    backendParams,
    updateBackendParam,
    currentModels,
    buildRequest,
    baseModelPath,
    setBaseModelPath,
  } = useTrainingRequest(projectType);

  const {
    progress,
    epoch,
    totalEpochs,
    metricsHistory,
    logs,
    result,
    error,
    phase: trainingPhase,
    reset: resetProgress,
  } = useTrainingProgress(activeJobId);

  // Fetch env status lazily (for backend install badges) — non-blocking
  useEffect(() => {
    if (open && !envStatus) {
      trainingService.checkPythonEnv().then((info) => {
        setEnvStatus(info.env);
        setGpuInfo(info.gpu);
      }).catch(() => {});
    }
  }, [open, envStatus]);

  useEffect(() => {
    if (trainingPhase === 'completed' && result) {
      setPhase('completed');
    }
  }, [trainingPhase, result]);

  const handleBackendSelect = useCallback((selectedBackend: typeof backend) => {
    setBackend(selectedBackend);
    setPhase('config');
  }, [setBackend]);

  // When user picks "Train locally" → check Python env + backend packages first
  const handleStartLocal = useCallback(async () => {
    if (!project?.id) return;

    // 1) Check Python env
    try {
      const info = await trainingService.checkPythonEnv();
      setEnvStatus(info.env);
      setGpuInfo(info.gpu);

      if (!info.env.installed) {
        setPhase('setup');
        return;
      }

      // 2) Check backend-specific packages
      const needsBackendInstall =
        (backend === 'rf_detr' && !info.env.rfdetrVersion) ||
        (backend === 'mmdetection' && !info.env.mmdetVersion);

      if (needsBackendInstall) {
        setPhase('installing_backend');
        try {
          await trainingService.installBackendPackages(backend);
          // Re-check env after install
          const updated = await trainingService.checkPythonEnv();
          setEnvStatus(updated.env);
          setGpuInfo(updated.gpu);
        } catch (e) {
          console.error('Error installing backend packages:', e);
          setPhase('config');
          return;
        }
      }
    } catch {
      setPhase('setup');
      return;
    }

    // Env + backend ready → start training
    try {
      const request = buildRequest();
      const jobId = await trainingService.startTrainingV2(project.id, request);
      setActiveJobId(jobId);
      setPhase('training');
    } catch (e) {
      console.error('Error starting training:', e);
      setPhase('config');
    }
  }, [project, backend, buildRequest]);

  // Python env setup completed → resume training start
  const handleEnvReady = useCallback((gpu: GpuInfo | null) => {
    if (gpu) setGpuInfo(gpu);
    trainingService.checkPythonEnv().then((info) => {
      setEnvStatus(info.env);
    }).catch(() => {});
    // Go back to config — user can press "start" again now that env is ready
    setPhase('config');
  }, []);

  const handleDownloadPackage = useCallback(async () => {
    if (!project?.id) return;
    try {
      const filePath = await save({
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
        defaultPath: `training_package_${backend}.zip`,
      });
      if (!filePath) return;

      const request = buildRequest();
      await trainingService.generateTrainingPackage(project.id, request, filePath);
    } catch (e) {
      console.error('Error generating package:', e);
    }
  }, [project, backend, buildRequest]);

  const handleCancel = useCallback(async () => {
    if (activeJobId && project?.id) {
      try {
        await trainingService.cancelTraining(project.id, activeJobId);
      } catch {
        // may already be cancelled
      }
      setPhase('config');
      setActiveJobId(null);
      resetProgress();
    }
  }, [activeJobId, project, resetProgress]);

  const handleNewTraining = useCallback(() => {
    setPhase('backend');
    setActiveJobId(null);
    resetProgress();
    setBaseModelPath(null);
    setFineTuneSource(null);
  }, [resetProgress, setBaseModelPath]);

  const handleFineTune = useCallback((job: TrainingJob) => {
    if (!job.bestModelPath) return;
    const config = job.config as Record<string, unknown>;
    const jobBackend = (config.backend as TrainingBackend) || 'yolo';
    // Solo soportado para YOLO y RT-DETR
    if (jobBackend !== 'yolo' && jobBackend !== 'rt_detr') return;
    setBaseModelPath(job.bestModelPath);
    const model = config.yoloVersion || config.modelId || '?';
    const size = config.modelSize || '';
    const date = new Date(job.createdAt).toLocaleDateString();
    setFineTuneSource(`${String(model).toUpperCase()}${size} - ${date}`);
    setBackend(jobBackend);
    setPhase('config');
  }, [setBaseModelPath, setBackend]);

  const handlePresetSelect = useCallback((presetId: ScenarioPresetId) => {
    setSelectedPreset(presetId);
    applyPreset(presetId);
  }, [applyPreset]);

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-emerald-600 hover:bg-emerald-700">
            <i className="fas fa-brain mr-2" />
            {t('training.title')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh]" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="fas fa-brain text-emerald-500" />
            {t('training.title')}
          </DialogTitle>
          <DialogDescription>{t('training.description')}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-120px)] pr-4">
          <div className="space-y-6 py-2">
            {/* Phase navigation breadcrumb */}
            {phase !== 'setup' && phase !== 'training' && phase !== 'completed' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  onClick={() => setPhase('backend')}
                  className={`transition-colors ${phase === 'backend' ? 'text-foreground font-medium' : 'hover:text-foreground'}`}
                >
                  {t('training.backend.title')}
                </button>
                <i className="fas fa-chevron-right text-[8px]" />
                <button
                  onClick={() => phase !== 'backend' && setPhase('config')}
                  className={`transition-colors ${phase === 'config' ? 'text-foreground font-medium' : 'hover:text-foreground'} ${phase === 'backend' ? 'opacity-50' : ''}`}
                  disabled={phase === 'backend'}
                >
                  {t('training.config.title')}
                </button>
              </div>
            )}

            {/* Backend selection phase */}
            {phase === 'backend' && (
              <>
                <BackendSelector
                  projectType={projectType}
                  envStatus={envStatus}
                  onSelect={handleBackendSelect}
                />
                <Separator />
                <TrainingJobList projectId={project.id!} onFineTune={handleFineTune} />
              </>
            )}

            {/* Config phase */}
            {phase === 'config' && (
              <>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setPhase('backend')}>
                    <i className="fas fa-arrow-left mr-2" />
                    {t('common.back')}
                  </Button>
                  <GpuIndicator gpuInfo={gpuInfo} loading={false} />
                </div>

                {/* Fine-tune badge */}
                {baseModelPath && fineTuneSource && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <i className="fas fa-rotate text-emerald-500 text-sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-500">{t('training.fineTune')}</p>
                      <p className="text-xs text-muted-foreground truncate">{t('training.fineTuneFrom', { source: fineTuneSource })}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setBaseModelPath(null); setFineTuneSource(null); }}
                      className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
                    >
                      <i className="fas fa-times text-xs" />
                    </Button>
                  </div>
                )}

                {/* YOLO Presets */}
                {backend === 'yolo' && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">{t('training.presets.title')}</label>
                      <TrainingPresets
                        selected={selectedPreset}
                        onSelect={handlePresetSelect}
                        currentModelSize={modelSize}
                      />
                    </div>
                    <Separator />
                  </>
                )}

                {/* Model selector */}
                <BackendModelSelector
                  backend={backend}
                  models={currentModels}
                  selectedModelId={modelId}
                  selectedSize={backend === 'yolo' ? modelSize : null}
                  onModelChange={setModelId}
                  onSizeChange={setModelSize}
                />

                <Separator />

                {/* Config panel */}
                <BackendConfigPanel
                  backend={backend}
                  commonParams={commonParams}
                  backendParams={backendParams}
                  yoloConfig={backend === 'yolo' ? yoloConfig : undefined}
                  onCommonChange={updateCommonParam}
                  onBackendParamChange={updateBackendParam}
                  onYoloConfigChange={backend === 'yolo' ? updateYoloConfig : undefined}
                  onYoloAugChange={backend === 'yolo' ? updateYoloAug : undefined}
                />

                <Separator />

                {/* Execution mode */}
                <ExecutionModeSelector
                  selected={executionMode}
                  onSelect={setExecutionMode}
                  onStartLocal={handleStartLocal}
                  onDownloadPackage={handleDownloadPackage}
                />
              </>
            )}

            {/* Setup phase: Python env check — only reached when local training needs env */}
            {phase === 'setup' && (
              <PythonEnvSetup onReady={handleEnvReady} />
            )}

            {/* Installing backend packages */}
            {phase === 'installing_backend' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <i className="fas fa-spinner fa-spin text-3xl text-emerald-500" />
                <p className="text-sm font-medium">{t('training.backend.installingPackages')}</p>
                <p className="text-xs text-muted-foreground">{t('training.backend.installingPackagesDesc')}</p>
              </div>
            )}

            {/* Training phase */}
            {phase === 'training' && (
              <TrainingMonitor
                epoch={epoch}
                totalEpochs={totalEpochs}
                progress={progress}
                metricsHistory={metricsHistory}
                logs={logs}
                phase={trainingPhase}
                error={error}
                onCancel={handleCancel}
              />
            )}

            {/* Completed phase */}
            {phase === 'completed' && result && (
              <TrainingResult result={result} onNewTraining={handleNewTraining} />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
