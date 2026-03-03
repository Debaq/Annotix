import { invoke } from '@tauri-apps/api/core';
import type { P2pSessionInfo, PeerInfo, ImageLockInfo, BatchInfo, SessionRules, WorkDistribution, PeerWorkStats } from '../types';

export const p2pService = {
  createSession(projectId: string, displayName: string, rules: SessionRules): Promise<P2pSessionInfo> {
    return invoke('p2p_create_session', { projectId, displayName, rules });
  },

  joinSession(shareCode: string, displayName: string): Promise<P2pSessionInfo> {
    return invoke('p2p_join_session', { shareCode, displayName });
  },

  leaveSession(): Promise<void> {
    return invoke('p2p_leave_session');
  },

  getSessionInfo(): Promise<P2pSessionInfo | null> {
    return invoke('p2p_get_session_info');
  },

  lockImage(imageId: string): Promise<boolean> {
    return invoke('p2p_lock_image', { imageId });
  },

  unlockImage(imageId: string): Promise<void> {
    return invoke('p2p_unlock_image', { imageId });
  },

  getImageLock(imageId: string): Promise<ImageLockInfo | null> {
    return invoke('p2p_get_image_lock', { imageId });
  },

  assignBatch(imageIds: string[], assignTo: string): Promise<BatchInfo> {
    return invoke('p2p_assign_batch', { imageIds, assignTo });
  },

  syncAnnotations(imageId: string, annotations: unknown[]): Promise<void> {
    return invoke('p2p_sync_annotations', { imageId, annotations });
  },

  listPeers(): Promise<PeerInfo[]> {
    return invoke('p2p_list_peers');
  },

  updateRules(rules: SessionRules): Promise<void> {
    return invoke('p2p_update_rules', { rules });
  },

  getRules(): Promise<SessionRules> {
    return invoke('p2p_get_rules');
  },

  resumeDownload(projectId: string): Promise<void> {
    return invoke('p2p_resume_download', { projectId });
  },

  distributeWork(): Promise<WorkDistribution> {
    return invoke('p2p_distribute_work');
  },

  adjustAssignment(itemIds: string[], itemType: 'video' | 'image', targetNodeId: string): Promise<WorkDistribution> {
    return invoke('p2p_adjust_assignment', { itemIds, itemType, targetNodeId });
  },

  getDistribution(): Promise<WorkDistribution | null> {
    return invoke('p2p_get_distribution');
  },

  getWorkStats(): Promise<PeerWorkStats[]> {
    return invoke('p2p_get_work_stats');
  },
};
