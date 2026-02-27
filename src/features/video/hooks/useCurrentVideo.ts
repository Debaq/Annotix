import { Video } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useCurrentVideo() {
  const { currentVideoId } = useUIStore();

  const { data: video, isLoading, reload } = useTauriQuery(
    async () => {
      if (!currentVideoId) return null;
      return videoService.get(currentVideoId);
    },
    [currentVideoId],
    ['db:videos-changed']
  );

  return { video: video as Video | null, isLoading, reload };
}
