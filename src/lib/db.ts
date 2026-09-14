// src/lib/db.ts
// Solo interfaces y tipos - la persistencia se maneja via Tauri/Rust (tauriDb.ts)

// ============================================================================
// PROJECTS TABLE
// ============================================================================

export interface Project {
  id?: string;
  name: string;
  type: ProjectType;
  classes: ClassDefinition[];
  metadata: {
    created: number;
    updated: number;
    version: string;
  };
  imageCount?: number;
  /** Cantidad de modelos de inferencia del proyecto (lo envía ProjectSummary) */
  inferenceModelCount?: number;
  p2pDownload?: { totalImages: number; downloadedImages: number };
  hasP2pConfig?: boolean;
  folder?: string;
  imageFormat?: 'jpg' | 'webp';
  webpQualityPreset?: 'lossless' | 'max' | 'high' | 'balanced' | 'fast';
}

export interface ClassDefinition {
  id: number;
  name: string;
  color: string; // Hex color
  description?: string;
}

export type ProjectType =
  // Images - Implemented (Fase 1-2)
  | 'bbox'
  | 'mask'
  | 'polygon'
  | 'keypoints'
  | 'landmarks'
  | 'obb'
  | 'classification'
  | 'multi-label-classification'
  | 'instance-segmentation'
  // Time Series - Implemented (Fase 3)
  | 'timeseries-classification'
  | 'timeseries-forecasting'
  | 'anomaly-detection'
  | 'timeseries-segmentation'
  | 'pattern-recognition'
  | 'event-detection'
  | 'timeseries-regression'
  | 'clustering'
  | 'imputation'
  // Tabular ML
  | 'tabular'
  // Future: Audio (10 types)
  | 'audio-classification'
  | 'speech-recognition'
  | 'sound-event-detection'
  | 'tts-recording';

// ============================================================================
// IMAGES TABLE
// ============================================================================

export interface Image {
  id?: string;
  projectId: string;           // Indexed
  name: string;
  blob: Blob;
  annotations: Annotation[];
  dimensions: {
    width: number;
    height: number;
  };
  metadata: {
    uploaded: number;
    annotated?: number;
    status: 'pending' | 'annotated' | 'reviewed';  // Indexed
  };
}

export interface Annotation {
  id: string;                  // UUID v4
  type: ProjectType;
  classId: number;
  data: AnnotationData;
  source?: 'user' | 'ai';     // "user" por defecto, "ai" para inferencia
  confidence?: number;         // Solo para source="ai"
  modelClassName?: string;     // Nombre de clase del modelo (solo AI)
  createdBy?: string;          // Nombre del peer que la creó (solo sesiones P2P)

  // ─── Procedencia ──────────────────────────────────────────────────────────
  // De dónde salió la etiqueta y qué pasó con ella. `source` se queda por
  // compatibilidad pero es ambiguo: su valor "user" mezcla lo trazado a mano con
  // lo que un modelo sugirió y alguien aceptó sin tocar. El backend rellena estos
  // campos y los conserva cuando el cliente no los manda
  // (`store/images.rs → fusionar_procedencia`).
  /** `manual` | `model` | `track` | `import` | `adjudicated` | `unknown`. */
  origin?: string;
  /** Qué modelo la sugirió, cuando `origin` es `model`. */
  modelId?: string;
  /** `unreviewed` | `reviewed` | `corrected` | `accepted` | `rejected`. */
  review?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export type AnnotationData =
  | BBoxData
  | MaskData
  | PolygonData
  | KeypointsData
  | LandmarksData
  | OBBData
  | ClassificationData;

// ============================================================================
// ANNOTATION DATA TYPES
// ============================================================================

export interface BBoxData {
  x: number;                   // Top-left X (pixels)
  y: number;                   // Top-left Y (pixels)
  width: number;               // Width (pixels)
  height: number;              // Height (pixels)
}

export interface MaskData {
  base64png: string;           // Base64 encoded PNG of mask canvas
  instanceId?: number;         // For instance segmentation
}

export interface PolygonData {
  points: { x: number; y: number }[];
  closed?: boolean;            // Auto-close polygon
}

export interface KeypointsData {
  points: {
    x: number;
    y: number;
    visible: boolean;          // 0=not labeled, 1=labeled but occluded, 2=visible
    name?: string;             // Keypoint name (e.g., "nose", "left_eye")
  }[];
  skeletonType: string;        // 'coco', 'face', 'hand', 'mediapipe_pose', etc.
  instanceId?: number;         // For multiple instances
}

export interface LandmarksData {
  points: {
    x: number;
    y: number;
    name: string;              // Landmark name
  }[];
}

export interface OBBData {
  x: number;                   // Center X
  y: number;                   // Center Y
  width: number;
  height: number;
  rotation: number;            // Rotation in degrees (0-360)
}

export interface ClassificationData {
  labels: number[];            // Array of class IDs (for multi-label)
}

// ============================================================================
// INFERENCE CACHE TABLE (Fase 4)
// ============================================================================

export interface InferenceCache {
  id?: string;
  imageId: string;             // Indexed
  modelHash: string;           // MD5 hash of model file - Indexed
  predictions: Prediction[];
  timestamp: number;
}

export interface Prediction {
  classId: number;
  confidence: number;
  bbox?: BBoxData;
  mask?: MaskData;
  keypoints?: KeypointsData;
}

// ============================================================================
// TIME SERIES TABLE (Fase 3)
// ============================================================================

export interface TimeSeries {
  id?: string;
  projectId: string;           // Indexed
  name: string;
  /**
   * Datos completos de la serie. Solo vienen al pedir una serie concreta
   * (`getById`); el listado los deja en null y describe la serie con
   * `pointCount` / `seriesCount`, para no cargar cada serie del proyecto
   * solo para pintar la galería.
   */
  data: TimeSeriesData | null;
  pointCount: number;          // Nº de puntos (disponible siempre)
  seriesCount: number;         // Nº de variables (1 = univariante)
  columns?: string[] | null;   // Nombres de columnas (multivariante)
  annotations: TimeSeriesAnnotation[];
  metadata: {
    uploaded: number;
    annotated?: number;
    status: 'pending' | 'annotated' | 'reviewed';  // Indexed
  };
}

export interface TimeSeriesData {
  timestamps: number[];        // X-axis values (ms timestamps or sequential)
  /**
   * Valores del eje Y (univariante o multivariante). `null` es un hueco
   * declarado por el importador: una celda vacía o no numérica del CSV. No se
   * sustituye por 0 porque un cero inventado es indistinguible de un dato real.
   */
  values: (number | null)[] | (number | null)[][];
  columns?: string[];          // Column names for multivariate data
}

export interface TimeSeriesAnnotation {
  id: string;                  // UUID v4
  type: 'point' | 'range' | 'classification' | 'event' | 'anomaly';
  classId?: number;            // Optional class ID
  data: TimeSeriesAnnotationData;
}

export type TimeSeriesAnnotationData =
  | PointAnnotation
  | RangeAnnotation
  | ClassificationAnnotation
  | EventAnnotation
  | AnomalyAnnotation;

export interface PointAnnotation {
  timestamp: number;           // X coordinate
  value?: number;              // Y coordinate (optional)
  label?: string;              // Optional label
}

export interface RangeAnnotation {
  startTimestamp: number;      // Start X
  endTimestamp: number;        // End X
  label?: string;              // Optional label
}

export interface ClassificationAnnotation {
  classId: number;             // Global classification for entire series
}

export interface EventAnnotation {
  timestamp: number;
  eventType: string;
  confidence?: number;
}

export interface AnomalyAnnotation {
  timestamp: number;
  score: number;               // Anomaly score
  threshold?: number;
  /**
   * Valor de la serie en ese instante. Sin él el marcador se dibujaba en y=0,
   * que en una serie que no pasa por cero cae fuera del área visible.
   */
  value?: number;
}

// ============================================================================
// TRAINING JOBS TABLE (Fase 5)
// ============================================================================

export interface TrainingJob {
  id?: string;
  projectId: string;           // Indexed
  status: 'pending' | 'running' | 'completed' | 'failed';  // Indexed
  config: TrainingConfig;
  progress: number;            // 0-100
  logs: string[];
  metrics?: TrainingMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingConfig {
  framework: 'ultralytics' | 'pytorch' | 'tensorflow';
  modelType: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
  device: 'cpu' | 'cuda' | 'mps';
  optimizer: string;
  imageSize?: number;
  augmentation?: boolean;
}

export interface TrainingMetrics {
  loss: number[];
  accuracy?: number[];
  precision?: number[];
  recall?: number[];
  mAP?: number[];
}

// ============================================================================
// HELPER TYPES FOR SERVICE LAYER
// ============================================================================

/**
 * Type for creating a new project (omits auto-generated fields)
 */
export type NewProject = Omit<Project, 'id' | 'metadata'> & {
  metadata?: Partial<Project['metadata']>;
};

/**
 * AnnotixImage para Tauri - usa blobPath en lugar de Blob
 * El frontend obtiene la URL de la imagen via convertFileSrc() o getImageFilePath()
 */
export interface AnnotixImage {
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
  /**
   * Sujeto al que pertenece la muestra: paciente, animal, cultivo, lámina.
   *
   * Opcional; un proyecto generalista nunca lo usa. Cuando está, el reparto
   * train/val/test agrupa por él para que dos muestras del mismo sujeto no
   * caigan en particiones distintas.
   */
  subjectId?: string | null;
  videoId?: string | null;
  frameIndex?: number | null;
  /**
   * Marcada a mano como fondo: una imagen donde de verdad no hay ningún objeto.
   * Sin esto, una imagen sin anotaciones es indistinguible de una que nadie ha
   * anotado todavía y el entrenamiento la descarta.
   */
  isBackground?: boolean;
  downloadStatus?: string;
}

// ============================================================================
// AUDIO TYPES
// ============================================================================

export interface AudioSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: number;
}

export interface AudioEvent {
  id: string;
  startMs: number;
  endMs: number;
  classId: number;
}

export interface Audio {
  id?: string;
  projectId: string;
  name: string;
  file: string;
  durationMs: number;
  sampleRate: number;
  transcription: string;
  speakerId?: string;
  language: string;
  segments: AudioSegment[];
  classId?: number | null;
  events: AudioEvent[];
  metadata: {
    uploaded: number;
    annotated?: number;
    status: 'pending' | 'done' | 'review';
  };
}

// ============================================================================
// TTS GUIDED RECORDING
// ============================================================================

export interface TtsSentence {
  id: string;
  text: string;
  status: 'pending' | 'recorded' | 'skipped';
  audioId?: string;
}

export interface LlmConfig {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
}

// ============================================================================
// VIDEO TYPES
// ============================================================================

export interface Video {
  id?: string;
  projectId: string;
  name: string;
  file: string;
  fpsExtraction: number;
  fpsOriginal: number | null;
  totalFrames: number;
  durationMs: number;
  width: number;
  height: number;
  uploaded: number;
  status: 'pending' | 'extracting' | 'processing' | 'ready' | 'error';
  tracks: VideoTrack[];
}

export interface VideoTrack {
  id?: string;
  videoId: string;
  classId: number;
  label: string | null;
  enabled: boolean;
  /** `linear` | `ease` | `smooth`. Ver `features/video/utils/interpolation.ts`. */
  interpolation?: string;
  /** `none` | `after` | `both`: prolongación fuera del rango de keyframes. */
  extend?: string;
  keyframes: VideoKeyframe[];
}

export interface VideoKeyframe {
  frameIndex: number;
  bboxX: number;
  bboxY: number;
  bboxWidth: number;
  bboxHeight: number;
  isKeyframe: boolean;
  enabled: boolean;
}

export interface InterpolatedBBox {
  trackId: string;
  classId: number;
  bbox: BBoxData;
  isKeyframe: boolean;
  enabled: boolean;
}

export interface VideoInfo {
  durationMs: number;
  fpsOriginal: number;
  width: number;
  height: number;
}

/**
 * Type for creating a new image
 */
export type NewAnnotixImage = Omit<AnnotixImage, 'id' | 'metadata'> & {
  metadata?: Partial<AnnotixImage['metadata']>;
};

// ============================================================================
// SAM — Segment Anything Model (mirror de src-tauri/src/inference/sam)
// ============================================================================

export interface SamPoint {
  x: number;
  y: number;
  label: 0 | 1;                // 1 = positivo, 0 = negativo
}

export interface SamPrompts {
  points?: SamPoint[];
  bbox?: [number, number, number, number]; // [x1,y1,x2,y2] px imagen original
  multimaskOutput?: boolean;
}

export interface SamPrediction {
  masksLowres: Uint8Array[];
  scores: number[];
  bestIndex: number;
  lowresSize: [number, number];
  origSize: [number, number];
}

export interface AmgConfig {
  pointsPerSide: number;              // default 16
  predIouThresh: number;              // 0.7
  stabilityScoreThresh: number;       // 0.85
  boxNmsThresh: number;               // 0.7
  minMaskRegionArea: number;          // 100
  overlapWithExistingThresh: number;  // 0.5
}

export const DEFAULT_AMG_CONFIG: AmgConfig = {
  pointsPerSide: 16,
  predIouThresh: 0.7,
  stabilityScoreThresh: 0.85,
  boxNmsThresh: 0.7,
  minMaskRegionArea: 100,
  overlapWithExistingThresh: 0.5,
};

/** Candidato AMG. Efímero (no se persiste en project.json). */
export interface SamMask {
  id: string;
  /** 3 logits uint8 (serializados por Tauri como number[] | Uint8Array). */
  masksLowres: [Uint8Array, Uint8Array, Uint8Array];
  scores: [number, number, number];
  bbox: [number, number, number, number]; // [x,y,w,h] px imagen original
  origSize: [number, number];
  lowresSize: [number, number];
  colorSeed: number;
}

export interface SamEncodeInfo {
  imageId: string;
  origSize: [number, number];
  cached: boolean;
}

export type SamAmgPhase = 'encoding' | 'decoding_batch' | 'filtering' | 'done';

export interface SamAmgProgress {
  phase: SamAmgPhase;
  current: number;
  total: number;
  imageId: string;
}

export type MaskTarget = 'bbox' | 'obb' | 'polygon' | 'mask';
