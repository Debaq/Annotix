import { useState, useCallback } from 'react';
import { trainingService } from '../services/trainingService';
import type { GpuInfo } from '../types';

export function useGpuDetection() {
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const detectGpu = useCallback(async () => {
    setLoading(true);
    try {
      const info = await trainingService.detectGpu();
      setGpuInfo(info);
      return info;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { gpuInfo, loading, detectGpu };
}
