import type { PythonEnvStatus, TrainingBackend } from '../types';

/**
 * Paquete que delata si un backend está instalado en el entorno Python.
 *
 * Existe como tabla única porque antes había dos listas sueltas: `BackendSelector`
 * cubría seis backends y devolvía `false` para el resto —que aparecían como "no
 * instalado" aunque lo estuvieran— y `TrainingPanel` mantenía su propia cadena de
 * `if`. Cualquier backend nuevo que falte aquí rompe la compilación, que es
 * justamente lo que se quiere.
 */
export const BACKEND_ENV_FIELD: Record<TrainingBackend, keyof PythonEnvStatus> = {
  yolo: 'ultralyticsVersion',
  rt_detr: 'ultralyticsVersion',
  rf_detr: 'rfdetrVersion',
  hf_detection: 'hfTransformersVersion',
  hf_instance: 'hfTransformersVersion',
  hf_segmentation: 'hfTransformersVersion',
  hf_classification: 'hfTransformersVersion',
  // La pose usa un backbone de timm con cabeza de heatmaps propia.
  hf_pose: 'timmVersion',
  smp: 'smpVersion',
  timm: 'timmVersion',
  tsai: 'tsaiVersion',
  pytorch_forecasting: 'pytorchForecastingVersion',
  pyod: 'pyodVersion',
  tslearn: 'tslearnVersion',
  pypots: 'pypotsVersion',
  stumpy: 'stumpyVersion',
  sklearn: 'sklearnVersion',
};

/** `true` si el backend ya tiene sus dependencias en el entorno. */
export function isBackendInstalled(
  backend: TrainingBackend,
  env: PythonEnvStatus | null | undefined,
): boolean {
  if (!env) return false;
  const campo = BACKEND_ENV_FIELD[backend];
  return campo ? env[campo] != null : false;
}
