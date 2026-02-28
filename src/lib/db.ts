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
}

export interface ClassDefinition {
  id: number;
  name: string;
  color: string; // Hex color
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
  // Future: Audio (10 types)
  | 'audio-classification'
  | 'speech-recognition'
  | 'sound-event-detection';

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
  data: TimeSeriesData;
  annotations: TimeSeriesAnnotation[];
  metadata: {
    uploaded: number;
    annotated?: number;
    status: 'pending' | 'annotated' | 'reviewed';  // Indexed
  };
}

export interface TimeSeriesData {
  timestamps: number[];        // X-axis values (ms timestamps or sequential)
  values: number[] | number[][];  // Y-axis values (univariate or multivariate)
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
  videoId?: string | null;
  frameIndex?: number | null;
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
  status: 'pending' | 'processing' | 'ready' | 'error';
  tracks: VideoTrack[];
}

export interface VideoTrack {
  id?: string;
  videoId: string;
  trackUuid: string;
  classId: number;
  label: string | null;
  enabled: boolean;
  keyframes: VideoKeyframe[];
}

export interface VideoKeyframe {
  id?: string;
  trackId: string;
  frameIndex: number;
  bboxX: number;
  bboxY: number;
  bboxWidth: number;
  bboxHeight: number;
  isKeyframe: boolean;
  enabled: boolean;
}

export interface InterpolatedBBox {
  trackUuid: string;
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
