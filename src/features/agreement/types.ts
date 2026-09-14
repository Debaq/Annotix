/** Acuerdo entre evaluadores medido sobre un corpus. */
export interface AgreementReport {
  /** `categorica` | `solape_caja` | `solape_area` | `continua`. */
  family: string;
  /** `cohen_kappa` | `fleiss_kappa` | `iou` | `dice` | `bland_altman`. */
  statistic: string;
  /**
   * El valor, cuando está definido. `null` cuando el corpus no da para
   * calcularlo — que no es lo mismo que un acuerdo de cero.
   */
  value: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  /** Lectura orientativa (Landis y Koch) para κ. */
  reading: string | null;
  nItems: number;
  nRaters: number;
  /** Por qué no se pudo calcular. */
  note: string | null;
  blandAltman?: {
    sesgo: number;
    sd: number;
    limiteInferior: number;
    limiteSuperior: number;
    n: number;
  } | null;
}

/** Una discrepancia concreta entre lecturas. */
export interface Discrepancy {
  imageId: string;
  imageName: string;
  /** 0 = coinciden del todo; 1 = no se parecen en nada. */
  disagreement: number;
  onlyOne: number;
  classConflicts: number;
  raters: string[];
}
