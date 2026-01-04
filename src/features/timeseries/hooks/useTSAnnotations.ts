// src/features/timeseries/hooks/useTSAnnotations.ts

import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { TimeSeriesAnnotation, TimeSeriesAnnotationData } from '@/lib/db';
import { timeseriesService } from '../services/timeseriesService';

export type TSAnnotationTool = 'point' | 'range' | 'event' | 'anomaly' | 'select';

interface UseTSAnnotationsProps {
  timeseriesId: number | null;
}

export function useTSAnnotations({ timeseriesId }: UseTSAnnotationsProps) {
  const [annotations, setAnnotations] = useState<TimeSeriesAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<TSAnnotationTool>('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempAnnotation, setTempAnnotation] = useState<Partial<TimeSeriesAnnotation> | null>(null);

  // Load annotations when timeseries changes
  useEffect(() => {
    if (!timeseriesId) {
      setAnnotations([]);
      return;
    }

    const loadAnnotations = async () => {
      const ts = await timeseriesService.getById(timeseriesId);
      if (ts) {
        setAnnotations(ts.annotations);
      }
    };

    loadAnnotations();
  }, [timeseriesId]);

  /**
   * Add a new annotation
   */
  const addAnnotation = useCallback(
    async (
      type: TimeSeriesAnnotation['type'],
      data: TimeSeriesAnnotationData,
      classId?: number
    ) => {
      if (!timeseriesId) return;

      const newAnnotation: TimeSeriesAnnotation = {
        id: uuidv4(),
        type,
        classId,
        data,
      };

      const updatedAnnotations = [...annotations, newAnnotation];
      setAnnotations(updatedAnnotations);

      // Save to database
      await timeseriesService.saveAnnotations(timeseriesId, updatedAnnotations);

      return newAnnotation;
    },
    [timeseriesId, annotations]
  );

  /**
   * Update an existing annotation
   */
  const updateAnnotation = useCallback(
    async (annotationId: string, data: Partial<TimeSeriesAnnotationData>) => {
      if (!timeseriesId) return;

      const updatedAnnotations = annotations.map((ann) => {
        if (ann.id === annotationId) {
          return {
            ...ann,
            data: { ...ann.data, ...data },
          };
        }
        return ann;
      });

      setAnnotations(updatedAnnotations);
      await timeseriesService.saveAnnotations(timeseriesId, updatedAnnotations);
    },
    [timeseriesId, annotations]
  );

  /**
   * Delete an annotation
   */
  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!timeseriesId) return;

      const updatedAnnotations = annotations.filter((ann) => ann.id !== annotationId);
      setAnnotations(updatedAnnotations);

      await timeseriesService.saveAnnotations(timeseriesId, updatedAnnotations);

      if (selectedAnnotationId === annotationId) {
        setSelectedAnnotationId(null);
      }
    },
    [timeseriesId, annotations, selectedAnnotationId]
  );

  /**
   * Delete all annotations
   */
  const clearAnnotations = useCallback(async () => {
    if (!timeseriesId) return;

    setAnnotations([]);
    await timeseriesService.saveAnnotations(timeseriesId, []);
    setSelectedAnnotationId(null);
  }, [timeseriesId]);

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
          },
        });
      }
    },
    [activeTool]
  );

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
  };
}
