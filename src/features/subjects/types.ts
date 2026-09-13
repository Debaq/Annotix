/** Reparto de muestras por sujeto en un proyecto. */
export interface SubjectSummary {
  /** Sujeto → número de muestras. */
  counts: Record<string, number>;
  /** Muestras sin sujeto declarado. */
  unassigned: number;
  total: number;
}

/** Resultado de probar un patrón, antes de aplicarlo. */
export interface PatternPreview {
  /** Pares (nombre de archivo, sujeto extraído). */
  matched: [string, string][];
  /** Nombres que el patrón no supo leer. */
  unmatched: string[];
}
