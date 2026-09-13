import { useCallback } from 'react';
import { VideoTrack } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { useTauriQuery } from '@/hooks/useTauriQuery';
import type { TrackingResult } from '@/lib/tauriDb';

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
    return videoService.createTrack(currentProjectId, currentVideoId, classId, label);
  }, [currentVideoId, currentProjectId]);

  const deleteTrack = useCallback(async (trackId: string) => {
    if (!currentVideoId || !currentProjectId) return;
    await videoService.deleteTrack(currentProjectId, trackId, currentVideoId);
  }, [currentVideoId, currentProjectId]);

  const updateTrack = useCallback(async (trackId: string, updates: { classId?: number; label?: string; enabled?: boolean; interpolation?: string; extend?: string }) => {
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

  /** Propaga la caja de un track hacia adelante con el seguidor. */
  const trackForward = useCallback(async (
    trackId: string, fromFrame: number, maxFrames: number,
  ): Promise<TrackingResult | undefined> => {
    if (!currentVideoId || !currentProjectId) return undefined;
    return videoService.trackForward(currentProjectId, currentVideoId, trackId, fromFrame, maxFrames);
  }, [currentVideoId, currentProjectId]);

  const bake = useCallback(async (): Promise<number> => {
    if (!currentVideoId || !currentProjectId) return 0;
    return videoService.bake(currentProjectId, currentVideoId);
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
    trackForward,
    bake,
  };
}
