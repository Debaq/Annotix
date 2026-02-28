import { useCallback } from 'react';
import { VideoTrack } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useVideoTracks() {
  const { currentVideoId, currentProjectId } = useUIStore();

  const { data: tracks, isLoading, reload } = useTauriQuery(
    async () => {
      if (!currentVideoId || !currentProjectId) return [];
      return videoService.listTracks(currentProjectId, currentVideoId);
    },
    [currentVideoId, currentProjectId],
    ['db:tracks-changed']
  );

  const createTrack = useCallback(async (classId: number, label?: string): Promise<string | undefined> => {
    if (!currentVideoId || !currentProjectId) return undefined;
    const trackUuid = crypto.randomUUID();
    const backendId = await videoService.createTrack(currentProjectId, currentVideoId, trackUuid, classId, label);
    return backendId;
  }, [currentVideoId, currentProjectId]);

  const deleteTrack = useCallback(async (trackId: string) => {
    if (!currentVideoId || !currentProjectId) return;
    await videoService.deleteTrack(currentProjectId, trackId, currentVideoId);
  }, [currentVideoId, currentProjectId]);

  const updateTrack = useCallback(async (trackId: string, updates: { classId?: number; label?: string; enabled?: boolean }) => {
    if (!currentVideoId || !currentProjectId) return;
    await videoService.updateTrack(currentProjectId, trackId, currentVideoId, updates);
  }, [currentVideoId, currentProjectId]);

  const setKeyframe = useCallback(async (
    trackId: string, frameIndex: number,
    bboxX: number, bboxY: number, bboxWidth: number, bboxHeight: number
  ) => {
    if (!currentVideoId || !currentProjectId) return;
    await videoService.setKeyframe(currentProjectId, trackId, currentVideoId, frameIndex, bboxX, bboxY, bboxWidth, bboxHeight);
  }, [currentVideoId, currentProjectId]);

  const removeKeyframe = useCallback(async (trackId: string, frameIndex: number) => {
    if (!currentVideoId || !currentProjectId) return;
    await videoService.deleteKeyframe(currentProjectId, trackId, currentVideoId, frameIndex);
  }, [currentVideoId, currentProjectId]);

  const toggleKeyframe = useCallback(async (trackId: string, frameIndex: number, enabled: boolean) => {
    if (!currentVideoId || !currentProjectId) return;
    await videoService.toggleKeyframeEnabled(currentProjectId, trackId, currentVideoId, frameIndex, enabled);
  }, [currentVideoId, currentProjectId]);

  const bake = useCallback(async () => {
    if (!currentVideoId || !currentProjectId) return;
    await videoService.bake(currentProjectId, currentVideoId);
  }, [currentVideoId, currentProjectId]);

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
