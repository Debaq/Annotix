import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { TrainingProgressEvent } from '../types';

interface GlobalTrainingStatus {
  active: boolean;
  jobId: string | null;
  projectId: string | null;
  progress: number;
  epoch: number;
  totalEpochs: number;
}

const initial: GlobalTrainingStatus = {
  active: false,
  jobId: null,
  projectId: null,
  progress: 0,
  epoch: 0,
  totalEpochs: 0,
};

export function useGlobalTrainingStatus(): GlobalTrainingStatus {
  const [status, setStatus] = useState<GlobalTrainingStatus>(initial);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const u1 = await listen<TrainingProgressEvent>('training:progress', (event) => {
        const p = event.payload;
        setStatus({
          active: true,
          jobId: p.jobId,
          projectId: p.projectId ?? null,
          progress: p.progress,
          epoch: p.epoch,
          totalEpochs: p.totalEpochs,
        });
      });
      unlisteners.push(u1);

      const clear = (jobId: string) => {
        setStatus((prev) => (prev.jobId === jobId || !prev.jobId ? initial : prev));
      };

      const u2 = await listen<{ jobId: string }>('training:completed', (e) => clear(e.payload.jobId));
      unlisteners.push(u2);
      const u3 = await listen<{ jobId: string }>('training:error', (e) => clear(e.payload.jobId));
      unlisteners.push(u3);
      const u4 = await listen<{ jobId: string }>('training:cancelled', (e) => clear(e.payload.jobId));
      unlisteners.push(u4);
    };

    setup();
    return () => {
      unlisteners.forEach((u) => u());
    };
  }, []);

  return status;
}
