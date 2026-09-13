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

/**
 * De dónde salieron las etiquetas del proyecto y qué pasó con ellas.
 *
 * Es el insumo del contrato de modelo: un corpus con el 80 % de las etiquetas
 * sugeridas por un modelo y aceptadas sin tocar es una cosa distinta de uno
 * trazado a mano, y hasta ahora no había forma de distinguirlos.
 */
export interface ProvenanceSummary {
  /** `manual` | `model` | `track` | `import` | `adjudicated` | `unknown`. */
  byOrigin: Record<string, number>;
  byReview: Record<string, number>;
  byModel: Record<string, number>;
  total: number;
  /** Etiquetas anteriores al registro de procedencia. */
  unknown: number;
}
