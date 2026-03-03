import { useP2pStore } from '../store/p2pStore';
import type { PeerRole, SessionRules, P2pPermission } from '../types';

export function canManage(role: PeerRole): boolean {
  return role === 'lead_researcher';
}

export function canAnnotate(role: PeerRole): boolean {
  return role === 'lead_researcher' || role === 'annotator';
}

export function canUploadData(role: PeerRole, rules?: SessionRules): boolean {
  if (role === 'lead_researcher') return true;
  return role === 'data_curator' || (rules?.canUpload ?? false);
}

export function canExport(role: PeerRole, rules?: SessionRules): boolean {
  if (role === 'lead_researcher') return true;
  return role === 'data_curator' || (rules?.canExport ?? false);
}

export function canEditClasses(role: PeerRole, rules?: SessionRules): boolean {
  if (role === 'lead_researcher') return true;
  return rules?.canEditClasses ?? false;
}

export function canDelete(role: PeerRole, rules?: SessionRules): boolean {
  if (role === 'lead_researcher') return true;
  return rules?.canDelete ?? false;
}

/**
 * Hook que verifica si el usuario tiene un permiso P2P específico.
 * Si no hay sesión activa (modo local), siempre retorna true.
 */
export function useP2pPermission(permission: P2pPermission): boolean {
  const activeSession = useP2pStore((s) => s.activeSession);

  if (!activeSession) return true;

  const { role, rules } = activeSession;

  switch (permission) {
    case 'annotate':
      return canAnnotate(role);
    case 'upload_data':
      return canUploadData(role, rules);
    case 'export':
      return canExport(role, rules);
    case 'edit_classes':
      return canEditClasses(role, rules);
    case 'delete':
      return canDelete(role, rules);
    case 'manage':
      return canManage(role);
    default:
      return false;
  }
}

export function useP2pCanEdit(itemId?: string, videoId?: string | null): boolean {
  const activeSession = useP2pStore((s) => s.activeSession);
  const distribution = useP2pStore((s) => s.distribution);
  const hostStopped = useP2pStore((s) => s.hostStopped);

  // Si no hay sesión activa, siempre permitir edición
  if (!activeSession) return true;

  // Si el host detuvo la sesión, bloquear edición para no-hosts
  if (hostStopped && activeSession.role !== 'lead_researcher') return false;

  // Si está desconectado, bloquear edición para no-hosts
  if (activeSession.status === 'disconnected' && activeSession.role !== 'lead_researcher') return false;

  if (!distribution) return true;
  if (!itemId) return true;

  const checkId = videoId || itemId;
  const checkType: 'video' | 'image' = videoId ? 'video' : 'image';

  return useP2pStore.getState().isItemAssignedToMe(checkId, checkType);
}
