// src/lib/db.ts
import Dexie, { Table } from 'dexie';

// ============================================================================
// PROJECTS TABLE
// ============================================================================

export interface Project {
  id?: number;
  name: string;
  type: ProjectType;
  classes: ClassDefinition[];
  metadata: {
    created: number;
    updated: number;
    version: string;
  };
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
  id?: number;
  projectId: number;           // Indexed
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
  id?: number;
  imageId: number;             // Indexed
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
// TRAINING JOBS TABLE (Fase 5)
// ============================================================================

export interface TrainingJob {
  id?: number;
  projectId: number;           // Indexed
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
// DEXIE DATABASE CLASS
// ============================================================================

class AnnotixDB extends Dexie {
  projects!: Table<Project>;
  images!: Table<Image>;
  inferenceCache!: Table<InferenceCache>;
  trainingJobs!: Table<TrainingJob>;

  constructor() {
    super('annotixDB');

    this.version(1).stores({
      projects: '++id, name, type, metadata.created',
      images: '++id, projectId, metadata.status, metadata.uploaded',
      inferenceCache: '++id, imageId, modelHash',
      trainingJobs: '++id, projectId, status, createdAt',
    });
  }
}

export const db = new AnnotixDB();

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
 * Alias for Image with flattened structure (compatibility with agent-generated code)
 * Transforms:
 *   - blob → image
 *   - dimensions.width → width
 *   - dimensions.height → height
 */
export interface AnnotixImage extends Omit<Image, 'blob' | 'dimensions'> {
  image: Blob;  // Renamed from 'blob'
  width: number; // Flattened from dimensions.width
  height: number; // Flattened from dimensions.height
}

/**
 * Type for creating a new image
 */
export type NewAnnotixImage = Omit<AnnotixImage, 'id' | 'metadata'> & {
  metadata?: Partial<AnnotixImage['metadata']>;
};
