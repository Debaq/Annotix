export type PeerRole = 'lead_researcher' | 'annotator' | 'data_curator';
export type LockMode = 'individual' | 'batch';
export type SessionStatus = 'connecting' | 'syncing' | 'connected' | 'disconnected' | 'error';

export interface SessionRules {
  lockMode: LockMode;
  canUpload: boolean;
  canEditClasses: boolean;
  canDelete: boolean;
  canExport: boolean;
  requireDataApproval: boolean;
}

export interface PeerInfo {
  nodeId: string;
  displayName: string;
  role: PeerRole;
  joinedAt: number;
  online: boolean;
  lastSeen?: number;
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

export interface DownloadProgress {
  projectId: string;
  current: number;
  total: number;
}

export interface WorkAssignment {
  nodeId: string;
  displayName: string;
  videoIds: string[];
  imageIds: string[];
  updatedAt: number;
}

export interface WorkDistribution {
  version: number;
  assignments: WorkAssignment[];
  createdBy: string;
  createdAt: number;
}

export interface PeerWorkStats {
  nodeId: string;
  displayName: string;
  videosAssigned: number;
  videosCompleted: number;
  imagesAssigned: number;
  imagesCompleted: number;
  progressPercent: number;
}

export interface PendingApproval {
  itemId: string;
  itemType: 'image' | 'video';
  submittedBy: string;
  submittedByName: string;
  submittedAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

export type P2pPermission = 'annotate' | 'upload_data' | 'export' | 'edit_classes' | 'delete' | 'manage';
