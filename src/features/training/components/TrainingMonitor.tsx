import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TrainingMetricsChart } from './TrainingMetricsChart';
import { TrainingLogViewer } from './TrainingLogViewer';
import type { TrainingEpochMetrics } from '../types';

interface TrainingMonitorProps {
  epoch: number;
  totalEpochs: number;
  progress: number;
  metricsHistory: TrainingEpochMetrics[];
  logs: string[];
  phase: string;
  error: string | null;
  onCancel: () => void;
}

export function TrainingMonitor({
  epoch,
  totalEpochs,
  progress,
  metricsHistory,
  logs,
  phase,
  error,
  onCancel,
}: TrainingMonitorProps) {
  const { t } = useTranslation();

  const latestMetrics = metricsHistory.length > 0
    ? metricsHistory[metricsHistory.length - 1]
    : null;

  const phaseIcon = phase === 'error' || phase === 'cancelled'
    ? 'fas fa-exclamation-circle text-red-500'
    : 'fas fa-spinner fa-spin text-emerald-500';

  const phaseLabel = phase === 'error'
    ? t('training.status.failed')
    : phase === 'cancelled'
      ? t('training.status.cancelled')
      : t('training.monitor.title');

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className={phaseIcon} />
          <div>
            <h3 className="text-sm font-medium">{phaseLabel}</h3>
            <p className="text-xs text-muted-foreground">
              {t('training.monitor.epochProgress', { epoch, total: totalEpochs })}
            </p>
          </div>
        </div>
        {phase !== 'error' && phase !== 'cancelled' && (
          <Button variant="destructive" size="sm" onClick={onCancel}>
            <i className="fas fa-stop mr-1" />
            {t('training.cancel')}
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progress} />
        <p className="text-xs text-muted-foreground text-right">{progress.toFixed(1)}%</p>
      </div>

      {/* Current metrics */}
      {latestMetrics && (
        <div className="grid grid-cols-4 gap-3">
          {latestMetrics.mAP50 != null && (
            <MetricCard label="mAP50" value={latestMetrics.mAP50} format="percent" />
          )}
          {latestMetrics.mAP50_95 != null && (
            <MetricCard label="mAP50-95" value={latestMetrics.mAP50_95} format="percent" />
          )}
          {latestMetrics.precision != null && (
            <MetricCard label={t('training.monitor.precision')} value={latestMetrics.precision} format="percent" />
          )}
          {latestMetrics.recall != null && (
            <MetricCard label={t('training.monitor.recall')} value={latestMetrics.recall} format="percent" />
          )}
        </div>
      )}

      {/* Charts */}
      <TrainingMetricsChart metricsHistory={metricsHistory} />

      {/* Logs */}
      <TrainingLogViewer logs={logs} />

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
          <i className="fas fa-exclamation-circle mr-2" />
          {error}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, format }: { label: string; value: number; format: 'percent' | 'number' }) {
  const display = format === 'percent'
    ? `${(value * 100).toFixed(1)}%`
    : value.toFixed(4);

  return (
    <div className="bg-accent/50 rounded-lg p-2 text-center">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-bold font-mono">{display}</p>
    </div>
  );
}
