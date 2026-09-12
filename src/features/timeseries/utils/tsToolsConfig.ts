import type { ProjectType } from '@/lib/db';
import type { TSAnnotationTool } from '../hooks/useTSAnnotations';

/**
 * Herramientas de anotación disponibles por tipo de proyecto de serie temporal.
 *
 * El equivalente para imágenes es `canvas/config/toolsConfig.ts`. Aquí no
 * existía: los nueve tipos ofrecían las mismas cinco herramientas, y
 * `timeseries-classification` —que necesita una etiqueta para la serie
 * completa— no tenía ninguna que produjera su propio tipo de anotación.
 *
 * `select` está siempre: es navegar y seleccionar, no anotar.
 */
export const TS_PROJECT_TOOLS: Record<string, TSAnnotationTool[]> = {
  // Una etiqueta para la serie entera
  'timeseries-classification': ['select', 'classification'],
  // Tramos etiquetados a lo largo de la serie
  'timeseries-segmentation': ['select', 'range'],
  // Instantes marcados
  'event-detection': ['select', 'event', 'point'],
  // Puntos e intervalos anómalos
  'anomaly-detection': ['select', 'anomaly', 'range'],
  // Patrones recurrentes: intervalos con clase
  'pattern-recognition': ['select', 'range', 'point'],
  // Horizonte a predecir: un intervalo marcado
  'timeseries-forecasting': ['select', 'range', 'point'],
  // Objetivo por punto
  'timeseries-regression': ['select', 'point', 'range'],
  // Etiqueta de grupo para la serie entera
  clustering: ['select', 'classification'],
  // Huecos a rellenar: intervalos y puntos
  imputation: ['select', 'range', 'point'],
};

const DEFAULT_TOOLS: TSAnnotationTool[] = [
  'select',
  'point',
  'range',
  'event',
  'anomaly',
];

export function getTimeSeriesTools(projectType: ProjectType | undefined): TSAnnotationTool[] {
  if (!projectType) return DEFAULT_TOOLS;
  return TS_PROJECT_TOOLS[projectType] ?? DEFAULT_TOOLS;
}
