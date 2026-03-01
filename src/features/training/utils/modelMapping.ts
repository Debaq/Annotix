/** Mapeo tipo de proyecto Annotix → tarea YOLO */
export function projectTypeToTask(projectType: string): string {
  switch (projectType) {
    case 'bbox':
    case 'object-detection':
      return 'detect';
    case 'instance-segmentation':
    case 'polygon':
    case 'mask':
    case 'semantic-segmentation':
      return 'segment';
    case 'classification':
      return 'classify';
    case 'keypoints':
      return 'pose';
    case 'obb':
      return 'obb';
    default:
      return 'detect';
  }
}

/** Labels legibles para las tareas */
export const TASK_LABELS: Record<string, string> = {
  detect: 'Detection',
  segment: 'Segmentation',
  classify: 'Classification',
  pose: 'Pose Estimation',
  obb: 'Oriented Detection',
};

/** Labels legibles para tamaños de modelo */
export const SIZE_LABELS: Record<string, string> = {
  n: 'Nano',
  s: 'Small',
  m: 'Medium',
  l: 'Large',
  x: 'Extra Large',
  t: 'Tiny',
  c: 'Compact',
  e: 'Extended',
};

/** Descripciones de velocidad/precisión por tamaño */
export const SIZE_DESCRIPTIONS: Record<string, string> = {
  n: 'training.model.sizeDescNano',
  s: 'training.model.sizeDescSmall',
  m: 'training.model.sizeDescMedium',
  l: 'training.model.sizeDescLarge',
  x: 'training.model.sizeDescXLarge',
  t: 'training.model.sizeDescNano',
  c: 'training.model.sizeDescMedium',
  e: 'training.model.sizeDescXLarge',
};
