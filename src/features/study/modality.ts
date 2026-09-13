// Derivación de `modality` a partir del tipo de proyecto (sección 3.2).
// Si un proyecto mezcla modalidades se usa la de la herramienta activa, vía
// `setActiveModality` en `studySession.ts`.

import type { ProjectType } from '../../lib/db';
import type { Modality } from './events';

const BY_PROJECT_TYPE: Record<ProjectType, Modality> = {
  bbox: 'image_bbox',
  obb: 'image_bbox',
  mask: 'image_mask',
  polygon: 'image_mask',
  'instance-segmentation': 'image_mask',
  keypoints: 'image_point',
  landmarks: 'image_point',
  classification: 'other',
  'multi-label-classification': 'other',
  'timeseries-classification': 'timeseries_event',
  'timeseries-forecasting': 'timeseries_event',
  'anomaly-detection': 'timeseries_event',
  'timeseries-segmentation': 'timeseries_event',
  'pattern-recognition': 'timeseries_event',
  'event-detection': 'timeseries_event',
  'timeseries-regression': 'timeseries_event',
  clustering: 'timeseries_event',
  imputation: 'timeseries_event',
  tabular: 'other',
  'audio-classification': 'other',
  'speech-recognition': 'other',
  'sound-event-detection': 'other',
  'tts-recording': 'other',
};

export function modalityForProjectType(type: ProjectType | undefined): Modality {
  if (!type) return 'other';
  return BY_PROJECT_TYPE[type] ?? 'other';
}

/** Modalidad de una herramienta concreta del lienzo o del anotador de video. */
export function modalityForTool(toolId: string): Modality | null {
  switch (toolId) {
    case 'bbox':
    case 'obb':
      return 'image_bbox';
    case 'polygon':
    case 'brush':
    case 'eraser':
    case 'magic-wand':
    case 'sam':
      return 'image_mask';
    case 'point':
    case 'keypoints':
    case 'landmarks':
    case 'skeleton':
      return 'image_point';
    default:
      return null;
  }
}
