import { useP2pStore } from '../store/p2pStore';

export function useP2pCanEdit(itemId?: string, videoId?: string | null): boolean {
  const activeSession = useP2pStore((s) => s.activeSession);
  const distribution = useP2pStore((s) => s.distribution);

  if (!activeSession || !distribution) return true;
  if (!itemId) return true;

  const checkId = videoId || itemId;
  const checkType: 'video' | 'image' = videoId ? 'video' : 'image';

  return useP2pStore.getState().isItemAssignedToMe(checkId, checkType);
}
