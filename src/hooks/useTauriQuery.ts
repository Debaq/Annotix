import { useState, useEffect, useCallback, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

/**
 * Hook genérico para queries reactivas con Tauri.
 * Reemplaza useLiveQuery de dexie-react-hooks.
 *
 * @param queryFn - Función async que hace invoke() y retorna datos
 * @param deps - Dependencias que disparan re-fetch
 * @param eventNames - Eventos Tauri que disparan re-fetch (reactividad)
 */
export function useTauriQuery<T>(
  queryFn: () => Promise<T>,
  deps: unknown[],
  eventNames: string[] = []
): { data: T | undefined; isLoading: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const dataRef = useRef<T | undefined>(undefined);
  const load = useCallback(async () => {
    if (dataRef.current === undefined) setIsLoading(true);
    try {
      const result = await queryFn();
      if (mountedRef.current) {
        dataRef.current = result;
        setData(result);
      }
    } catch (error) {
      console.error('useTauriQuery error:', error);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Escuchar eventos Tauri para reactividad
  useEffect(() => {
    if (eventNames.length === 0) return;

    const unlisteners: Promise<UnlistenFn>[] = eventNames.map((name) =>
      listen(name, () => {
        if (mountedRef.current) {
          load();
        }
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...eventNames]);

  return { data, isLoading, reload: load };
}
