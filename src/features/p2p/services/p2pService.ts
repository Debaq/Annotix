import { invoke } from '@tauri-apps/api/core';
import type { P2pSessionInfo, PeerInfo, PeerRole, ImageLockInfo, BatchInfo, SessionRules, WorkDistribution, PeerWorkStats, PendingApproval } from '../types';

export const p2pService = {
  createSession(projectId: string, displayName: string, rules: SessionRules): Promise<P2pSessionInfo> {
    return invoke('p2p_create_session', { projectId, displayName, rules });
  },

  joinSession(shareCode: string, displayName: string): Promise<P2pSessionInfo> {
    return invoke('p2p_join_session', { shareCode, displayName });
  },

  leaveSession(projectId: string): Promise<void> {
    return invoke('p2p_leave_session', { projectId });
  },

  pauseSession(projectId: string): Promise<string> {
    return invoke('p2p_pause_session', { projectId });
  },

  resumeSession(projectId: string): Promise<P2pSessionInfo> {
    return invoke('p2p_resume_session', { projectId });
  },

  getSessionInfo(projectId: string): Promise<P2pSessionInfo | null> {
    return invoke('p2p_get_session_info', { projectId });
  },

  getAllSessions(): Promise<P2pSessionInfo[]> {
    return invoke('p2p_get_all_sessions');
  },

  lockImage(projectId: string, imageId: string): Promise<boolean> {
    return invoke('p2p_lock_image', { projectId, imageId });
  },

  unlockImage(projectId: string, imageId: string): Promise<void> {
    return invoke('p2p_unlock_image', { projectId, imageId });
  },

  getImageLock(projectId: string, imageId: string): Promise<ImageLockInfo | null> {
    return invoke('p2p_get_image_lock', { projectId, imageId });
  },

  assignBatch(projectId: string, imageIds: string[], assignTo: string): Promise<BatchInfo> {
    return invoke('p2p_assign_batch', { projectId, imageIds, assignTo });
  },

  syncAnnotations(projectId: string, imageId: string, annotations: unknown[]): Promise<void> {
    return invoke('p2p_sync_annotations', { projectId, imageId, annotations });
  },

  listPeers(projectId: string): Promise<PeerInfo[]> {
    return invoke('p2p_list_peers', { projectId });
  },

  updateRules(projectId: string, rules: SessionRules): Promise<void> {
    return invoke('p2p_update_rules', { projectId, rules });
  },

  getRules(projectId: string): Promise<SessionRules> {
    return invoke('p2p_get_rules', { projectId });
  },

  resumeDownload(projectId: string): Promise<void> {
    return invoke('p2p_resume_download', { projectId });
  },

  distributeWork(projectId: string): Promise<WorkDistribution> {
    return invoke('p2p_distribute_work', { projectId });
  },

  adjustAssignment(projectId: string, itemIds: string[], itemType: 'video' | 'image', targetNodeId: string): Promise<WorkDistribution> {
    return invoke('p2p_adjust_assignment', { projectId, itemIds, itemType, targetNodeId });
  },

  getDistribution(projectId: string): Promise<WorkDistribution | null> {
    return invoke('p2p_get_distribution', { projectId });
  },

  getWorkStats(projectId: string): Promise<PeerWorkStats[]> {
    return invoke('p2p_get_work_stats', { projectId });
  },

  updatePeerRole(projectId: string, nodeId: string, newRole: PeerRole): Promise<void> {
    return invoke('p2p_update_peer_role', { projectId, nodeId, newRole });
  },

  submitData(projectId: string, itemId: string, itemType: string): Promise<void> {
    return invoke('p2p_submit_data', { projectId, itemId, itemType });
  },

  approveData(projectId: string, itemId: string): Promise<void> {
    return invoke('p2p_approve_data', { projectId, itemId });
  },

  rejectData(projectId: string, itemId: string): Promise<void> {
    return invoke('p2p_reject_data', { projectId, itemId });
  },

  listPendingApprovals(projectId: string): Promise<PendingApproval[]> {
    return invoke('p2p_list_pending_approvals', { projectId });
  },
};
