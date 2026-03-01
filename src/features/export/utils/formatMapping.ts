import { ProjectType } from '@/lib/db';

export type ExportFormat =
  | 'yolo-detection'
  | 'yolo-segmentation'
  | 'coco'
  | 'tix'
  | 'pascal-voc'
  | 'csv-detection'
  | 'csv-classification'
  | 'csv-keypoints'
  | 'csv-landmarks'
  | 'folders-by-class'
  | 'unet-masks';

export interface FormatInfo {
  id: ExportFormat;
  labelKey: string;
  descriptionKey: string;
}

export const FORMAT_INFO: Record<ExportFormat, FormatInfo> = {
  'yolo-detection': {
    id: 'yolo-detection',
    labelKey: 'export.formats.yoloDetection',
    descriptionKey: 'export.formats.yoloDetectionDesc',
  },
  'yolo-segmentation': {
    id: 'yolo-segmentation',
    labelKey: 'export.formats.yoloSegmentation',
    descriptionKey: 'export.formats.yoloSegmentationDesc',
  },
  coco: {
    id: 'coco',
    labelKey: 'export.formats.coco',
    descriptionKey: 'export.formats.cocoDesc',
  },
  tix: {
    id: 'tix',
    labelKey: 'export.formats.tix',
    descriptionKey: 'export.formats.tixDesc',
  },
  'pascal-voc': {
    id: 'pascal-voc',
    labelKey: 'export.formats.pascalVoc',
    descriptionKey: 'export.formats.pascalVocDesc',
  },
  'csv-detection': {
    id: 'csv-detection',
    labelKey: 'export.formats.csvDetection',
    descriptionKey: 'export.formats.csvDetectionDesc',
  },
  'csv-classification': {
    id: 'csv-classification',
    labelKey: 'export.formats.csvClassification',
    descriptionKey: 'export.formats.csvClassificationDesc',
  },
  'csv-keypoints': {
    id: 'csv-keypoints',
    labelKey: 'export.formats.csvKeypoints',
    descriptionKey: 'export.formats.csvKeypointsDesc',
  },
  'csv-landmarks': {
    id: 'csv-landmarks',
    labelKey: 'export.formats.csvLandmarks',
    descriptionKey: 'export.formats.csvLandmarksDesc',
  },
  'folders-by-class': {
    id: 'folders-by-class',
    labelKey: 'export.formats.foldersByClass',
    descriptionKey: 'export.formats.foldersByClassDesc',
  },
  'unet-masks': {
    id: 'unet-masks',
    labelKey: 'export.formats.unetMasks',
    descriptionKey: 'export.formats.unetMasksDesc',
  },
};

/**
 * Get valid export formats for a specific project type
 */
export function getValidFormats(projectType: ProjectType | undefined): ExportFormat[] {
  if (!projectType) return ['yolo-detection']; // fallback

  switch (projectType) {
    case 'bbox':
      return ['yolo-detection', 'pascal-voc', 'coco', 'csv-detection', 'tix'];

    case 'obb':
      return ['yolo-detection', 'pascal-voc', 'coco'];

    case 'instance-segmentation':
      return ['yolo-segmentation', 'coco', 'unet-masks', 'tix'];

    case 'polygon':
      return ['coco', 'unet-masks', 'tix'];

    case 'mask':
      return ['unet-masks', 'coco', 'tix'];

    case 'classification':
    case 'multi-label-classification':
      return ['folders-by-class', 'csv-classification'];

    case 'keypoints':
      return ['yolo-detection', 'coco', 'csv-keypoints'];

    case 'landmarks':
      return ['csv-landmarks', 'coco'];

    // Audio projects (no image export applicable)
    case 'audio-classification':
    case 'speech-recognition':
    case 'sound-event-detection':
      return [];

    // Tabular projects (no image export)
    case 'tabular':
      return [];

    // Time series projects (no image export applicable)
    case 'timeseries-classification':
    case 'timeseries-forecasting':
    case 'anomaly-detection':
    case 'timeseries-segmentation':
    case 'pattern-recognition':
    case 'event-detection':
    case 'timeseries-regression':
    case 'clustering':
    case 'imputation':
      return [];

    default:
      return ['yolo-detection'];
  }
}

/**
 * Get the default format for a project type
 */
export function getDefaultFormat(projectType: ProjectType | undefined): ExportFormat | null {
  const validFormats = getValidFormats(projectType);
  return validFormats.length > 0 ? validFormats[0] : null;
}
