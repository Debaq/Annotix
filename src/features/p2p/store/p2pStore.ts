import { create } from 'zustand';
import type { P2pSessionInfo, PeerInfo, ImageLockInfo, BatchInfo, SessionStatus, SyncProgress, SessionRules, DownloadProgress, WorkDistribution, WorkAssignment, PeerWorkStats, PendingApproval } from '../types';

interface P2pStore {
  sessions: Record<string, P2pSessionInfo>;
  setSession: (projectId: string, session: P2pSessionInfo | null) => void;
  updateSessionStatus: (projectId: string, status: SessionStatus) => void;
  updateRules: (projectId: string, rules: SessionRules) => void;

  hostStoppedByProject: Record<string, boolean>;
  setHostStopped: (projectId: string, stopped: boolean) => void;

  peersByProject: Record<string, PeerInfo[]>;
  addPeer: (projectId: string, peer: PeerInfo) => void;
  removePeer: (projectId: string, nodeId: string) => void;
  setPeers: (projectId: string, peers: PeerInfo[]) => void;

  imageLocks: Map<string, ImageLockInfo>;
  setImageLock: (lock: ImageLockInfo) => void;
  removeImageLock: (imageId: string) => void;
  isImageLocked: (imageId: string) => boolean;
  isImageLockedByMe: (imageId: string) => boolean;

  batchesByProject: Record<string, BatchInfo[]>;
  addBatch: (projectId: string, batch: BatchInfo) => void;
  myBatchImageIds: (projectId: string) => string[];

  syncProgress: SyncProgress | null;
  setSyncProgress: (progress: SyncProgress | null) => void;

  downloadProgress: Record<string, DownloadProgress>;
  setDownloadProgress: (progress: DownloadProgress) => void;
  clearDownloadProgress: (projectId: string) => void;

  distributionByProject: Record<string, WorkDistribution>;
  setDistribution: (projectId: string, dist: WorkDistribution | null) => void;
  workStatsByProject: Record<string, PeerWorkStats[]>;
  setWorkStats: (projectId: string, stats: PeerWorkStats[]) => void;

  pendingApprovalsByProject: Record<string, PendingApproval[]>;
  setPendingApprovals: (projectId: string, approvals: PendingApproval[]) => void;
  addPendingApproval: (projectId: string, approval: PendingApproval) => void;
  removePendingApproval: (projectId: string, itemId: string) => void;

  myAssignment: (projectId: string) => WorkAssignment | null;
  isItemAssignedToMe: (projectId: string, id: string, type: 'video' | 'image') => boolean;
  getItemAssignee: (projectId: string, id: string, type: 'video' | 'image') => { nodeId: string; displayName: string } | null;

  reset: (projectId?: string) => void;
}

export const useP2pStore = create<P2pStore>((set, get) => ({
  sessions: {},
  setSession: (projectId, session) => set((state) => {
    if (session) {
      return { sessions: { ...state.sessions, [projectId]: session } };
    }
    const { [projectId]: _, ...rest } = state.sessions;
    return { sessions: rest };
  }),
  updateSessionStatus: (projectId, status) => set((state) => {
    const session = state.sessions[projectId];
    if (!session) return state;
    return { sessions: { ...state.sessions, [projectId]: { ...session, status } } };
  }),
  updateRules: (projectId, rules) => set((state) => {
    const session = state.sessions[projectId];
    if (!session) return state;
    return { sessions: { ...state.sessions, [projectId]: { ...session, rules } } };
  }),

  hostStoppedByProject: {},
  setHostStopped: (projectId, stopped) => set((state) => ({
    hostStoppedByProject: { ...state.hostStoppedByProject, [projectId]: stopped },
  })),

  peersByProject: {},
  addPeer: (projectId, peer) => set((state) => {
    const peers = state.peersByProject[projectId] ?? [];
    const exists = peers.find(p => p.nodeId === peer.nodeId);
    if (exists) {
      return {
        peersByProject: {
          ...state.peersByProject,
          [projectId]: peers.map(p => p.nodeId === peer.nodeId ? { ...p, ...peer, online: true, lastSeen: peer.lastSeen || Date.now() } : p),
        },
      };
    }
    return {
      peersByProject: {
        ...state.peersByProject,
        [projectId]: [...peers, { ...peer, online: true, lastSeen: peer.lastSeen || Date.now() }],
      },
    };
  }),
  removePeer: (projectId, nodeId) => set((state) => ({
    peersByProject: {
      ...state.peersByProject,
      [projectId]: (state.peersByProject[projectId] ?? []).filter(p => p.nodeId !== nodeId),
    },
  })),
  setPeers: (projectId, peers) => set((state) => ({
    peersByProject: { ...state.peersByProject, [projectId]: peers },
  })),

  imageLocks: new Map(),
  setImageLock: (lock) => set((state) => {
    const newLocks = new Map(state.imageLocks);
    newLocks.set(lock.imageId, lock);
    return { imageLocks: newLocks };
  }),
  removeImageLock: (imageId) => set((state) => {
    const newLocks = new Map(state.imageLocks);
    newLocks.delete(imageId);
    return { imageLocks: newLocks };
  }),
  isImageLocked: (imageId) => {
    const lock = get().imageLocks.get(imageId);
    if (!lock) return false;
    return lock.expiresAt > Date.now();
  },
  isImageLockedByMe: (imageId) => {
    const lock = get().imageLocks.get(imageId);
    if (!lock) return false;
    // Check if any session owns this lock
    const sessions = get().sessions;
    for (const session of Object.values(sessions)) {
      if (lock.lockedBy === session.myNodeId && lock.expiresAt > Date.now()) {
        return true;
      }
    }
    return false;
  },

  batchesByProject: {},
  addBatch: (projectId, batch) => set((state) => ({
    batchesByProject: {
      ...state.batchesByProject,
      [projectId]: [...(state.batchesByProject[projectId] ?? []), batch],
    },
  })),
  myBatchImageIds: (projectId) => {
    const state = get();
    const session = state.sessions[projectId];
    if (!session) return [];
    return (state.batchesByProject[projectId] ?? [])
      .filter(b => b.assignedTo === session.myNodeId)
      .flatMap(b => b.imageIds);
  },

  syncProgress: null,
  setSyncProgress: (progress) => set({ syncProgress: progress }),

  downloadProgress: {},
  setDownloadProgress: (progress) => set((state) => ({
    downloadProgress: { ...state.downloadProgress, [progress.projectId]: progress },
  })),
  clearDownloadProgress: (projectId) => set((state) => {
    const { [projectId]: _, ...rest } = state.downloadProgress;
    return { downloadProgress: rest };
  }),

  distributionByProject: {},
  setDistribution: (projectId, dist) => set((state) => {
    if (dist) {
      return { distributionByProject: { ...state.distributionByProject, [projectId]: dist } };
    }
    const { [projectId]: _, ...rest } = state.distributionByProject;
    return { distributionByProject: rest };
  }),
  workStatsByProject: {},
  setWorkStats: (projectId, stats) => set((state) => ({
    workStatsByProject: { ...state.workStatsByProject, [projectId]: stats },
  })),

  pendingApprovalsByProject: {},
  setPendingApprovals: (projectId, approvals) => set((state) => ({
    pendingApprovalsByProject: { ...state.pendingApprovalsByProject, [projectId]: approvals },
  })),
  addPendingApproval: (projectId, approval) => set((state) => {
    const approvals = state.pendingApprovalsByProject[projectId] ?? [];
    const exists = approvals.find(a => a.itemId === approval.itemId);
    if (exists) {
      return {
        pendingApprovalsByProject: {
          ...state.pendingApprovalsByProject,
          [projectId]: approvals.map(a => a.itemId === approval.itemId ? approval : a),
        },
      };
    }
    return {
      pendingApprovalsByProject: {
        ...state.pendingApprovalsByProject,
        [projectId]: [...approvals, approval],
      },
    };
  }),
  removePendingApproval: (projectId, itemId) => set((state) => ({
    pendingApprovalsByProject: {
      ...state.pendingApprovalsByProject,
      [projectId]: (state.pendingApprovalsByProject[projectId] ?? []).filter(a => a.itemId !== itemId),
    },
  })),

  myAssignment: (projectId) => {
    const state = get();
    const dist = state.distributionByProject[projectId];
    const session = state.sessions[projectId];
    if (!dist || !session) return null;
    return dist.assignments.find(a => a.nodeId === session.myNodeId) || null;
  },

  isItemAssignedToMe: (projectId, id, type) => {
    const state = get();
    const dist = state.distributionByProject[projectId];
    const session = state.sessions[projectId];
    if (!dist || !session) return true;
    const my = dist.assignments.find(a => a.nodeId === session.myNodeId);
    if (!my) return false;
    return type === 'video' ? my.videoIds.includes(id) : my.imageIds.includes(id);
  },

  getItemAssignee: (projectId, id, type) => {
    const state = get();
    const dist = state.distributionByProject[projectId];
    if (!dist) return null;
    for (const a of dist.assignments) {
      const found = type === 'video'
        ? a.videoIds.includes(id)
        : a.imageIds.includes(id);
      if (found) return { nodeId: a.nodeId, displayName: a.displayName };
    }
    return null;
  },

  reset: (projectId?: string) => {
    if (projectId) {
      set((state) => {
        const { [projectId]: _s, ...restSessions } = state.sessions;
        const { [projectId]: _p, ...restPeers } = state.peersByProject;
        const { [projectId]: _h, ...restHostStopped } = state.hostStoppedByProject;
        const { [projectId]: _b, ...restBatches } = state.batchesByProject;
        const { [projectId]: _d, ...restDist } = state.distributionByProject;
        const { [projectId]: _w, ...restStats } = state.workStatsByProject;
        const { [projectId]: _pa, ...restApprovals } = state.pendingApprovalsByProject;
        const { [projectId]: _dl, ...restDownload } = state.downloadProgress;
        return {
          sessions: restSessions,
          peersByProject: restPeers,
          hostStoppedByProject: restHostStopped,
          batchesByProject: restBatches,
          distributionByProject: restDist,
          workStatsByProject: restStats,
          pendingApprovalsByProject: restApprovals,
          downloadProgress: restDownload,
        };
      });
    } else {
      set({
        sessions: {},
        hostStoppedByProject: {},
        peersByProject: {},
        imageLocks: new Map(),
        batchesByProject: {},
        syncProgress: null,
        downloadProgress: {},
        distributionByProject: {},
        workStatsByProject: {},
        pendingApprovalsByProject: {},
      });
    }
  },
}));
