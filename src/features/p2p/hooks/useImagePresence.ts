import { useEffect, useRef } from 'react';
import { useP2pStore } from '../store/p2pStore';
import { p2pService } from '../services/p2pService';

/**
 * Auto-lock/unlock de imagen para presencia P2P.
 * Al montar (o cambiar de imagen), lockea la imagen actual.
 * Al desmontar (o cambiar), unlockea la anterior.
 * Renueva el lock cada 60s para mantener presencia activa (TTL=3min).
 */
export function useImagePresence(projectId: string | undefined, imageId: string | undefined) {
  const session = useP2pStore(s => projectId ? s.sessions[projectId] ?? null : null);
  const lockedRef = useRef<{ projectId: string; imageId: string } | null>(null);
  const renewalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session || !projectId || !imageId) return;

    const lock = async () => {
      try {
        await p2pService.lockImage(projectId, imageId);
        lockedRef.current = { projectId, imageId };
      } catch (err) {
        console.warn('Error locking image for presence:', err);
      }
    };

    const unlock = (pid: string, iid: string) => {
      p2pService.unlockImage(pid, iid).catch((err) => {
        console.warn('Error unlocking image for presence:', err);
      });
    };

    // Lock actual
    lock();

    // Renovar lock cada 60s (TTL=3min, renueva a 1/3 del TTL)
    renewalRef.current = setInterval(() => {
      p2pService.lockImage(projectId, imageId).catch(() => {});
    }, 60_000);

    return () => {
      // Limpiar renovación
      if (renewalRef.current) {
        clearInterval(renewalRef.current);
        renewalRef.current = null;
      }
      // Unlock al desmontar o cambiar de imagen
      if (lockedRef.current) {
        unlock(lockedRef.current.projectId, lockedRef.current.imageId);
        lockedRef.current = null;
      }
    };
  }, [session, projectId, imageId]);
}
