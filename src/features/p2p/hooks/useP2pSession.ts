import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useP2pStore } from '../store/p2pStore';
import type { ImageLockInfo, PeerInfo, BatchInfo, SyncProgress, SessionStatus, SessionRules } from '../types';

export function useP2pSession() {
  const {
    activeSession,
    setImageLock,
    removeImageLock,
    addPeer,
    removePeer,
    addBatch,
    setSyncProgress,
    updateSessionStatus,
    updateRules,
  } = useP2pStore();

  useEffect(() => {
    if (!activeSession) return;

    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      unlisteners.push(
        await listen<PeerInfo>('p2p:peer-joined', (event) => {
          addPeer({ ...event.payload, online: true });
        })
      );

      unlisteners.push(
        await listen<{ nodeId: string }>('p2p:peer-left', (event) => {
          removePeer(event.payload.nodeId);
        })
      );

      unlisteners.push(
        await listen<ImageLockInfo>('p2p:image-locked', (event) => {
          setImageLock(event.payload);
        })
      );

      unlisteners.push(
        await listen<{ imageId: string }>('p2p:image-unlocked', (event) => {
          removeImageLock(event.payload.imageId);
        })
      );

      unlisteners.push(
        await listen<{ imageId: string; annotations: unknown[]; from: string }>(
          'p2p:annotations-synced',
          (_event) => {
            // El frontend puede refrescar la imagen si está abierta
          }
        )
      );

      unlisteners.push(
        await listen<SyncProgress>('p2p:sync-progress', (event) => {
          setSyncProgress(event.payload);
        })
      );

      unlisteners.push(
        await listen<BatchInfo>('p2p:batch-assigned', (event) => {
          addBatch(event.payload);
        })
      );

      unlisteners.push(
        await listen<{ status: SessionStatus }>('p2p:session-status', (event) => {
          updateSessionStatus(event.payload.status);
        })
      );

      unlisteners.push(
        await listen<SessionRules>('p2p:rules-updated', (event) => {
          updateRules(event.payload);
        })
      );
    };

    setup();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [activeSession?.sessionId]);

  return { activeSession };
}
