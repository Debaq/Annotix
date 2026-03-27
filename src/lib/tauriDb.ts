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
  Audio,
  AudioSegment,
  AudioEvent,
  TtsSentence,
  LlmConfig,
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

export async function setProjectFolder(projectId: string, folder: string | null): Promise<void> {
  return invoke('set_project_folder', { projectId, folder });
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

export async function bakeVideoTracks(projectId: string, videoId: string): Promise<number> {
  return invoke<number>('bake_video_tracks', { projectId, videoId });
}

// ─── Audio Commands ─────────────────────────────────────────────────────────

export async function uploadAudio(
  projectId: string,
  filePath: string,
  durationMs: number,
  sampleRate: number,
  language?: string
): Promise<string> {
  return invoke<string>('upload_audio', { projectId, filePath, durationMs, sampleRate, language });
}

export async function getAudio(projectId: string, id: string): Promise<Audio | null> {
  return invoke<Audio | null>('get_audio', { projectId, id });
}

export async function listAudioByProject(projectId: string): Promise<Audio[]> {
  return invoke<Audio[]>('list_audio_by_project', { projectId });
}

export async function saveTranscription(
  projectId: string,
  audioId: string,
  transcription: string,
  speakerId?: string,
  language?: string
): Promise<void> {
  return invoke('save_transcription', { projectId, audioId, transcription, speakerId, language });
}

export async function deleteAudio(projectId: string, id: string): Promise<void> {
  return invoke('delete_audio', { projectId, id });
}

export async function getAudioFilePath(projectId: string, audioId: string): Promise<string> {
  return invoke<string>('get_audio_file_path', { projectId, audioId });
}

export async function getAudioData(projectId: string, audioId: string): Promise<number[]> {
  return invoke<number[]>('get_audio_data', { projectId, audioId });
}

export async function saveAudioAnnotation(
  projectId: string,
  audioId: string,
  data: {
    transcription?: string;
    speakerId?: string;
    language?: string;
    segments?: AudioSegment[];
    classId?: number | null;
    events?: AudioEvent[];
  }
): Promise<void> {
  return invoke('save_audio_annotation', {
    projectId,
    audioId,
    transcription: data.transcription ?? null,
    speakerId: data.speakerId ?? null,
    language: data.language ?? null,
    segments: data.segments ?? null,
    classId: data.classId ?? null,
    events: data.events ?? null,
  });
}

// ─── Audio Edit Commands ────────────────────────────────────────────────────

export async function audioTrim(
  projectId: string, audioId: string, startMs: number, endMs: number
): Promise<string> {
  return invoke<string>('audio_trim', { projectId, audioId, startMs, endMs });
}

export async function audioCut(
  projectId: string, audioId: string, startMs: number, endMs: number
): Promise<string> {
  return invoke<string>('audio_cut', { projectId, audioId, startMs, endMs });
}

export async function audioDeleteRange(
  projectId: string, audioId: string, startMs: number, endMs: number
): Promise<string> {
  return invoke<string>('audio_delete_range', { projectId, audioId, startMs, endMs });
}

export async function audioSplit(
  projectId: string, audioId: string, splitMs: number
): Promise<string[]> {
  return invoke<string[]>('audio_split', { projectId, audioId, splitMs });
}

export async function audioSilenceRange(
  projectId: string, audioId: string, startMs: number, endMs: number
): Promise<string> {
  return invoke<string>('audio_silence_range', { projectId, audioId, startMs, endMs });
}

export async function audioNormalize(
  projectId: string, audioId: string
): Promise<string> {
  return invoke<string>('audio_normalize', { projectId, audioId });
}

export async function audioEqualize(
  projectId: string, audioId: string, preset: string
): Promise<string> {
  return invoke<string>('audio_equalize', { projectId, audioId, preset });
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

export function onAudioChanged(
  callback: (projectId: string) => void
): Promise<UnlistenFn> {
  return listen<string>('db:audio-changed', (event) =>
    callback(event.payload)
  );
}

// ─── TTS Guided Recording Commands ─────────────────────────────────────────

export async function getTtsSentences(projectId: string): Promise<TtsSentence[]> {
  return invoke<TtsSentence[]>('get_tts_sentences', { projectId });
}

export async function saveTtsSentences(projectId: string, sentences: TtsSentence[]): Promise<void> {
  return invoke('save_tts_sentences', { projectId, sentences });
}

export async function saveTtsRecording(
  projectId: string,
  sentenceId: string,
  audioBase64: string,
  fileExt: string,
  durationMs: number,
  sampleRate: number,
): Promise<string> {
  return invoke<string>('save_tts_recording', {
    projectId, sentenceId, audioBase64, fileExt, durationMs, sampleRate,
  });
}

export async function linkTtsUpload(
  projectId: string,
  sentenceId: string,
  audioId: string,
): Promise<void> {
  return invoke('link_tts_upload', { projectId, sentenceId, audioId });
}

export async function getLlmConfig(): Promise<LlmConfig | null> {
  return invoke<LlmConfig | null>('get_llm_config');
}

export async function saveLlmConfig(llmConfig: LlmConfig): Promise<void> {
  return invoke('save_llm_config', { llmConfig });
}

export async function generateTtsWithLlm(
  language: string,
  count: number,
  domain: string,
  length: string,
): Promise<string[]> {
  return invoke<string[]>('generate_tts_with_llm', { language, count, domain, length });
}

export interface PhoneticAnalysis {
  available: boolean;
  foundPhonemes: string[];
  inventory: string[];
  missing: string[];
}

export async function analyzePhoneticCoverage(
  texts: string[],
  language: string,
): Promise<PhoneticAnalysis> {
  return invoke<PhoneticAnalysis>('analyze_phonetic_coverage', { texts, language });
}

export function onTtsChanged(
  callback: (projectId: string) => void
): Promise<UnlistenFn> {
  return listen<string>('db:tts-changed', (event) =>
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
