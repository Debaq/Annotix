import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TrainingJob } from '../types';

interface TrainingJobCardProps {
  job: TrainingJob;
  onDelete: (jobId: string) => void;
  onFineTune?: (job: TrainingJob) => void;
  onResume?: (job: TrainingJob) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  training: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-zinc-500',
};

export function TrainingJobCard({ job, onDelete, onFineTune, onResume }: TrainingJobCardProps) {
  const { t } = useTranslation();

  const config = job.config as Record<string, unknown>;
  const model = `${config.yoloVersion || '?'}${config.modelSize || ''}`;
  const date = new Date(job.createdAt).toLocaleString();

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-3">
        <Badge className={STATUS_COLORS[job.status] || 'bg-zinc-500'}>
          {t(`training.status.${job.status}`)}
        </Badge>
        <div>
          <p className="text-sm font-medium font-mono">{model.toUpperCase()}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs text-muted-foreground">{date}</p>
            {job.hasBest && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-mono"
                title={t('training.weights.bestHint')}
              >
                best.pt
              </span>
            )}
            {job.hasLast && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-500 font-mono"
                title={t('training.weights.lastHint')}
              >
                last.pt
              </span>
            )}
            {!job.hasBest && !job.hasLast && (job.status === 'cancelled' || job.status === 'failed') && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/15 text-muted-foreground font-mono"
                title={t('training.weights.noneHint')}
              >
                {t('training.weights.none')}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {job.status === 'completed' && job.progress === 100 && (
          <span className="text-xs text-green-500 font-mono">{job.progress.toFixed(0)}%</span>
        )}
        {job.status === 'training' && (
          <span className="text-xs text-blue-500 font-mono">{job.progress.toFixed(0)}%</span>
        )}
        {job.status === 'completed' && job.bestModelPath && onFineTune && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFineTune(job)}
            className="text-muted-foreground hover:text-emerald-500"
            title={t('training.fineTune')}
          >
            <i className="fas fa-rotate text-xs" />
          </Button>
        )}
        {(job.status === 'cancelled' || job.status === 'failed') && (job.hasBest || job.hasLast) && (() => {
          const backend = (config.backend as string) || 'yolo';
          const isUltralytics = backend === 'yolo' || backend === 'rt_detr';
          const canTrueResume = isUltralytics && job.hasLast && !!onResume;
          if (canTrueResume) {
            return (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onResume!(job)}
                className="text-muted-foreground hover:text-amber-500"
                title={t('training.resume')}
              >
                <i className="fas fa-play text-xs" />
              </Button>
            );
          }
          if (onFineTune) {
            return (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFineTune(job)}
                className="text-muted-foreground hover:text-amber-500"
                title={t('training.resumeAsFineTune')}
              >
                <i className="fas fa-rotate text-xs" />
              </Button>
            );
          }
          return null;
        })()}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => job.id && onDelete(job.id)}
          className="text-muted-foreground hover:text-red-500"
        >
          <i className="fas fa-trash text-xs" />
        </Button>
      </div>
    </div>
  );
}
