import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

const CACHE_KEY = 'annotix-update-check';
const DISMISS_KEY = 'annotix-update-dismissed';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

interface CacheEntry {
  ts: number;
  info: UpdateInfo;
}

function readCache(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.info;
  } catch {
    return null;
  }
}

function writeCache(info: UpdateInfo) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), info }));
  } catch {
    // ignore
  }
}

export function useUpdateCheck(): { info: UpdateInfo | null; dismiss: () => void } {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cached = readCache();
    if (cached) {
      setInfo(cached);
      return;
    }

    // Delay slightly to avoid blocking app boot
    const timer = setTimeout(() => {
      invoke<UpdateInfo>('check_for_updates')
        .then((result) => {
          if (cancelled) return;
          writeCache(result);
          setInfo(result);
        })
        .catch((err) => {
          console.warn('[updater] check failed:', err);
        });
    }, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (info) {
      try {
        localStorage.setItem(DISMISS_KEY, info.latestVersion);
      } catch {
        // ignore
      }
    }
    setInfo(null);
  }, [info]);

  // Si versión ya descartada, no mostrar
  if (info?.updateAvailable) {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed === info.latestVersion) {
        return { info: null, dismiss };
      }
    } catch {
      // ignore
    }
  }

  return { info, dismiss };
}
