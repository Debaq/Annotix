import { useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { trainingService } from '../services/trainingService';
import type { PythonEnvStatus } from '../types';

export function usePythonEnv() {
  const [envStatus, setEnvStatus] = useState<PythonEnvStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupProgress, setSetupProgress] = useState<{ message: string; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkEnv = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await trainingService.checkPythonEnv();
      setEnvStatus(status);
      return status;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const setupEnv = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSetupProgress({ message: 'Iniciando...', progress: 0 });

    const unlisten = await listen<{ message: string; progress: number }>(
      'training:env-setup-progress',
      (event) => {
        setSetupProgress(event.payload);
      }
    );

    try {
      const status = await trainingService.setupPythonEnv();
      setEnvStatus(status);
      return status;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      unlisten();
      setLoading(false);
      setSetupProgress(null);
    }
  }, []);

  return {
    envStatus,
    loading,
    setupProgress,
    error,
    checkEnv,
    setupEnv,
  };
}
