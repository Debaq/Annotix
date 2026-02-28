import { Video } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useCurrentVideo() {
  const { currentVideoId, currentProjectId } = useUIStore();

  const { data: video, isLoading, reload } = useTauriQuery(
    async () => {
      if (!currentVideoId || !currentProjectId) return null;
      return videoService.get(currentProjectId, currentVideoId);
    },
    [currentVideoId, currentProjectId],
    ['db:videos-changed']
  );

  return { video: video as Video | null, isLoading, reload };
}
