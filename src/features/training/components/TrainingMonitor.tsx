import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TrainingMetricsChart } from './TrainingMetricsChart';
import { TrainingLogViewer } from './TrainingLogViewer';
import { TrainingObservations, type ObservationStyle } from './TrainingObservations';
import type { TrainingEpochMetrics } from '../types';

const STYLE_STORAGE_KEY = 'training.observations.style';

interface TrainingMonitorProps {
  epoch: number;
  totalEpochs: number;
  progress: number;
  metricsHistory: TrainingEpochMetrics[];
  logs: string[];
  phase: string;
  error: string | null;
  onCancel: () => void;
  isCloud?: boolean;
  cloudProvider?: string | null;
  cloudJobUrl?: string | null;
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
  isCloud,
  cloudProvider,
  cloudJobUrl,
}: TrainingMonitorProps) {
  const { t } = useTranslation();

  const [obsStyle, setObsStyle] = useState<ObservationStyle>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STYLE_STORAGE_KEY) : null;
    return stored === 'fun' ? 'fun' : 'pro';
  });
  useEffect(() => {
    try { window.localStorage.setItem(STYLE_STORAGE_KEY, obsStyle); } catch { /* ignore */ }
  }, [obsStyle]);

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
    <div className="space-y-4 flex flex-col flex-1 min-h-0 h-full">
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

      {/* Cloud banner */}
      {isCloud && cloudProvider && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-500/10 border border-sky-500/20">
          <i className="fas fa-cloud text-sky-500" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sky-500">
              {t('training.cloud.runningOn', { provider: cloudProvider })}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t('training.cloud.pollingInfo')}
            </p>
          </div>
          {cloudJobUrl && (
            <a
              href={cloudJobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-500 hover:underline flex items-center gap-1"
            >
              <i className="fas fa-external-link-alt text-[10px]" />
              {t('training.cloud.viewJob')}
            </a>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progress} />
        <p className="text-xs text-muted-foreground text-right">{progress.toFixed(1)}%</p>
      </div>

      {/* Current metrics */}
      {latestMetrics && (
        <div className="grid grid-cols-5 gap-3">
          {latestMetrics.meanIoU != null ? (
            <>
              <MetricCard label={t('training.monitor.mIoU')} value={latestMetrics.meanIoU} format="percent" />
              {latestMetrics.meanAccuracy != null && (
                <MetricCard label={t('training.monitor.meanAccuracy')} value={latestMetrics.meanAccuracy} format="percent" />
              )}
              {latestMetrics.trainLoss != null && (
                <MetricCard label="Train Loss" value={latestMetrics.trainLoss} format="number" />
              )}
              {latestMetrics.valLoss != null && (
                <MetricCard label="Val Loss" value={latestMetrics.valLoss} format="number" />
              )}
            </>
          ) : (
            <>
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
              {(() => {
                const f1 = latestMetrics.f1Score ?? (
                  latestMetrics.precision != null && latestMetrics.recall != null && latestMetrics.precision + latestMetrics.recall > 0
                    ? (2 * latestMetrics.precision * latestMetrics.recall) / (latestMetrics.precision + latestMetrics.recall)
                    : null
                );
                return f1 != null ? <MetricCard label="F1" value={f1} format="percent" /> : null;
              })()}
            </>
          )}
        </div>
      )}

      {/* Charts + observations */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <TrainingMetricsChart metricsHistory={metricsHistory} />
        </div>
        <div className="col-span-1 min-h-[13rem]">
          <TrainingObservations
            metricsHistory={metricsHistory}
            style={obsStyle}
            onStyleChange={setObsStyle}
          />
        </div>
      </div>

      {/* Logs */}
      <TrainingLogViewer
        logs={logs}
        fillHeight
        canSave={phase === 'completed' || phase === 'error' || phase === 'cancelled'}
      />

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
