import type { Video, VideoTrack, AnnotixImage, VideoInfo } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const videoService = {
  async checkFfmpeg(): Promise<boolean> {
    return tauriDb.checkFfmpegAvailable();
  },

  async getVideoInfo(path: string): Promise<VideoInfo> {
    return tauriDb.getVideoInfo(path);
  },

  async upload(projectId: number, filePath: string, fpsExtraction: number): Promise<number> {
    return tauriDb.uploadVideo(projectId, filePath, fpsExtraction);
  },

  async extractFrames(projectId: number, videoId: number): Promise<number> {
    return tauriDb.extractVideoFrames(projectId, videoId);
  },

  async get(videoId: number): Promise<Video | null> {
    return tauriDb.getVideo(videoId);
  },

  async listByProject(projectId: number): Promise<Video[]> {
    return tauriDb.listVideosByProject(projectId);
  },

  async listFrames(videoId: number): Promise<AnnotixImage[]> {
    return tauriDb.listFramesByVideo(videoId);
  },

  async delete(videoId: number): Promise<void> {
    return tauriDb.deleteVideo(videoId);
  },

  // Track operations
  async createTrack(videoId: number, trackUuid: string, classId: number, label?: string): Promise<number> {
    return tauriDb.createTrack(videoId, trackUuid, classId, label);
  },

  async listTracks(videoId: number): Promise<VideoTrack[]> {
    return tauriDb.listTracksByVideo(videoId);
  },

  async updateTrack(trackId: number, videoId: number, updates: { classId?: number; label?: string; enabled?: boolean }): Promise<void> {
    return tauriDb.updateTrack(trackId, videoId, updates);
  },

  async deleteTrack(trackId: number, videoId: number): Promise<void> {
    return tauriDb.deleteTrack(trackId, videoId);
  },

  async setKeyframe(
    trackId: number, videoId: number, frameIndex: number,
    bboxX: number, bboxY: number, bboxWidth: number, bboxHeight: number
  ): Promise<number> {
    return tauriDb.setKeyframe(trackId, videoId, frameIndex, bboxX, bboxY, bboxWidth, bboxHeight);
  },

  async deleteKeyframe(trackId: number, videoId: number, frameIndex: number): Promise<void> {
    return tauriDb.deleteKeyframe(trackId, videoId, frameIndex);
  },

  async toggleKeyframeEnabled(trackId: number, videoId: number, frameIndex: number, enabled: boolean): Promise<void> {
    return tauriDb.toggleKeyframeEnabled(trackId, videoId, frameIndex, enabled);
  },

  async bake(videoId: number): Promise<void> {
    return tauriDb.bakeVideoTracks(videoId);
  },
};
