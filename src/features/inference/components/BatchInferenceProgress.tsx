import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { InferenceProgressEvent } from '../types';

interface BatchInferenceProgressProps {
  progress: InferenceProgressEvent | null;
  running: boolean;
  onCancel: () => void;
}

export function BatchInferenceProgress({
  progress,
  running,
  onCancel,
}: BatchInferenceProgressProps) {
  const { t } = useTranslation('inference');

  if (!running) return null;

  const percentage = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="space-y-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="fas fa-spinner fa-spin text-blue-400 text-sm" />
          <span className="text-sm text-blue-300">{t('batchProgress')}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-6 text-red-400 hover:text-red-300"
          onClick={onCancel}
        >
          {t('cancelInference')}
        </Button>
      </div>

      <Progress value={percentage} className="h-2" />

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {progress ? `${progress.current} / ${progress.total}` : '0 / 0'}
        </span>
        <span>{percentage}%</span>
      </div>

      {progress && progress.predictionsCount > 0 && (
        <p className="text-xs text-gray-500">
          {t('inferenceCompleted', {
            count: progress.predictionsCount,
            time: '',
          }).replace(' in ms', '')}
        </p>
      )}
    </div>
  );
}
