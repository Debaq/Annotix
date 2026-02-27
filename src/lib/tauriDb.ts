/**
 * tauriDb.ts - Puente entre el frontend React y el backend Rust via Tauri invoke()
 * Reemplaza Dexie.js/IndexedDB por comandos Tauri que acceden a SQLite.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type {
  Project,
  ClassDefinition,
  Annotation,
  TimeSeriesAnnotation,
} from './db';

// Re-export el tipo AnnotixImage adaptado para Tauri (sin Blob, con blobPath)
export interface TauriAnnotixImage {
  id?: number;
  projectId: number;
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
  id?: number;
  projectId: number;
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
): Promise<number> {
  return invoke<number>('create_project', {
    name,
    projectType,
    classes,
  });
}

export async function getProject(id: number): Promise<Project | null> {
  return invoke<Project | null>('get_project', { id });
}

export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>('list_projects');
}

export async function updateProject(
  id: number,
  updates: {
    name?: string;
    projectType?: string;
    classes?: ClassDefinition[];
  }
): Promise<void> {
  return invoke('update_project', { id, ...updates });
}

export async function deleteProject(id: number): Promise<void> {
  return invoke('delete_project', { id });
}

// ─── Image Commands ──────────────────────────────────────────────────────────

export async function uploadImages(
  projectId: number,
  filePaths: string[]
): Promise<number[]> {
  return invoke<number[]>('upload_images', { projectId, filePaths });
}

export async function uploadImageBytes(
  projectId: number,
  fileName: string,
  data: number[],
  annotations: Annotation[] = []
): Promise<number> {
  return invoke<number>('upload_image_bytes', {
    projectId,
    fileName,
    data,
    annotations,
  });
}

export async function getImage(id: number): Promise<TauriAnnotixImage | null> {
  return invoke<TauriAnnotixImage | null>('get_image', { id });
}

export async function listImagesByProject(
  projectId: number
): Promise<TauriAnnotixImage[]> {
  return invoke<TauriAnnotixImage[]>('list_images_by_project', { projectId });
}

export async function getImageData(id: number): Promise<number[]> {
  return invoke<number[]>('get_image_data', { id });
}

export async function getImageFilePath(id: number): Promise<string> {
  return invoke<string>('get_image_file_path', { id });
}

export async function saveAnnotations(
  imageId: number,
  annotations: Annotation[]
): Promise<void> {
  return invoke('save_annotations', { imageId, annotations });
}

export async function deleteImage(id: number): Promise<void> {
  return invoke('delete_image', { id });
}

// ─── TimeSeries Commands ─────────────────────────────────────────────────────

export async function createTimeseries(
  projectId: number,
  name: string,
  data: unknown
): Promise<number> {
  return invoke<number>('create_timeseries', { projectId, name, data });
}

export async function getTimeseries(
  id: number
): Promise<TauriTimeSeriesRecord | null> {
  return invoke<TauriTimeSeriesRecord | null>('get_timeseries', { id });
}

export async function listTimeseriesByProject(
  projectId: number
): Promise<TauriTimeSeriesRecord[]> {
  return invoke<TauriTimeSeriesRecord[]>('list_timeseries_by_project', {
    projectId,
  });
}

export async function saveTsAnnotations(
  timeseriesId: number,
  annotations: TimeSeriesAnnotation[]
): Promise<void> {
  return invoke('save_ts_annotations', { timeseriesId, annotations });
}

export async function deleteTimeseries(id: number): Promise<void> {
  return invoke('delete_timeseries', { id });
}

// ─── Storage Commands ────────────────────────────────────────────────────────

export async function getStorageInfo(): Promise<StorageInfo> {
  return invoke<StorageInfo>('get_storage_info');
}

// ─── Event Listeners (reactividad) ──────────────────────────────────────────

export function onProjectsChanged(callback: () => void): Promise<UnlistenFn> {
  return listen('db:projects-changed', () => callback());
}

export function onImagesChanged(
  callback: (projectId: number) => void
): Promise<UnlistenFn> {
  return listen<number>('db:images-changed', (event) =>
    callback(event.payload)
  );
}

export function onTimeseriesChanged(
  callback: (projectId: number) => void
): Promise<UnlistenFn> {
  return listen<number>('db:timeseries-changed', (event) =>
    callback(event.payload)
  );
}
