// Identificadores estables de paso del flujo (sección 3.3 del documento del
// estudio). No se derivan de rutas de la interfaz ni de nombres de botones:
// agregar aquí y en `src-tauri/src/study/events.rs`, nunca en línea.

export const STUDY_STEPS = [
  'create_project',
  'import_data',
  'configure_classes',
  'annotate',
  'review_assisted',
  'configure_training',
  'train',
  'evaluate',
  'export',
] as const;

export type StudyStep = (typeof STUDY_STEPS)[number];
