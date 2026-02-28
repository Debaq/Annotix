/**
 * tauriDb.ts - Puente entre el frontend React y el backend Rust via Tauri invoke()
 * Puente entre el frontend React y el backend Rust via Tauri invoke().
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type {
  Project,
  ClassDefinition,
  Annotation,
  TimeSeriesAnnotation,
  Video,
  VideoTrack,
  VideoInfo,
  AnnotixImage,
} from './db';

// Re-export el tipo AnnotixImage adaptado para Tauri (sin Blob, con blobPath)
export interface TauriAnnotixImage {
  id?: string;
  projectId: string;
  name: string;
  blobPath: string;
  width: number;
  height: number;
  annotations: Annotation[];
  metadata: {
    uploaded: number;
    annotated?: number;
    status: 'pending' | 'annotated' | 'reviewed';
  };
}

export interface TauriTimeSeriesRecord {
  id?: string;
  projectId: string;
  name: string;
  data: unknown;
  annotations: TimeSeriesAnnotation[];
  metadata: {
    uploaded: number;
    annotated?: number;
    status: string;
  };
}

export interface StorageInfo {
  usage: number;
  quota: number;
  percentage: number;
}

// ─── Project Commands ────────────────────────────────────────────────────────

export async function createProject(
  name: string,
  projectType: string,
  classes: ClassDefinition[]
): Promise<string> {
  return invoke<string>('create_project', {
    name,
    projectType,
    classes,
  });
}

export async function getProject(id: string): Promise<Project | null> {
  return invoke<Project | null>('get_project', { id });
}

export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>('list_projects');
}

export async function updateProject(
  id: string,
  updates: {
    name?: string;
    projectType?: string;
    classes?: ClassDefinition[];
  }
): Promise<void> {
  return invoke('update_project', { id, ...updates });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke('delete_project', { id });
}

// ─── Image Commands ──────────────────────────────────────────────────────────

export async function uploadImages(
  projectId: string,
  filePaths: string[]
): Promise<string[]> {
  return invoke<string[]>('upload_images', { projectId, filePaths });
}

export async function uploadImageBytes(
  projectId: string,
  fileName: string,
  data: number[],
  annotations: Annotation[] = []
): Promise<string> {
  return invoke<string>('upload_image_bytes', {
    projectId,
    fileName,
    data,
    annotations,
  });
}

export async function getImage(projectId: string, id: string): Promise<TauriAnnotixImage | null> {
  return invoke<TauriAnnotixImage | null>('get_image', { projectId, id });
}

export async function listImagesByProject(
  projectId: string
): Promise<TauriAnnotixImage[]> {
  return invoke<TauriAnnotixImage[]>('list_images_by_project', { projectId });
}

export async function getImageData(projectId: string, id: string): Promise<number[]> {
  return invoke<number[]>('get_image_data', { projectId, id });
}

export async function getImageFilePath(projectId: string, id: string): Promise<string> {
  return invoke<string>('get_image_file_path', { projectId, id });
}

export async function saveAnnotations(
  projectId: string,
  imageId: string,
  annotations: Annotation[]
): Promise<void> {
  return invoke('save_annotations', { projectId, imageId, annotations });
}

export async function deleteImage(projectId: string, id: string): Promise<void> {
  return invoke('delete_image', { projectId, id });
}

// ─── TimeSeries Commands ─────────────────────────────────────────────────────

export async function createTimeseries(
  projectId: string,
  name: string,
  data: unknown
): Promise<string> {
  return invoke<string>('create_timeseries', { projectId, name, data });
}

export async function getTimeseries(
  projectId: string,
  id: string
): Promise<TauriTimeSeriesRecord | null> {
  return invoke<TauriTimeSeriesRecord | null>('get_timeseries', { projectId, id });
}

export async function listTimeseriesByProject(
  projectId: string
): Promise<TauriTimeSeriesRecord[]> {
  return invoke<TauriTimeSeriesRecord[]>('list_timeseries_by_project', {
    projectId,
  });
}

export async function saveTsAnnotations(
  projectId: string,
  timeseriesId: string,
  annotations: TimeSeriesAnnotation[]
): Promise<void> {
  return invoke('save_ts_annotations', { projectId, timeseriesId, annotations });
}

export async function deleteTimeseries(projectId: string, id: string): Promise<void> {
  return invoke('delete_timeseries', { projectId, id });
}

// ─── Storage Commands ────────────────────────────────────────────────────────

export async function getStorageInfo(): Promise<StorageInfo> {
  return invoke<StorageInfo>('get_storage_info');
}

// ─── Video Commands ─────────────────────────────────────────────────────────

export async function getVideoInfo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>('get_video_info', { path });
}

export async function uploadVideo(
  projectId: string,
  filePath: string,
  fpsExtraction: number
): Promise<string> {
  return invoke<string>('upload_video', { projectId, filePath, fpsExtraction });
}

export async function extractVideoFrames(
  projectId: string,
  videoId: string
): Promise<number> {
  return invoke<number>('extract_video_frames', { projectId, videoId });
}

export async function getVideo(projectId: string, videoId: string): Promise<Video | null> {
  return invoke<Video | null>('get_video', { projectId, videoId });
}

export async function listVideosByProject(projectId: string): Promise<Video[]> {
  return invoke<Video[]>('list_videos_by_project', { projectId });
}

export async function listFramesByVideo(projectId: string, videoId: string): Promise<AnnotixImage[]> {
  return invoke<AnnotixImage[]>('list_frames_by_video', { projectId, videoId });
}

export async function deleteVideo(projectId: string, videoId: string): Promise<void> {
  return invoke('delete_video', { projectId, videoId });
}

export async function createTrack(
  projectId: string,
  videoId: string,
  trackUuid: string,
  classId: number,
  label?: string
): Promise<string> {
  return invoke<string>('create_track', { projectId, videoId, trackUuid, classId, label });
}

export async function listTracksByVideo(projectId: string, videoId: string): Promise<VideoTrack[]> {
  return invoke<VideoTrack[]>('list_tracks_by_video', { projectId, videoId });
}

export async function updateTrack(
  projectId: string,
  trackId: string,
  videoId: string,
  updates: { classId?: number; label?: string; enabled?: boolean }
): Promise<void> {
  return invoke('update_track', { projectId, trackId, videoId, ...updates });
}

export async function deleteTrack(projectId: string, trackId: string, videoId: string): Promise<void> {
  return invoke('delete_track', { projectId, trackId, videoId });
}

export async function setKeyframe(
  projectId: string,
  trackId: string,
  videoId: string,
  frameIndex: number,
  bboxX: number,
  bboxY: number,
  bboxWidth: number,
  bboxHeight: number
): Promise<string> {
  return invoke<string>('set_keyframe', {
    projectId, trackId, videoId, frameIndex, bboxX, bboxY, bboxWidth, bboxHeight,
  });
}

export async function deleteKeyframe(
  projectId: string,
  trackId: string,
  videoId: string,
  frameIndex: number
): Promise<void> {
  return invoke('delete_keyframe', { projectId, trackId, videoId, frameIndex });
}

export async function toggleKeyframeEnabled(
  projectId: string,
  trackId: string,
  videoId: string,
  frameIndex: number,
  enabled: boolean
): Promise<void> {
  return invoke('toggle_keyframe_enabled', { projectId, trackId, videoId, frameIndex, enabled });
}

export async function bakeVideoTracks(projectId: string, videoId: string): Promise<void> {
  return invoke('bake_video_tracks', { projectId, videoId });
}

// ─── Event Listeners (reactividad) ──────────────────────────────────────────

export function onProjectsChanged(callback: () => void): Promise<UnlistenFn> {
  return listen('db:projects-changed', () => callback());
}

export function onImagesChanged(
  callback: (projectId: string) => void
): Promise<UnlistenFn> {
  return listen<string>('db:images-changed', (event) =>
    callback(event.payload)
  );
}

export function onTimeseriesChanged(
  callback: (projectId: string) => void
): Promise<UnlistenFn> {
  return listen<string>('db:timeseries-changed', (event) =>
    callback(event.payload)
  );
}

export function onVideosChanged(
  callback: (projectId: string) => void
): Promise<UnlistenFn> {
  return listen<string>('db:videos-changed', (event) =>
    callback(event.payload)
  );
}

export function onTracksChanged(
  callback: (videoId: string) => void
): Promise<UnlistenFn> {
  return listen<string>('db:tracks-changed', (event) =>
    callback(event.payload)
  );
}
