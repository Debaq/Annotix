import type { Video, VideoTrack, AnnotixImage, VideoInfo } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

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
  async createTrack(projectId: string, videoId: string, trackUuid: string, classId: number, label?: string): Promise<string> {
    return tauriDb.createTrack(projectId, videoId, trackUuid, classId, label);
  },

  async listTracks(projectId: string, videoId: string): Promise<VideoTrack[]> {
    return tauriDb.listTracksByVideo(projectId, videoId);
  },

  async updateTrack(projectId: string, trackId: string, videoId: string, updates: { classId?: number; label?: string; enabled?: boolean }): Promise<void> {
    return tauriDb.updateTrack(projectId, trackId, videoId, updates);
  },

  async deleteTrack(projectId: string, trackId: string, videoId: string): Promise<void> {
    return tauriDb.deleteTrack(projectId, trackId, videoId);
  },

  async setKeyframe(
    projectId: string, trackId: string, videoId: string, frameIndex: number,
    bboxX: number, bboxY: number, bboxWidth: number, bboxHeight: number
  ): Promise<string> {
    return tauriDb.setKeyframe(projectId, trackId, videoId, frameIndex, bboxX, bboxY, bboxWidth, bboxHeight);
  },

  async deleteKeyframe(projectId: string, trackId: string, videoId: string, frameIndex: number): Promise<void> {
    return tauriDb.deleteKeyframe(projectId, trackId, videoId, frameIndex);
  },

  async toggleKeyframeEnabled(projectId: string, trackId: string, videoId: string, frameIndex: number, enabled: boolean): Promise<void> {
    return tauriDb.toggleKeyframeEnabled(projectId, trackId, videoId, frameIndex, enabled);
  },

  async bake(projectId: string, videoId: string): Promise<number> {
    return tauriDb.bakeVideoTracks(projectId, videoId);
  },
};
