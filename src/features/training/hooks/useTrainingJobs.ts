import { useState, useCallback } from 'react';
import { trainingService } from '../services/trainingService';
import type { TrainingJob } from '../types';

export function useTrainingJobs(projectId: string | null) {
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [loading, setLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await trainingService.listTrainingJobs(projectId);
      setJobs(result);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const deleteJob = useCallback(async (jobId: string) => {
    if (!projectId) return;
    await trainingService.deleteTrainingJob(projectId, jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, [projectId]);

  return { jobs, loading, loadJobs, deleteJob };
}
