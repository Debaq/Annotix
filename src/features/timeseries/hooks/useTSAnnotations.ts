// src/features/timeseries/hooks/useTSAnnotations.ts

import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { TimeSeriesAnnotation, TimeSeriesAnnotationData } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { timeseriesService } from '../services/timeseriesService';

export type TSAnnotationTool =
  | 'point'
  | 'range'
  | 'event'
  | 'anomaly'
  | 'classification'
  | 'select';

interface UseTSAnnotationsProps {
  timeseriesId: string | null;
}

export function useTSAnnotations({ timeseriesId }: UseTSAnnotationsProps) {
  const { currentProjectId } = useUIStore();
  const [annotations, setAnnotations] = useState<TimeSeriesAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<TSAnnotationTool>('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempAnnotation, setTempAnnotation] = useState<Partial<TimeSeriesAnnotation> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Load annotations when timeseries changes
  useEffect(() => {
    if (!timeseriesId || !currentProjectId) {
      setAnnotations([]);
      return;
    }

    const loadAnnotations = async () => {
      const ts = await timeseriesService.getById(currentProjectId, timeseriesId);
      if (ts) {
        setAnnotations(ts.annotations);
      }
    };

    loadAnnotations();
  }, [timeseriesId, currentProjectId]);

  /**
   * Aplica una transformación sobre la lista de anotaciones y la persiste.
   *
   * Todas las mutaciones pasan por aquí y calculan la lista nueva a partir del
   * estado más reciente (`setAnnotations(prev => …)`), no del capturado en el
   * closure: dos anotaciones creadas antes de que la primera terminara de
   * guardarse partían del mismo array y la segunda escritura pisaba la primera.
   */
  const mutate = useCallback(
    async (transform: (prev: TimeSeriesAnnotation[]) => TimeSeriesAnnotation[]) => {
      if (!timeseriesId || !currentProjectId) return null;

      let next: TimeSeriesAnnotation[] = [];
      setAnnotations((prev) => {
        next = transform(prev);
        return next;
      });

      // La cola serializa las escrituras: el backend reemplaza la lista
      // completa, así que dos guardados en vuelo se sobrescribirían.
      const run = async () => {
        await timeseriesService.saveAnnotations(currentProjectId, timeseriesId, next);
      };
      saveQueueRef.current = saveQueueRef.current.then(run, run);
      await saveQueueRef.current;
      return next;
    },
    [timeseriesId, currentProjectId]
  );

  /**
   * Add a new annotation
   */
  const addAnnotation = useCallback(
    async (
      type: TimeSeriesAnnotation['type'],
      data: TimeSeriesAnnotationData,
      classId?: number
    ) => {
      if (!timeseriesId || !currentProjectId) return;

      const newAnnotation: TimeSeriesAnnotation = {
        id: uuidv4(),
        type,
        classId,
        data,
      };

      // Una serie solo puede tener una clasificación global: la nueva reemplaza
      // la anterior en vez de acumularse.
      await mutate((prev) =>
        type === 'classification'
          ? [...prev.filter((a) => a.type !== 'classification'), newAnnotation]
          : [...prev, newAnnotation]
      );

      return newAnnotation;
    },
    [timeseriesId, currentProjectId, mutate]
  );

  /**
   * Update an existing annotation
   */
  const updateAnnotation = useCallback(
    async (annotationId: string, data: Partial<TimeSeriesAnnotationData>) => {
      await mutate((prev) =>
        prev.map((ann) =>
          ann.id === annotationId ? { ...ann, data: { ...ann.data, ...data } } : ann
        )
      );
    },
    [mutate]
  );

  /**
   * Delete an annotation
   */
  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      await mutate((prev) => prev.filter((ann) => ann.id !== annotationId));
      setSelectedAnnotationId((current) => (current === annotationId ? null : current));
    },
    [mutate]
  );

  /**
   * Delete all annotations
   */
  const clearAnnotations = useCallback(async () => {
    await mutate(() => []);
    setSelectedAnnotationId(null);
  }, [mutate]);

  /**
   * Start drawing a new annotation
   */
  const startDrawing = useCallback(
    (timestamp: number, value?: number) => {
      setIsDrawing(true);

      if (activeTool === 'point') {
        setTempAnnotation({
          type: 'point',
          data: {
            timestamp,
            value,
          },
        });
      } else if (activeTool === 'range') {
        setTempAnnotation({
          type: 'range',
          data: {
            startTimestamp: timestamp,
            endTimestamp: timestamp,
          },
        });
      } else if (activeTool === 'event') {
        setTempAnnotation({
          type: 'event',
          data: {
            timestamp,
            eventType: 'custom',
          },
        });
      } else if (activeTool === 'anomaly') {
        setTempAnnotation({
          type: 'anomaly',
          data: {
            timestamp,
            score: 1.0,
            value,
          },
        });
      }
    },
    [activeTool]
  );

  /**
   * Etiqueta la serie completa con una clase. Es la anotación que pide
   * `timeseries-classification`, que hasta ahora existía como tipo en el modelo
   * de datos y no tenía ninguna forma de crearse desde la interfaz.
   */
  const setSeriesClassification = useCallback(
    async (classId: number) => {
      await addAnnotation('classification', { classId }, classId);
    },
    [addAnnotation]
  );

  /** Clasificación global actual de la serie, si tiene. */
  const seriesClassification =
    annotations.find((ann) => ann.type === 'classification') ?? null;

  /**
   * Update drawing (for range annotations)
   */
  const updateDrawing = useCallback((timestamp: number) => {
    if (!isDrawing || !tempAnnotation) return;

    if (tempAnnotation.type === 'range') {
      setTempAnnotation({
        ...tempAnnotation,
        data: {
          ...(tempAnnotation.data as any),
          endTimestamp: timestamp,
        },
      });
    }
  }, [isDrawing, tempAnnotation]);

  /**
   * Finish drawing and save annotation
   */
  const finishDrawing = useCallback(
    async (classId?: number) => {
      if (!tempAnnotation || !timeseriesId) return;

      await addAnnotation(
        tempAnnotation.type as TimeSeriesAnnotation['type'],
        tempAnnotation.data as TimeSeriesAnnotationData,
        classId
      );

      setIsDrawing(false);
      setTempAnnotation(null);
    },
    [tempAnnotation, timeseriesId, addAnnotation]
  );

  /**
   * Cancel drawing
   */
  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setTempAnnotation(null);
  }, []);

  /**
   * Select an annotation
   */
  const selectAnnotation = useCallback((annotationId: string | null) => {
    setSelectedAnnotationId(annotationId);
  }, []);

  /**
   * Get selected annotation object
   */
  const selectedAnnotation = selectedAnnotationId
    ? annotations.find((ann) => ann.id === selectedAnnotationId) || null
    : null;

  /**
   * Get annotations by type
   */
  const getAnnotationsByType = useCallback(
    (type: TimeSeriesAnnotation['type']) => {
      return annotations.filter((ann) => ann.type === type);
    },
    [annotations]
  );

  return {
    annotations,
    selectedAnnotation,
    selectedAnnotationId,
    activeTool,
    isDrawing,
    tempAnnotation,
    setActiveTool,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    startDrawing,
    updateDrawing,
    finishDrawing,
    cancelDrawing,
    selectAnnotation,
    getAnnotationsByType,
    setSeriesClassification,
    seriesClassification,
  };
}
