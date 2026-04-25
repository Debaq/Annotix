import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useAnnotatedCount(projectId: string | null, enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled || !projectId) return;
    let cancelled = false;
    invoke<number>('count_annotated_images', { projectId })
      .then((n) => { if (!cancelled) setCount(n); })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, [projectId, enabled]);
  return count;
}
