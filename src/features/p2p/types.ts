export type PeerRole = 'host' | 'collaborator';
export type LockMode = 'individual' | 'batch';
export type SessionStatus = 'connecting' | 'syncing' | 'connected' | 'disconnected' | 'error';

export interface SessionRules {
  lockMode: LockMode;
  canUpload: boolean;
  canEditClasses: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export interface PeerInfo {
  nodeId: string;
  displayName: string;
  role: PeerRole;
  joinedAt: number;
  online: boolean;
}

export interface ImageLockInfo {
  imageId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: number;
  expiresAt: number;
}

export interface BatchInfo {
  id: string;
  imageIds: string[];
  assignedTo: string;
  assignedToName: string;
  createdAt: number;
}

export interface P2pSessionInfo {
  sessionId: string;
  projectId: string;
  projectName: string;
  shareCode: string;
  hostKey: string | null;
  role: PeerRole;
  rules: SessionRules;
  myNodeId: string;
  myDisplayName: string;
  peers: PeerInfo[];
  status: SessionStatus;
}

export interface SyncProgress {
  current: number;
  total: number;
  phase: 'downloading' | 'syncing';
}
