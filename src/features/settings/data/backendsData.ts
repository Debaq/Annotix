/**
 * Presentación del catálogo de entrenamiento: iconos y colores.
 *
 * Los **datos** del catálogo —backends, modelos, tareas, formato de dataset,
 * paquetes pip y el script de cada backend— ya no viven aquí. Los sirve Rust
 * (`training/backends.rs`, `training/catalog.rs`, `training::preview_script`) y
 * el front los pide por comando.
 *
 * Este archivo tenía una copia escrita a mano de todo eso, y derivó: llegó a
 * listar 196 modelos contra los 132 reales, 60 de ellos pertenecientes a backends
 * retirados (MMDetection, MMSegmentation, MMPose, MMRotate, Detectron2) que ya no
 * pueden entrenar, y la mitad de las plantillas de script decían literalmente
 * «See Rust backend for full script». Lo que queda aquí es lo único que es de la
 * capa de presentación y no tiene equivalente en el backend.
 */

/** Icono y color por backend. Si falta uno, la UI cae a un icono genérico. */
export const BACKEND_PRESENTATION: Record<string, { icon: string; color: string }> = {
  hf_detection: { icon: 'fas fa-cubes', color: 'text-orange-500' },
  hf_instance: { icon: 'fas fa-object-group', color: 'text-fuchsia-500' },
  hf_pose: { icon: 'fas fa-child-reaching', color: 'text-cyan-500' },
  yolo: { icon: 'fas fa-bolt', color: 'text-yellow-500' },
  rt_detr: { icon: 'fas fa-atom', color: 'text-cyan-500' },
  rf_detr: { icon: 'fas fa-crosshairs', color: 'text-violet-500' },
  smp: { icon: 'fas fa-puzzle-piece', color: 'text-emerald-500' },
  hf_segmentation: { icon: 'fas fa-face-smile', color: 'text-amber-500' },
  timm: { icon: 'fas fa-image', color: 'text-sky-500' },
  hf_classification: { icon: 'fas fa-face-smile', color: 'text-orange-500' },
  tsai: { icon: 'fas fa-chart-line', color: 'text-teal-500' },
  pytorch_forecasting: { icon: 'fas fa-chart-area', color: 'text-blue-400' },
  pyod: { icon: 'fas fa-triangle-exclamation', color: 'text-red-500' },
  tslearn: { icon: 'fas fa-circle-nodes', color: 'text-purple-500' },
  pypots: { icon: 'fas fa-fill-drip', color: 'text-cyan-400' },
  stumpy: { icon: 'fas fa-magnifying-glass-chart', color: 'text-amber-600' },
  sklearn: { icon: 'fas fa-table', color: 'text-emerald-600' },
};

export const TASK_LABELS: Record<string, string> = {
  detect: 'Detection', segment: 'Segmentation', instance_segment: 'Instance Seg',
  classify: 'Classification', multi_classify: 'Multi-Label', pose: 'Pose', landmarks: 'Landmarks', obb: 'OBB',
  ts_classify: 'TS Classification', ts_forecast: 'Forecasting', ts_anomaly: 'Anomaly Detection',
  ts_segment: 'TS Segmentation', ts_pattern: 'Pattern Recognition', ts_event: 'Event Detection',
  ts_regress: 'TS Regression', ts_cluster: 'Clustering', ts_impute: 'Imputation',
  tabular: 'Tabular ML',
};

export const SIZE_LABELS: Record<string, string> = {
  n: 'Nano', s: 'Small', m: 'Medium', l: 'Large', x: 'XL', t: 'Tiny', c: 'Compact', e: 'Extended',
};

export const BACKEND_COLORS: Record<string, string> = {
  yolo: 'bg-yellow-100 text-yellow-700',
  rt_detr: 'bg-cyan-100 text-cyan-700',
  rf_detr: 'bg-violet-100 text-violet-700',
  mmdetection: 'bg-blue-100 text-blue-700',
  smp: 'bg-emerald-100 text-emerald-700',
  hf_segmentation: 'bg-amber-100 text-amber-700',
  mmsegmentation: 'bg-rose-100 text-rose-700',
  detectron2: 'bg-indigo-100 text-indigo-700',
  mmpose: 'bg-lime-100 text-lime-700',
  mmrotate: 'bg-fuchsia-100 text-fuchsia-700',
  timm: 'bg-sky-100 text-sky-700',
  hf_classification: 'bg-orange-100 text-orange-700',
  tsai: 'bg-teal-100 text-teal-700',
  pytorch_forecasting: 'bg-blue-100 text-blue-600',
  pyod: 'bg-red-100 text-red-700',
  tslearn: 'bg-purple-100 text-purple-700',
  pypots: 'bg-cyan-100 text-cyan-600',
  stumpy: 'bg-amber-100 text-amber-600',
  sklearn: 'bg-emerald-100 text-emerald-700',
};

export const TASK_COLORS: Record<string, string> = {
  detect: 'bg-blue-100 text-blue-700',
  segment: 'bg-purple-100 text-purple-700',
  instance_segment: 'bg-indigo-100 text-indigo-700',
  classify: 'bg-teal-100 text-teal-700',
  multi_classify: 'bg-emerald-100 text-emerald-700',
  pose: 'bg-orange-100 text-orange-700',
  landmarks: 'bg-lime-100 text-lime-700',
  obb: 'bg-pink-100 text-pink-700',
  ts_classify: 'bg-cyan-100 text-cyan-700',
  ts_forecast: 'bg-sky-100 text-sky-700',
  ts_anomaly: 'bg-red-100 text-red-700',
  ts_segment: 'bg-violet-100 text-violet-700',
  ts_pattern: 'bg-amber-100 text-amber-700',
  ts_event: 'bg-fuchsia-100 text-fuchsia-700',
  ts_regress: 'bg-rose-100 text-rose-700',
  ts_cluster: 'bg-purple-100 text-purple-600',
  ts_impute: 'bg-teal-100 text-teal-600',
  tabular: 'bg-emerald-100 text-emerald-700',
};
