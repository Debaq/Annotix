import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Imágenes que entrarían al dataset. `classIds` (null = todas) recorta el
 * conteo igual que lo hace el preparador: una imagen anotada solo con clases
 * descartadas no entra.
 */
export function useAnnotatedCount(
  projectId: string | null,
  enabled: boolean,
  classIds: number[] | null = null,
): number {
  const [count, setCount] = useState(0);
  const clave = classIds === null ? null : classIds.join(',');
  useEffect(() => {
    if (!enabled || !projectId) return;
    let cancelled = false;
    invoke<number>('count_annotated_images', {
      projectId,
      classIds: clave === null ? null : clave === '' ? [] : clave.split(',').map(Number),
    })
      .then((n) => { if (!cancelled) setCount(n); })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, [projectId, enabled, clave]);
  return count;
}
