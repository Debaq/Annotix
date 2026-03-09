import { useState, useCallback, useEffect } from 'react';
import { inferenceService } from '../services/inferenceService';
import type { PredictionEntry } from '../types';

interface UsePredictionsResult {
  predictions: PredictionEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
  accept: (predictionId: string) => Promise<void>;
  reject: (predictionId: string) => Promise<void>;
  acceptAll: () => Promise<void>;
  rejectAll: () => Promise<void>;
  convertAccepted: () => Promise<number>;
  clearAll: () => Promise<void>;
}

export function usePredictions(
  projectId: string | null,
  imageId: string | null,
): UsePredictionsResult {
  const [predictions, setPredictions] = useState<PredictionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId || !imageId) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    try {
      const preds = await inferenceService.getPredictions(projectId, imageId);
      setPredictions(preds);
    } catch {
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, imageId]);

  useEffect(() => {
    refresh();
  }, [projectId, imageId]);

  const accept = useCallback(async (predictionId: string) => {
    if (!projectId || !imageId) return;
    await inferenceService.acceptPrediction(projectId, imageId, predictionId);
    await refresh();
  }, [projectId, imageId, refresh]);

  const reject = useCallback(async (predictionId: string) => {
    if (!projectId || !imageId) return;
    await inferenceService.rejectPrediction(projectId, imageId, predictionId);
    await refresh();
  }, [projectId, imageId, refresh]);

  const acceptAll = useCallback(async () => {
    if (!projectId || !imageId) return;
    const pending = predictions.filter((p) => p.status === 'pending');
    for (const pred of pending) {
      await inferenceService.acceptPrediction(projectId, imageId, pred.id);
    }
    await refresh();
  }, [projectId, imageId, predictions, refresh]);

  const rejectAll = useCallback(async () => {
    if (!projectId || !imageId) return;
    const pending = predictions.filter((p) => p.status === 'pending');
    for (const pred of pending) {
      await inferenceService.rejectPrediction(projectId, imageId, pred.id);
    }
    await refresh();
  }, [projectId, imageId, predictions, refresh]);

  const convertAccepted = useCallback(async (): Promise<number> => {
    if (!projectId || !imageId) return 0;
    const count = await inferenceService.convertPredictions(projectId, imageId);
    await refresh();
    return count;
  }, [projectId, imageId, refresh]);

  const clearAll = useCallback(async () => {
    if (!projectId || !imageId) return;
    await inferenceService.clearPredictions(projectId, imageId);
    await refresh();
  }, [projectId, imageId, refresh]);

  return {
    predictions,
    loading,
    refresh,
    accept,
    reject,
    acceptAll,
    rejectAll,
    convertAccepted,
    clearAll,
  };
}
