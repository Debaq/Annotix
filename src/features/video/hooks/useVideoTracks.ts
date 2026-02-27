import { useCallback } from 'react';
import { VideoTrack } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useVideoTracks() {
  const { currentVideoId } = useUIStore();

  const { data: tracks, isLoading, reload } = useTauriQuery(
    async () => {
      if (!currentVideoId) return [];
      return videoService.listTracks(currentVideoId);
    },
    [currentVideoId],
    ['db:tracks-changed']
  );

  const createTrack = useCallback(async (classId: number, label?: string) => {
    if (!currentVideoId) return;
    const trackUuid = crypto.randomUUID();
    await videoService.createTrack(currentVideoId, trackUuid, classId, label);
  }, [currentVideoId]);

  const deleteTrack = useCallback(async (trackId: number) => {
    if (!currentVideoId) return;
    await videoService.deleteTrack(trackId, currentVideoId);
  }, [currentVideoId]);

  const updateTrack = useCallback(async (trackId: number, updates: { classId?: number; label?: string; enabled?: boolean }) => {
    if (!currentVideoId) return;
    await videoService.updateTrack(trackId, currentVideoId, updates);
  }, [currentVideoId]);

  const setKeyframe = useCallback(async (
    trackId: number, frameIndex: number,
    bboxX: number, bboxY: number, bboxWidth: number, bboxHeight: number
  ) => {
    if (!currentVideoId) return;
    await videoService.setKeyframe(trackId, currentVideoId, frameIndex, bboxX, bboxY, bboxWidth, bboxHeight);
  }, [currentVideoId]);

  const removeKeyframe = useCallback(async (trackId: number, frameIndex: number) => {
    if (!currentVideoId) return;
    await videoService.deleteKeyframe(trackId, currentVideoId, frameIndex);
  }, [currentVideoId]);

  const toggleKeyframe = useCallback(async (trackId: number, frameIndex: number, enabled: boolean) => {
    if (!currentVideoId) return;
    await videoService.toggleKeyframeEnabled(trackId, currentVideoId, frameIndex, enabled);
  }, [currentVideoId]);

  const bake = useCallback(async () => {
    if (!currentVideoId) return;
    await videoService.bake(currentVideoId);
  }, [currentVideoId]);

  return {
    tracks: (tracks || []) as VideoTrack[],
    isLoading,
    reload,
    createTrack,
    deleteTrack,
    updateTrack,
    setKeyframe,
    removeKeyframe,
    toggleKeyframe,
    bake,
  };
}
