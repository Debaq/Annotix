import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { TrainingProgressEvent, TrainingEpochMetrics, TrainingResult } from '../types';

export function useTrainingProgress(jobId: string | null) {
  const [progress, setProgress] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [totalEpochs, setTotalEpochs] = useState(0);
  const [metricsHistory, setMetricsHistory] = useState<TrainingEpochMetrics[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>('waiting');

  const reset = useCallback(() => {
    setProgress(0);
    setEpoch(0);
    setTotalEpochs(0);
    setMetricsHistory([]);
    setLogs([]);
    setResult(null);
    setError(null);
    setPhase('waiting');
  }, []);

  useEffect(() => {
    if (!jobId) return;

    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const u1 = await listen<TrainingProgressEvent>('training:progress', (event) => {
        if (event.payload.jobId !== jobId) return;
        setProgress(event.payload.progress);
        setEpoch(event.payload.epoch);
        setTotalEpochs(event.payload.totalEpochs);
        setPhase(event.payload.phase);
        if (event.payload.metrics) {
          setMetricsHistory((prev) => [...prev, event.payload.metrics!]);
        }
      });
      unlisteners.push(u1);

      const u2 = await listen<{ jobId: string; message: string }>('training:log', (event) => {
        if (event.payload.jobId !== jobId) return;
        setLogs((prev) => [...prev, event.payload.message]);
      });
      unlisteners.push(u2);

      const u3 = await listen<{ jobId: string; result: TrainingResult }>('training:completed', (event) => {
        if (event.payload.jobId !== jobId) return;
        setResult(event.payload.result);
        setPhase('completed');
        setProgress(100);
      });
      unlisteners.push(u3);

      const u4 = await listen<{ jobId: string; error: string }>('training:error', (event) => {
        if (event.payload.jobId !== jobId) return;
        setError(event.payload.error);
        setPhase('error');
      });
      unlisteners.push(u4);

      const u5 = await listen<{ jobId: string }>('training:cancelled', (event) => {
        if (event.payload.jobId !== jobId) return;
        setPhase('cancelled');
      });
      unlisteners.push(u5);
    };

    setup();
    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [jobId]);

  return {
    progress,
    epoch,
    totalEpochs,
    metricsHistory,
    logs,
    result,
    error,
    phase,
    reset,
  };
}
