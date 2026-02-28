import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useVideoFrames() {
  const { currentVideoId, currentProjectId } = useUIStore();

  const { data: frames, isLoading, reload } = useTauriQuery(
    async () => {
      if (!currentVideoId || !currentProjectId) return [];
      return videoService.listFrames(currentProjectId, currentVideoId);
    },
    [currentVideoId, currentProjectId],
    ['db:images-changed']
  );

  return { frames: (frames || []) as AnnotixImage[], isLoading, reload };
}
