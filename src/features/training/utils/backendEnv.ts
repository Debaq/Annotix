import type { BackendInfo, PythonEnvStatus, TrainingBackend } from '../types';

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

/**
 * `true` si el backend produce checkpoints de ultralytics, los únicos con
 * exportador universal (`YOLO(...).export()`).
 *
 * El resto entrega su formato nativo más un ONNX que el propio script de
 * entrenamiento escribe, así que ofrecerles TensorRT o CoreML era ofrecer un botón
 * que sólo podía fallar.
 */
export function esUltralytics(backend: TrainingBackend): boolean {
  return backend === 'yolo' || backend === 'rt_detr';
}

/**
 * Si el backend sabe continuar el ajuste desde un modelo ya entrenado aquí.
 *
 * La respuesta la da el catálogo (`supportsFineTune`, declarado en
 * `training/backends.rs`) para que no haya dos listas que se desincronicen. Con el
 * catálogo todavía en vuelo se cae a lo que siempre fue cierto —ultralytics hereda
 * pesos con `model = YOLO(best.pt)`— y así el botón no desaparece mientras la
 * lista viaja desde el backend.
 */
export function soportaFineTune(backend: TrainingBackend, catalogo: BackendInfo[]): boolean {
  const info = catalogo.find((b) => b.id === backend);
  return info ? info.supportsFineTune : esUltralytics(backend);
}
