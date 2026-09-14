/**
 * Qué métrica de acuerdo le toca a cada tipo de proyecto.
 *
 * Espejo de `agreement::familia_de_metrica` en Rust. Hay un test en Rust que
 * falla si divergen: una métrica elegida aquí y otra allá darían dos números
 * distintos para la misma pregunta.
 */
export type MetricFamily = 'categorica' | 'solape_caja' | 'solape_area' | 'continua';

export const METRIC_FAMILY: Record<string, MetricFamily> = {
  'classification': 'categorica',
  'multi-label-classification': 'categorica',
  'bbox': 'solape_caja',
  'obb': 'solape_caja',
  'mask': 'solape_area',
  'polygon': 'solape_area',
  'instance-segmentation': 'solape_area',
  'keypoints': 'continua',
  'landmarks': 'continua',
  'timeseries-classification': 'categorica',
  'event-detection': 'categorica',
  'anomaly-detection': 'categorica',
  'pattern-recognition': 'categorica',
  'timeseries-segmentation': 'categorica',
  'timeseries-regression': 'continua',
  'timeseries-forecasting': 'continua',
  'imputation': 'continua',
};

/** La familia de un tipo de proyecto; por defecto, solape de caja. */
export function metricFamily(projectType: string): MetricFamily {
  return METRIC_FAMILY[projectType] ?? 'solape_caja';
}
