import { useState, useCallback, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { inferenceService } from '../services/inferenceService';
import type {
  InferenceConfig,
  InferenceProgressEvent,
  InferenceResultEvent,
  InferenceErrorEvent,
  InferenceCompletedEvent,
} from '../types';

interface UseInferenceRunnerResult {
  running: boolean;
  jobId: string | null;
  progress: InferenceProgressEvent | null;
  lastError: string | null;
  startSingle: (projectId: string, modelId: string, imageId: string, config: InferenceConfig) => Promise<void>;
  startBatch: (projectId: string, modelId: string, imageIds: string[], config: InferenceConfig) => Promise<void>;
  cancel: () => Promise<void>;
}

export function useInferenceRunner(
  onResult?: (event: InferenceResultEvent) => void,
  onCompleted?: (event: InferenceCompletedEvent) => void,
  onError?: (event: InferenceErrorEvent) => void,
): UseInferenceRunnerResult {
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<InferenceProgressEvent | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs para callbacks para evitar re-suscripciones
  const onResultRef = useRef(onResult);
  const onCompletedRef = useRef(onCompleted);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onCompletedRef.current = onCompleted;
  onErrorRef.current = onError;

  // Suscribirse a eventos Tauri
  useEffect(() => {
    const unlistenProgress = listen<InferenceProgressEvent>('inference:progress', (event) => {
      setProgress(event.payload);
    });

    const unlistenResult = listen<InferenceResultEvent>('inference:result', (event) => {
      onResultRef.current?.(event.payload);
    });

    const unlistenCompleted = listen<InferenceCompletedEvent>('inference:completed', (event) => {
      setRunning(false);
      setJobId(null);
      setProgress(null);
      onCompletedRef.current?.(event.payload);
    });

    const unlistenError = listen<InferenceErrorEvent>('inference:error', (event) => {
      setLastError(event.payload.error);
      onErrorRef.current?.(event.payload);
      // Si es un error general (sin imageId), detener
      if (!event.payload.imageId) {
        setRunning(false);
        setJobId(null);
      }
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenResult.then((fn) => fn());
      unlistenCompleted.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, []);

  const startSingle = useCallback(async (
    projectId: string,
    modelId: string,
    imageId: string,
    config: InferenceConfig,
  ) => {
    setRunning(true);
    setLastError(null);
    setProgress(null);
    try {
      const id = await inferenceService.runSingleInference(projectId, modelId, imageId, config);
      setJobId(id);
    } catch (err) {
      setRunning(false);
      setLastError(String(err));
    }
  }, []);

  const startBatch = useCallback(async (
    projectId: string,
    modelId: string,
    imageIds: string[],
    config: InferenceConfig,
  ) => {
    setRunning(true);
    setLastError(null);
    setProgress(null);
    try {
      const id = await inferenceService.startBatchInference(projectId, modelId, imageIds, config);
      setJobId(id);
    } catch (err) {
      setRunning(false);
      setLastError(String(err));
    }
  }, []);

  const cancel = useCallback(async () => {
    if (jobId) {
      try {
        await inferenceService.cancelInference(jobId);
      } catch {
        // Ignorar errores al cancelar
      }
    }
    setRunning(false);
    setJobId(null);
    setProgress(null);
  }, [jobId]);

  return {
    running,
    jobId,
    progress,
    lastError,
    startSingle,
    startBatch,
    cancel,
  };
}
