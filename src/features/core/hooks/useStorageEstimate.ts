import { useState, useEffect } from 'react';

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
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
          const result = await navigator.storage.estimate();
          const usage = result.usage || 0;
          const quota = result.quota || 0;
          const percentage = quota > 0 ? (usage / quota) * 100 : 0;

          setEstimate({ usage, quota, percentage });
        } catch (error) {
          console.error('Failed to estimate storage:', error);
        }
      }
    };

    updateEstimate();

    // Update every 30 seconds
    const interval = setInterval(updateEstimate, 30000);
    return () => clearInterval(interval);
  }, []);

  return estimate;
}
