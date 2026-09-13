// Espejo en TypeScript de la taxonomía definida en
// `src-tauri/src/study/events.rs`. Es la fuente para la interfaz; un test de
// Rust (`study::tests::espejo_typescript_coincide_con_la_taxonomia`) falla si
// las dos listas se separan. No agregar eventos aquí sin agregarlos allá.

export const STUDY_EVENTS = [
  'session.start',
  'session.end',
  'project.create',
  'project.open',
  'data.import.start',
  'data.import.end',
  'annot.first',
  'annot.complete',
  'train.start',
  'train.epoch',
  'train.end',
  'export.start',
  'export.end',
  'step.enter',
  'step.exit',
  'config.change',
  'tool.select',
  'annot.commit',
  'annot.delete',
  'assist.propose',
  'video.keyframe.set',
  'video.keyframe.review',
  'video.consolidate',
  'idle.start',
  'idle.end',
  'help.open',
  'error.shown',
  'net.request',
  'infer.run',
] as const;

export type StudyEvent = (typeof STUDY_EVENTS)[number];

export const MODALITIES = [
  'image_bbox',
  'image_mask',
  'image_point',
  'video_track',
  'timeseries_event',
  'other',
] as const;

export type Modality = (typeof MODALITIES)[number];

export const NET_PURPOSES = [
  'update_check',
  'model_weights',
  'remote_training',
  'collab_p2p',
  'remote_llm',
  'other',
] as const;

export type NetPurpose = (typeof NET_PURPOSES)[number];
