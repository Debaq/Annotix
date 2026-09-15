/**
 * Contrato de modelo: qué se puede afirmar sobre un modelo entrenado aquí.
 *
 * Se arma solo, a partir del dato que dejaron las etapas anteriores. Lo que hay
 * que leer primero es `limitations`: la parte que dice qué **no** se pudo
 * establecer.
 */
export interface ModelContract {
  contractVersion: number;
  generatedAt: string;
  projectId: string;
  projectName: string;
  projectType: string;
  jobId: string;

  /** `declarativo` | `trazable` | `reproducible` | `verificable`. */
  evidenceLevel: string;
  limitations: string[];

  protocol: StudyProtocol | null;
  population: {
    splitUnit: string;
    declaredUnit: string | null;
    seed: string | null;
    items: Record<string, number> | null;
    groups: Record<string, number> | null;
    subjects: Record<string, number> | null;
    subjectsUndeclared: number | null;
    perClass: unknown[];
    warnings: unknown[];
  } | null;
  /**
   * Métricas de test con su intervalo del 95 %, cuando el backend dejó los
   * resultados por muestra. `null` si informó sólo el agregado.
   */
  testMetricsCi: Record<
    string,
    { value: number; ciLow: number | null; ciHigh: number | null; n: number; groups: number }
  > | null;
  /**
   * Qué se le hizo al conjunto de entrenamiento. `null` si no se aumentó.
   *
   * Se transcribe tal cual del informe del reparto: el dueño del dato es el
   * preparador de datasets, y una copia con forma propia se separaría de él.
   */
  augmentation: {
    generated: number;
    trainImages: number;
    trainSourceImages: number;
    seed: string;
    transforms: string[];
    tiling?: unknown;
    warnings: { code: string; kind: string; detail: string | null }[];
  } | null;
  provenance: {
    byOrigin: Record<string, number>;
    byReview: Record<string, number>;
    total: number;
    unknown: number;
    rejected: number;
  };
  agreement: {
    statistic: string;
    value: number | null;
    ciLow: number | null;
    ciHigh: number | null;
    nItems: number;
    nRaters: number;
  } | null;

  metrics: Record<string, unknown> | null;
  testMetrics: Record<string, unknown> | null;
  /** Por qué las métricas no llevan intervalo de confianza. */
  metricsCiNote: string;

  pipeline: Record<string, unknown>;
  integrity: {
    modelSha256: string | null;
    datasetCompositionSha256: string | null;
    auditHeadSha256: string | null;
    auditChainValid: boolean | null;
    auditEvents: number;
  };
}

/** Lo que un proyecto declara sobre sí mismo, una vez. */
export interface StudyProtocol {
  inclusion?: string | null;
  exclusion?: string | null;
  modality?: string | null;
  population?: string | null;
  intendedUse?: string | null;
}
