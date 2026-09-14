/** Qué pasó al importar archivos médicos. */
export interface MedicalImportReport {
  filesRead: number;
  imagesCreated: number;
  /** Cortes descartados por no tener señal: aire al principio y al final. */
  slicesSkipped: number;
  /** Sujetos encontrados, ya seudonimizados. */
  subjects: string[];
  /** Identificadores eliminados, por nombre de etiqueta DICOM. */
  removedTags: string[];
  /** Metadatos de adquisición conservados. */
  keptTags: string[];
  /** Cuasi-identificadores conservados con reducción (edad en años, sexo). */
  reducedTags: string[];
  privateTagsRemoved: number;
  /** Lo que esta deidentificación NO cubre. */
  warnings: string[];
  /** Archivos que no se pudieron leer, con el motivo. */
  failed: [string, string][];
}

/** Ventana de uso corriente: `[nombre, centro, anchura]`. */
export type WindowPreset = [string, number, number];

/** De dónde salió una imagen, cuando salió de un archivo médico. */
export interface MedicalInfo {
  sourceFormat: string;
  modality?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  bodyPart?: string | null;
  pixelSpacing?: number[] | null;
  kvp?: number | null;
  repetitionTime?: number | null;
  echoTime?: number | null;
  protocolName?: string | null;
  patientSex?: string | null;
  patientAgeYears?: number | null;
  windowCenter?: number | null;
  windowWidth?: number | null;
  windowFromFile: boolean;
  rawFile?: string | null;
  sliceIndex?: number | null;
  sliceAxis?: string | null;
}
