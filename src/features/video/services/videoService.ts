import type { Video, VideoTrack, AnnotixImage, VideoInfo } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';
import { emitConsolidate, emitKeyframeSet } from '@/features/study/videoStudy';

export const videoService = {
  async getVideoInfo(path: string): Promise<VideoInfo> {
    return tauriDb.getVideoInfo(path);
  },

  async upload(projectId: string, filePath: string, fpsExtraction: number): Promise<string> {
    return tauriDb.uploadVideo(projectId, filePath, fpsExtraction);
  },

  async extractFrames(projectId: string, videoId: string): Promise<number> {
    return tauriDb.extractVideoFrames(projectId, videoId);
  },

  async cancelExtraction(videoId: string): Promise<boolean> {
    return tauriDb.cancelVideoExtraction(videoId);
  },

  async get(projectId: string, videoId: string): Promise<Video | null> {
    return tauriDb.getVideo(projectId, videoId);
  },

  async listByProject(projectId: string): Promise<Video[]> {
    return tauriDb.listVideosByProject(projectId);
  },

  async listFrames(projectId: string, videoId: string): Promise<AnnotixImage[]> {
    return tauriDb.listFramesByVideo(projectId, videoId);
  },

  async delete(projectId: string, videoId: string): Promise<void> {
    return tauriDb.deleteVideo(projectId, videoId);
  },

  // Track operations
  async createTrack(projectId: string, videoId: string, classId: number, label?: string): Promise<string> {
    return tauriDb.createTrack(projectId, videoId, classId, label);
  },

  async listTracks(projectId: string, videoId: string): Promise<VideoTrack[]> {
    return tauriDb.listTracksByVideo(projectId, videoId);
  },

  async updateTrack(projectId: string, trackId: string, videoId: string, updates: { classId?: number; label?: string; enabled?: boolean; interpolation?: string; extend?: string }): Promise<void> {
    return tauriDb.updateTrack(projectId, trackId, videoId, updates);
  },

  async deleteTrack(projectId: string, trackId: string, videoId: string): Promise<void> {
    return tauriDb.deleteTrack(projectId, trackId, videoId);
  },

  async setKeyframe(
    projectId: string, trackId: string, videoId: string, frameIndex: number,
    bboxX: number, bboxY: number, bboxWidth: number, bboxHeight: number
  ): Promise<void> {
    await tauriDb.setKeyframe(projectId, trackId, videoId, frameIndex, bboxX, bboxY, bboxWidth, bboxHeight);
    emitKeyframeSet(trackId, frameIndex);
  },

  async deleteKeyframe(projectId: string, trackId: string, videoId: string, frameIndex: number): Promise<void> {
    return tauriDb.deleteKeyframe(projectId, trackId, videoId, frameIndex);
  },

  async toggleKeyframeEnabled(projectId: string, trackId: string, videoId: string, frameIndex: number, enabled: boolean): Promise<void> {
    return tauriDb.toggleKeyframeEnabled(projectId, trackId, videoId, frameIndex, enabled);
  },

  async bake(projectId: string, videoId: string): Promise<number> {
    // Los conteos del evento `video.consolidate` se leen justo antes de
    // consolidar: después el bake ya escribió las anotaciones.
    const [tracks, frames] = await Promise.all([
      tauriDb.listTracksByVideo(projectId, videoId),
      tauriDb.listFramesByVideo(projectId, videoId),
    ]);
    const keyed = new Set<number>();
    for (const track of tracks) {
      for (const kf of track.keyframes ?? []) {
        if (kf.isKeyframe !== false) keyed.add(kf.frameIndex);
      }
    }
    const baked = await tauriDb.bakeVideoTracks(projectId, videoId);
    emitConsolidate({
      videoId,
      nTracks: tracks.length,
      nFramesTotal: frames.length,
      nFramesKeyed: keyed.size,
    });
    return baked;
  },

  async trackForward(
    projectId: string, videoId: string, trackId: string,
    fromFrame: number, maxFrames: number, minScore?: number
  ): Promise<tauriDb.TrackingResult> {
    return tauriDb.trackObjectForward(projectId, videoId, trackId, fromFrame, maxFrames, minScore);
  },
};
