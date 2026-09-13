import { invoke } from '@tauri-apps/api/core';
import type { PatternPreview, SubjectSummary } from '../types';

export const subjectService = {
  getSummary(projectId: string): Promise<SubjectSummary> {
    return invoke('get_subject_summary', { projectId });
  },

  /** `null` borra el sujeto. Devuelve cuántas imágenes cambiaron de verdad. */
  setImageSubjects(
    projectId: string,
    imageIds: string[],
    subjectId: string | null,
  ): Promise<number> {
    return invoke('set_image_subjects', { projectId, imageIds, subjectId });
  },

  /** Marca el video y propaga a sus fotogramas ya extraídos. */
  setVideoSubject(
    projectId: string,
    videoId: string,
    subjectId: string | null,
  ): Promise<number> {
    return invoke('set_video_subject', { projectId, videoId, subjectId });
  },

  previewPattern(projectId: string, pattern: string): Promise<PatternPreview> {
    return invoke('preview_subject_pattern', { projectId, pattern });
  },

  applyPattern(projectId: string, pattern: string): Promise<number> {
    return invoke('apply_subject_pattern', { projectId, pattern });
  },

  /** Devuelve [cambiadas, entradas del mapeo sin correspondencia]. */
  applyMap(
    projectId: string,
    mapping: Record<string, string>,
  ): Promise<[number, string[]]> {
    return invoke('apply_subject_map', { projectId, mapping });
  },
};
