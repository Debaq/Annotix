import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTrainingJobs } from '../hooks/useTrainingJobs';
import { TrainingJobCard } from './TrainingJobCard';
import type { TrainingJob } from '../types';

interface TrainingJobListProps {
  projectId: string;
  onFineTune?: (job: TrainingJob) => void;
  onResume?: (job: TrainingJob) => void;
}

export function TrainingJobList({ projectId, onFineTune, onResume }: TrainingJobListProps) {
  const { t } = useTranslation();
  const { jobs, loading, loadJobs, deleteJob } = useTrainingJobs(projectId);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4 text-center"><i className="fas fa-spinner fa-spin mr-2" />{t('common.loading')}</div>;
  }

  if (jobs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        {t('training.jobs.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t('training.jobs.title')}</h4>
      {jobs.map((job) => (
        <TrainingJobCard
          key={job.id}
          job={job}
          onDelete={(id) => {
            deleteJob(id);
          }}
          onFineTune={onFineTune}
          onResume={onResume}
        />
      ))}
    </div>
  );
}
