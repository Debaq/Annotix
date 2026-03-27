import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Annotation, InterpolatedBBox, BBoxData } from '@/lib/db';
import { useVideoTracks } from './useVideoTracks';
import { useUIStore } from '../../core/store/uiStore';

const VKF_PREFIX = 'vkf::';

/**
 * Bridge que expone la interfaz de useAnnotations pero redirige
 * creación/edición/borrado al sistema de tracks/keyframes de video.
 *
 * Coordenadas:
 *  - Keyframes/InterpolatedBBox → porcentajes 0-100
 *  - Annotations del canvas      → píxeles
 *
 * Comportamiento:
 *  - Auto-crea keyframes al navegar a un frame nuevo
 *  - Todas las bboxes (keyframes + interpoladas + deshabilitadas) son editables
 *  - Toggle ojo: desactiva/activa la bbox en ese frame
 */
export function useVideoAnnotationBridge(
  interpolatedBBoxes: InterpolatedBBox[],
  frameIndex: number,
  imageWidth: number,
  imageHeight: number,
) {
  const { createTrack, setKeyframe, removeKeyframe, toggleKeyframe } = useVideoTracks();
  const { activeClassId } = useUIStore();

  // Estado local para drag/resize fluido antes de persistir
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<BBoxData>>>({});

  // Limpiar overrides locales cuando cambia de frame
  const prevFrameRef = useRef(frameIndex);
  useEffect(() => {
    if (prevFrameRef.current !== frameIndex) {
      setLocalOverrides({});
      prevFrameRef.current = frameIndex;
    }
  }, [frameIndex]);

  // (Auto-keyframe eliminado: solo se crean keyframes al editar/mover una bbox)

  // Todas las bboxes del frame (incluyendo deshabilitadas)
  const allBBoxes = useMemo(() => interpolatedBBoxes, [interpolatedBBoxes]);

  // IDs de anotaciones deshabilitadas
  const disabledAnnotationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of interpolatedBBoxes) {
      if (!b.enabled) ids.add(VKF_PREFIX + b.trackId);
    }
    return ids;
  }, [interpolatedBBoxes]);

  // Conversión porcentajes → píxeles
  const pctToPx = useCallback(
    (pctX: number, pctY: number, pctW: number, pctH: number): BBoxData => ({
      x: (pctX / 100) * imageWidth,
      y: (pctY / 100) * imageHeight,
      width: (pctW / 100) * imageWidth,
      height: (pctH / 100) * imageHeight,
    }),
    [imageWidth, imageHeight],
  );

  // Conversión píxeles → porcentajes
  const pxToPct = useCallback(
    (px: BBoxData) => ({
      x: (px.x / imageWidth) * 100,
      y: (px.y / imageHeight) * 100,
      width: (px.width / imageWidth) * 100,
      height: (px.height / imageHeight) * 100,
    }),
    [imageWidth, imageHeight],
  );

  // Anotaciones sintéticas para el canvas (en píxeles)
  const annotations: Annotation[] = useMemo(() => {
    if (!imageWidth || !imageHeight) return [];

    return allBBoxes.map((b) => {
      const id = VKF_PREFIX + b.trackId;
      const base = pctToPx(b.bbox.x, b.bbox.y, b.bbox.width, b.bbox.height);
      const override = localOverrides[id];
      return {
        id,
        type: 'bbox' as const,
        classId: b.classId,
        data: override ? { ...base, ...override } : base,
      };
    });
  }, [allBBoxes, imageWidth, imageHeight, pctToPx, localOverrides]);

  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<Set<string>>(new Set());

  const selectedAnnotationId = selectedAnnotationIds.size > 0
    ? [...selectedAnnotationIds][0]
    : null;

  const selectAnnotation = useCallback((id: string | null, addToSelection = false) => {
    if (id === null) {
      setSelectedAnnotationIds(new Set());
    } else if (addToSelection) {
      setSelectedAnnotationIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedAnnotationIds(new Set([id]));
    }
  }, []);

  // Crear bbox → crear track + keyframe
  const addAnnotation = useCallback(async (annotation: Annotation) => {
    if (annotation.type !== 'bbox') return;
    const classId = annotation.classId ?? activeClassId;
    if (classId === null || classId === undefined) return;

    const trackId = await createTrack(classId);
    if (!trackId) return;

    const data = annotation.data as BBoxData;
    const pct = pxToPct(data);

    await new Promise(r => setTimeout(r, 50));
    await setKeyframe(trackId, frameIndex, pct.x, pct.y, pct.width, pct.height);
  }, [activeClassId, createTrack, setKeyframe, frameIndex, pxToPct]);

  // Actualizar bbox → crear/actualizar keyframe del track (funciona para keyframes e interpoladas)
  const updateAnnotation = useCallback(async (id: string, updates: Partial<Annotation>) => {
    if (!id.startsWith(VKF_PREFIX)) return;
    const trackId = id.slice(VKF_PREFIX.length);

    setLocalOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const data = updates.data as BBoxData | undefined;
    if (!data) return;

    const current = annotations.find(a => a.id === id);
    const merged: BBoxData = current
      ? { ...(current.data as BBoxData), ...data }
      : data as BBoxData;

    const pct = pxToPct(merged);
    await setKeyframe(trackId, frameIndex, pct.x, pct.y, pct.width, pct.height);
  }, [annotations, setKeyframe, frameIndex, pxToPct]);

  // Update local (drag fluido sin persistir)
  const updateAnnotationLocal = useCallback((id: string, updates: Partial<Annotation>) => {
    const data = updates.data as BBoxData | undefined;
    if (!data) return;
    setLocalOverrides(prev => ({ ...prev, [id]: { ...prev[id], ...data } }));
  }, []);

  // Borrar keyframe del frame actual
  const deleteAnnotation = useCallback(async (id: string) => {
    if (!id.startsWith(VKF_PREFIX)) return;
    const trackId = id.slice(VKF_PREFIX.length);
    await removeKeyframe(trackId, frameIndex);
    if (selectedAnnotationIds.has(id)) {
      setSelectedAnnotationIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [removeKeyframe, frameIndex, selectedAnnotationIds]);

  // Toggle habilitado/deshabilitado en este frame
  const onToggleAnnotation = useCallback(async (id: string) => {
    if (!id.startsWith(VKF_PREFIX)) return;
    const trackId = id.slice(VKF_PREFIX.length);
    const bbox = interpolatedBBoxes.find(b => b.trackId === trackId);
    if (!bbox) return;

    // Si no hay keyframe en este frame, crear uno primero
    if (!bbox.isKeyframe) {
      await setKeyframe(trackId, frameIndex, bbox.bbox.x, bbox.bbox.y, bbox.bbox.width, bbox.bbox.height);
      await new Promise(r => setTimeout(r, 50));
    }

    await toggleKeyframe(trackId, frameIndex, !bbox.enabled);
  }, [interpolatedBBoxes, setKeyframe, toggleKeyframe, frameIndex]);

  const clearAnnotations = useCallback(async () => {}, []);
  const saveAnnotations = useCallback(() => {}, []);

  return {
    annotations,
    selectedAnnotationId,
    selectedAnnotationIds,
    selectAnnotation,
    addAnnotation,
    updateAnnotation,
    updateAnnotationLocal,
    deleteAnnotation,
    clearAnnotations,
    saveAnnotations,
    disabledAnnotationIds,
    onToggleAnnotation,
  };
}
