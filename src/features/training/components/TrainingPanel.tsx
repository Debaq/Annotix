import { ReactNode, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useGpuDetection } from '../hooks/useGpuDetection';
import { trainingService } from '../services/trainingService';
import { PythonEnvSetup } from './PythonEnvSetup';
import { TrainingSetup } from './TrainingSetup';
import { TrainingMonitor } from './TrainingMonitor';
import { TrainingResult } from './TrainingResult';
import { TrainingJobList } from './TrainingJobList';
import type { TrainingPhase } from '../types';

interface TrainingPanelProps {
  trigger?: ReactNode;
}

export function TrainingPanel({ trigger }: TrainingPanelProps) {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<TrainingPhase>('setup');
  const [envReady, setEnvReady] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { config, updateConfig, updateAugmentation, applyPreset } = useTrainingConfig(
    project?.type || 'bbox'
  );
  const { gpuInfo, loading: gpuLoading, detectGpu } = useGpuDetection();
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

  // Detect GPU on env ready
  const handleEnvReady = useCallback(() => {
    setEnvReady(true);
    setPhase('config');
    detectGpu();
  }, [detectGpu]);

  // Watch for training completion
  useEffect(() => {
    if (trainingPhase === 'completed' && result) {
      setPhase('completed');
    }
  }, [trainingPhase, result]);

  const handleStart = useCallback(async () => {
    if (!project?.id) return;
    try {
      const jobId = await trainingService.startTraining(project.id, config);
      setActiveJobId(jobId);
      setPhase('training');
    } catch (e) {
      console.error('Error starting training:', e);
    }
  }, [project, config]);

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
    setPhase('config');
    setActiveJobId(null);
    resetProgress();
  }, [resetProgress]);

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
            {/* Setup phase: Python env check */}
            {phase === 'setup' && (
              <PythonEnvSetup onReady={handleEnvReady} />
            )}

            {/* Config phase */}
            {phase === 'config' && envReady && (
              <>
                <TrainingSetup
                  projectType={project.type}
                  config={config}
                  gpuInfo={gpuInfo}
                  gpuLoading={gpuLoading}
                  onConfigChange={updateConfig}
                  onAugmentationChange={updateAugmentation}
                  onPresetSelect={applyPreset}
                  onStart={handleStart}
                />
                <Separator />
                <TrainingJobList projectId={project.id!} />
              </>
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
