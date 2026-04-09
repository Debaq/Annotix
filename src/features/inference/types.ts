// ─── Modelo de Inferencia ────────────────────────────────────────────────────

export interface InferenceModelEntry {
  id: string;
  name: string;
  file: string;
  format: string;         // "onnx" | "pt"
  task: string;           // "detect" | "segment" | "classify" | "pose" | "obb"
  classNames: string[];
  classMapping: ClassMapping[];
  inputSize: number | null;
  /** Hint de formato ONNX: "yolov5","yolov8","yolov10","classification", null=auto */
  outputFormat: string | null;
  modelHash: string;
  uploaded: number;
  metadata: Record<string, unknown> | null;
}

export interface ClassMapping {
  modelClassId: number;
  modelClassName: string;
  projectClassId: string | null;  // UUID de la clase del proyecto
}

// ─── Predicciones ────────────────────────────────────────────────────────────

export interface PredictionEntry {
  id: string;
  modelId: string;
  classId: number;
  className: string;
  confidence: number;
  data: BboxData | PolygonData | Record<string, unknown>;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface BboxData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PolygonData {
  x: number;
  y: number;
  width: number;
  height: number;
  points: Array<{ x: number; y: number }>;
}

// ─── Configuración de Inferencia ─────────────────────────────────────────────

export interface InferenceConfig {
  confidenceThreshold: number;
  inputSize: number | null;
  device: string;
  iouThreshold: number;
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

export interface InferenceProgressEvent {
  jobId: string;
  current: number;
  total: number;
  imageId: string;
  predictionsCount: number;
}

export interface InferenceResultEvent {
  jobId: string;
  imageId: string;
  predictionsCount: number;
  inferenceTimeMs: number;
  current: number;
  total: number;
}

export interface InferenceErrorEvent {
  jobId: string;
  imageId?: string;
  error: string;
}

export interface InferenceCompletedEvent {
  jobId: string;
}

// ─── Metadatos del Modelo ────────────────────────────────────────────────────

export interface ModelMetadata {
  format: string;
  task?: string;
  classNames?: string[];
  inputSize?: number;
  numClasses?: number;
  inputShape?: number[];
  outputShape?: number[];
  outputFormat?: string;
  numOutputs?: number;
  error?: string;
}

/// Resultado del parseo de un JSON de configuración de modelo
export interface ModelConfigResult {
  classNames: string[];
  displayNames: string[];
  task: string | null;
  inputSize: number | null;
  /** Hint de formato ONNX: "yolov5","yolov8","yolov10","classification" */
  outputFormat: string | null;
  /** Colores por technical_name: { "hemorrhage": "#ef4444", ... } */
  colors: Record<string, string>;
  /** Índices de clases marcadas como currently_detected */
  detectedClasses: number[];
  /** Categorías por clase: { "hemorrhage": "lesion", ... } */
  categories: Record<string, string>;
  /** JSON original completo */
  rawMetadata: Record<string, unknown>;
}
