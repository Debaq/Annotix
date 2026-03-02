import { create } from 'zustand';
import type { P2pSessionInfo, PeerInfo, ImageLockInfo, BatchInfo, SessionStatus, SyncProgress, SessionRules } from '../types';

interface P2pStore {
  activeSession: P2pSessionInfo | null;
  setActiveSession: (session: P2pSessionInfo | null) => void;
  updateSessionStatus: (status: SessionStatus) => void;
  updateRules: (rules: SessionRules) => void;

  peers: PeerInfo[];
  addPeer: (peer: PeerInfo) => void;
  removePeer: (nodeId: string) => void;
  setPeers: (peers: PeerInfo[]) => void;

  imageLocks: Map<string, ImageLockInfo>;
  setImageLock: (lock: ImageLockInfo) => void;
  removeImageLock: (imageId: string) => void;
  isImageLocked: (imageId: string) => boolean;
  isImageLockedByMe: (imageId: string) => boolean;

  batches: BatchInfo[];
  addBatch: (batch: BatchInfo) => void;
  myBatchImageIds: () => string[];

  syncProgress: SyncProgress | null;
  setSyncProgress: (progress: SyncProgress | null) => void;

  reset: () => void;
}

export const useP2pStore = create<P2pStore>((set, get) => ({
  activeSession: null,
  setActiveSession: (session) => set({ activeSession: session }),
  updateSessionStatus: (status) => set((state) => ({
    activeSession: state.activeSession ? { ...state.activeSession, status } : null,
  })),
  updateRules: (rules) => set((state) => ({
    activeSession: state.activeSession ? { ...state.activeSession, rules } : null,
  })),

  peers: [],
  addPeer: (peer) => set((state) => {
    const exists = state.peers.find(p => p.nodeId === peer.nodeId);
    if (exists) {
      return { peers: state.peers.map(p => p.nodeId === peer.nodeId ? peer : p) };
    }
    return { peers: [...state.peers, peer] };
  }),
  removePeer: (nodeId) => set((state) => ({
    peers: state.peers.filter(p => p.nodeId !== nodeId),
  })),
  setPeers: (peers) => set({ peers }),

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
    const session = get().activeSession;
    if (!lock || !session) return false;
    return lock.lockedBy === session.myNodeId && lock.expiresAt > Date.now();
  },

  batches: [],
  addBatch: (batch) => set((state) => ({
    batches: [...state.batches, batch],
  })),
  myBatchImageIds: () => {
    const state = get();
    if (!state.activeSession) return [];
    return state.batches
      .filter(b => b.assignedTo === state.activeSession!.myNodeId)
      .flatMap(b => b.imageIds);
  },

  syncProgress: null,
  setSyncProgress: (progress) => set({ syncProgress: progress }),

  reset: () => set({
    activeSession: null,
    peers: [],
    imageLocks: new Map(),
    batches: [],
    syncProgress: null,
  }),
}));
