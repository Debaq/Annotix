import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from '@/hooks/use-toast';
import { useP2pStore } from '../store/p2pStore';
import type { P2pSessionInfo, ImageLockInfo, PeerInfo, BatchInfo, SyncProgress, SessionStatus, SessionRules, DownloadProgress, WorkDistribution, PendingApproval } from '../types';
import { p2pService } from '../services/p2pService';

export function useP2pSession() {
  const {
    activeSession,
    setActiveSession,
    setImageLock,
    removeImageLock,
    addPeer,
    removePeer,
    addBatch,
    setSyncProgress,
    updateSessionStatus,
    updateRules,
    setDownloadProgress,
    clearDownloadProgress,
    setDistribution,
    addPendingApproval,
    removePendingApproval,
    setHostStopped,
  } = useP2pStore();

  // Listeners globales (no dependen de activeSession)
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    // Consultar proactivamente si ya hay sesión activa (evita race condition con evento)
    p2pService.getSessionInfo().then(async (session) => {
      if (session) {
        setActiveSession(session);
        try {
          const dist = await p2pService.getDistribution();
          if (dist) setDistribution(dist);
        } catch {}
      }
    }).catch(() => {});

    listen<P2pSessionInfo>('p2p:session-restored', async (event) => {
      setActiveSession(event.payload);
      try {
        const dist = await p2pService.getDistribution();
        if (dist) setDistribution(dist);
      } catch {}
    }).then((fn) => unlisteners.push(fn));

    listen<DownloadProgress>('p2p:download-progress', (event) => {
      setDownloadProgress(event.payload);
    }).then((fn) => unlisteners.push(fn));

    listen<{ projectId: string }>('p2p:download-complete', (event) => {
      clearDownloadProgress(event.payload.projectId);
      toast({ title: 'P2P', description: 'Download complete' });
    }).then((fn) => unlisteners.push(fn));

    listen<{ projectId: string; imageId: string; error: string }>('p2p:download-error', (event) => {
      toast({
        title: 'P2P',
        description: `Download error: ${event.payload.error}`,
        variant: 'destructive',
      });
    }).then((fn) => unlisteners.push(fn));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!activeSession) return;

    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      unlisteners.push(
        await listen<PeerInfo>('p2p:peer-joined', (event) => {
          addPeer({ ...event.payload, online: true });
          if (event.payload.displayName) {
            toast({ title: 'P2P', description: `${event.payload.displayName} joined` });
          }
        })
      );

      unlisteners.push(
        await listen<{ nodeId: string }>('p2p:peer-left', (event) => {
          const { peers } = useP2pStore.getState();
          const peer = peers.find(p => p.nodeId === event.payload.nodeId);
          removePeer(event.payload.nodeId);
          if (peer?.displayName) {
            toast({ title: 'P2P', description: `${peer.displayName} left` });
          }
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
        await listen<{ reason: string }>('p2p:host-stopped', (_event) => {
          setHostStopped(true);
          toast({
            title: 'P2P',
            description: 'The host has stopped the session',
            variant: 'destructive',
          });
        })
      );

      unlisteners.push(
        await listen<SessionRules>('p2p:rules-updated', (event) => {
          updateRules(event.payload);
        })
      );

      unlisteners.push(
        await listen<WorkDistribution>('p2p:distribution-updated', (event) => {
          setDistribution(event.payload);
        })
      );

      // Nuevos listeners para roles y aprobación de datos
      unlisteners.push(
        await listen<PeerInfo>('p2p:peer-role-changed', (event) => {
          addPeer(event.payload);
        })
      );

      unlisteners.push(
        await listen<PendingApproval>('p2p:data-submitted', (event) => {
          addPendingApproval(event.payload);
        })
      );

      unlisteners.push(
        await listen<{ itemId: string }>('p2p:data-approved', (event) => {
          removePendingApproval(event.payload.itemId);
        })
      );

      unlisteners.push(
        await listen<{ itemId: string }>('p2p:data-rejected', (event) => {
          removePendingApproval(event.payload.itemId);
        })
      );
    };

    setup();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [activeSession?.sessionId]);

  // Verificar presencia de peers cada 15s
  useEffect(() => {
    if (!activeSession) return;

    const interval = setInterval(() => {
      const { peers, setPeers } = useP2pStore.getState();
      const now = Date.now();
      const TIMEOUT = 90_000; // 90 segundos
      let changed = false;
      const updated = peers.map(p => {
        if (p.online && p.lastSeen && now - p.lastSeen > TIMEOUT) {
          changed = true;
          return { ...p, online: false };
        }
        return p;
      });
      if (changed) {
        setPeers(updated);
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [activeSession?.sessionId]);

  return { activeSession };
}
