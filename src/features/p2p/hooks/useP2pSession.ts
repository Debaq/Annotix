import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from '@/hooks/use-toast';
import { useP2pStore } from '../store/p2pStore';
import type { P2pSessionInfo, ImageLockInfo, PeerInfo, BatchInfo, SyncProgress, SessionStatus, SessionRules, DownloadProgress, WorkDistribution, PendingApproval } from '../types';
import { p2pService } from '../services/p2pService';

export function useP2pSession() {
  const {
    setSession,
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

  // Listeners globales
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    // Consultar proactivamente si ya hay sesiones activas
    p2pService.getAllSessions().then(async (sessions) => {
      for (const session of sessions) {
        setSession(session.projectId, session);
        try {
          const dist = await p2pService.getDistribution(session.projectId);
          if (dist) setDistribution(session.projectId, dist);
        } catch { /* ignore */ }
      }
    }).catch(() => {});

    listen<P2pSessionInfo>('p2p:session-restored', async (event) => {
      const session = event.payload;
      setSession(session.projectId, session);
      try {
        const dist = await p2pService.getDistribution(session.projectId);
        if (dist) setDistribution(session.projectId, dist);
      } catch { /* ignore */ }
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

  // Session-dependent listeners - ahora son globales (los eventos incluyen projectId)
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      unlisteners.push(
        await listen<PeerInfo & { projectId: string }>('p2p:peer-joined', (event) => {
          const { projectId, ...peer } = event.payload;
          addPeer(projectId, { ...peer, online: true });
          if (peer.displayName) {
            toast({ title: 'P2P', description: `${peer.displayName} joined` });
          }
        })
      );

      unlisteners.push(
        await listen<{ projectId: string; nodeId: string }>('p2p:peer-left', (event) => {
          const { projectId, nodeId } = event.payload;
          const peers = useP2pStore.getState().peersByProject[projectId] ?? [];
          const peer = peers.find(p => p.nodeId === nodeId);
          removePeer(projectId, nodeId);
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
        await listen<BatchInfo & { projectId: string }>('p2p:batch-assigned', (event) => {
          const { projectId, ...batch } = event.payload;
          addBatch(projectId, batch);
        })
      );

      unlisteners.push(
        await listen<{ projectId: string; status: SessionStatus }>('p2p:session-status', (event) => {
          updateSessionStatus(event.payload.projectId, event.payload.status);
        })
      );

      unlisteners.push(
        await listen<{ projectId: string; reason: string }>('p2p:host-stopped', (event) => {
          setHostStopped(event.payload.projectId, true);
          toast({
            title: 'P2P',
            description: 'The host has stopped the session',
            variant: 'destructive',
          });
        })
      );

      unlisteners.push(
        await listen<SessionRules & { projectId: string }>('p2p:rules-updated', (event) => {
          const { projectId, ...rules } = event.payload;
          updateRules(projectId, rules);
        })
      );

      unlisteners.push(
        await listen<WorkDistribution & { projectId: string }>('p2p:distribution-updated', (event) => {
          const { projectId, ...dist } = event.payload;
          setDistribution(projectId, dist);
        })
      );

      // Listeners para roles y aprobacion de datos
      unlisteners.push(
        await listen<PeerInfo & { projectId: string }>('p2p:peer-role-changed', (event) => {
          const { projectId, ...peer } = event.payload;
          addPeer(projectId, peer);
        })
      );

      unlisteners.push(
        await listen<PendingApproval & { projectId: string }>('p2p:data-submitted', (event) => {
          const { projectId, ...approval } = event.payload;
          addPendingApproval(projectId, approval);
        })
      );

      unlisteners.push(
        await listen<{ projectId: string; itemId: string }>('p2p:data-approved', (event) => {
          removePendingApproval(event.payload.projectId, event.payload.itemId);
        })
      );

      unlisteners.push(
        await listen<{ projectId: string; itemId: string }>('p2p:data-rejected', (event) => {
          removePendingApproval(event.payload.projectId, event.payload.itemId);
        })
      );
    };

    setup();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  // Verificar presencia de peers cada 15s (itera sobre todas las sesiones)
  useEffect(() => {
    const interval = setInterval(() => {
      const { peersByProject, setPeers } = useP2pStore.getState();
      const now = Date.now();
      const TIMEOUT = 90_000;

      for (const [projectId, peers] of Object.entries(peersByProject)) {
        let changed = false;
        const updated = peers.map(p => {
          if (p.online && p.lastSeen && now - p.lastSeen > TIMEOUT) {
            changed = true;
            return { ...p, online: false };
          }
          return p;
        });
        if (changed) {
          setPeers(projectId, updated);
        }
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, []);

  const sessions = useP2pStore(s => s.sessions);
  return { sessions };
}
