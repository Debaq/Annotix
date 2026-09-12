import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

/// Respuesta cruda de `check_for_updates`. `updateAvailable` y `currentVersion`
/// se recalculan siempre en el cliente, nunca se persisten (ver `CacheEntry`).
interface RawUpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

const CACHE_KEY = 'annotix-update-check';
const DISMISS_KEY = 'annotix-update-dismissed';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const CACHE_FORMAT = 2;
const BOOT_DELAY_MS = 3000;

/// Solo datos del release remoto: nada que dependa de la versión instalada.
/// Una entrada vieja puede quedar desactualizada, pero jamás puede afirmar en
/// qué versión estás — eso se pregunta siempre a `getVersion()`.
interface CacheEntry {
  v: number;
  ts: number;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<CacheEntry>;
    // Formato 1 guardaba `currentVersion`/`updateAvailable` y sobrevivía a las
    // actualizaciones, mostrando la versión anterior como si fuera la actual.
    if (entry.v !== CACHE_FORMAT || typeof entry.latestVersion !== 'string') {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(info: RawUpdateInfo) {
  try {
    const entry: CacheEntry = {
      v: CACHE_FORMAT,
      ts: Date.now(),
      latestVersion: info.latestVersion,
      releaseUrl: info.releaseUrl,
      releaseNotes: info.releaseNotes,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

function isExpired(entry: CacheEntry): boolean {
  const age = Date.now() - entry.ts;
  // Un reloj movido hacia atrás daría edad negativa: también se revalida.
  return age > CACHE_TTL_MS || age < 0;
}

/// Compara versiones semánticas; espeja `version_is_newer` del backend.
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/, '')
      .split('.')
      .map((p) => Number.parseInt(p, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const l = parse(latest);
  const c = parse(current);
  for (let i = 0; i < 3; i++) {
    const lv = l[i] ?? 0;
    const cv = c[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

// --- Estado compartido -------------------------------------------------------
// Un único chequeo por arranque, sin importar cuántos componentes lo consuman.

let shared: UpdateInfo | null = null;
let started = false;
const listeners = new Set<() => void>();

function publish(info: UpdateInfo | null) {
  shared = info;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): UpdateInfo | null {
  return shared;
}

function buildInfo(currentVersion: string, latestVersion: string, releaseUrl: string, releaseNotes: string): UpdateInfo {
  return {
    updateAvailable: isNewerVersion(latestVersion, currentVersion),
    currentVersion,
    latestVersion,
    releaseUrl,
    releaseNotes,
  };
}

async function revalidate(currentVersion: string): Promise<void> {
  try {
    const result = await invoke<RawUpdateInfo>('check_for_updates');
    writeCache(result);
    // `currentVersion` del backend (Cargo.toml) manda sobre el del frontend
    // (tauri.conf.json) solo si el frontend no pudo resolverlo.
    const current = currentVersion || result.currentVersion;
    publish(buildInfo(current, result.latestVersion, result.releaseUrl, result.releaseNotes));
  } catch (err) {
    console.warn('[updater] check failed:', err);
  }
}

function start() {
  if (started) return;
  started = true;

  void (async () => {
    let currentVersion = '';
    try {
      currentVersion = await getVersion();
    } catch {
      // Se resuelve más abajo con el valor que reporte el backend.
    }

    const cached = readCache();
    if (cached && currentVersion) {
      // Pintado inmediato con lo cacheado, recalculando contra la versión real.
      publish(buildInfo(currentVersion, cached.latestVersion, cached.releaseUrl, cached.releaseNotes));
      if (!isExpired(cached)) return;
    }

    // Revalidación diferida para no competir con el arranque de la app.
    setTimeout(() => void revalidate(currentVersion), BOOT_DELAY_MS);
  })();
}

/// Fuerza un rechequeo saltándose el caché. Útil tras instalar una versión nueva.
export async function refreshUpdateCheck(): Promise<void> {
  let currentVersion = '';
  try {
    currentVersion = await getVersion();
  } catch {
    // ignore
  }
  await revalidate(currentVersion);
}

export function useUpdateCheck(): { info: UpdateInfo | null; dismiss: () => void } {
  const info = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    start();
  }, []);

  const dismiss = useCallback(() => {
    const latest = shared?.latestVersion;
    if (!latest) return;
    try {
      localStorage.setItem(DISMISS_KEY, latest);
    } catch {
      // ignore
    }
    setDismissed(latest);
  }, []);

  // Descartar oculta esa versión concreta; una posterior vuelve a avisar.
  if (info?.updateAvailable && dismissed === info.latestVersion) {
    return { info: null, dismiss };
  }

  return { info, dismiss };
}
