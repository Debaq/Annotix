import { useState, useEffect } from 'react';
import * as tauriDb from '@/lib/tauriDb';

interface StorageEstimate {
  usage: number;
  quota: number;
  percentage: number;
}

export function useStorageEstimate() {
  const [estimate, setEstimate] = useState<StorageEstimate>({
    usage: 0,
    quota: 0,
    percentage: 0,
  });

  useEffect(() => {
    const updateEstimate = async () => {
      try {
        const info = await tauriDb.getStorageInfo();
        setEstimate({
          usage: info.usage,
          quota: info.quota,
          percentage: info.percentage,
        });
      } catch (error) {
        console.error('Failed to estimate storage:', error);
      }
    };

    updateEstimate();

    // Update every 30 seconds
    const interval = setInterval(updateEstimate, 30000);
    return () => clearInterval(interval);
  }, []);

  return estimate;
}
