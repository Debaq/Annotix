import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useVideoFrames() {
  const { currentVideoId } = useUIStore();

  const { data: frames, isLoading, reload } = useTauriQuery(
    async () => {
      if (!currentVideoId) return [];
      return videoService.listFrames(currentVideoId);
    },
    [currentVideoId],
    ['db:images-changed']
  );

  return { frames: (frames || []) as AnnotixImage[], isLoading, reload };
}
