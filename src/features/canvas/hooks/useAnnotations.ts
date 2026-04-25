import { useEffect, useCallback, useRef } from 'react';
import { create } from 'zustand';
import { confirm } from '@/lib/dialogs';
import { Annotation } from '@/lib/db';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { useUIStore } from '../../core/store/uiStore';
import { annotationService } from '../services/annotationService';
import { useToast } from '@/components/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useP2pStore } from '@/features/p2p/store/p2pStore';
import { useUndoStore } from '../store/undoStore';

// Store global para control de guardado válido
interface SaveGuardStore {
  allowedImageId: string | null;
  allowedProjectId: string | null;
  captureContext: (imageId: string | null, projectId: string | null) => void;
  invalidateContext: () => void;
  isContextValid: (imageId: string | null) => boolean;
}

const useSaveGuard = create<SaveGuardStore>((set, get) => ({
  allowedImageId: null,
  allowedProjectId: null,
  captureContext: (imageId: string | null, projectId: string | null) => {
    set({ allowedImageId: imageId, allowedProjectId: projectId });
  },
  invalidateContext: () => {
    set({ allowedImageId: null, allowedProjectId: null });
  },
  isContextValid: (imageId) => {
    const state = get();
    if (state.allowedImageId === null) return true;
    return state.allowedImageId === imageId;
  },
}));

export const captureSaveContext = (imageId: string | null, projectId: string | null) => {
  useSaveGuard.getState().captureContext(imageId, projectId);
};

export const invalidateSaveContext = () => {
  useSaveGuard.getState().invalidateContext();
};

interface AnnotationState {
  annotations: Annotation[];
  selectedAnnotationIds: Set<string>;
  hiddenAnnotationIds: Set<string>;
  setAnnotations: (annotations: Annotation[]) => void;
  setSelectedAnnotationIds: (ids: Set<string>) => void;
  toggleAnnotationVisibility: (id: string) => void;
  addAnnotationState: (annotation: Annotation) => void;
  updateAnnotationState: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotationState: (id: string) => void;
  clearAnnotationsState: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: [],
  selectedAnnotationIds: new Set(),
  hiddenAnnotationIds: new Set(),
  setAnnotations: (annotations) => set({ annotations }),
  setSelectedAnnotationIds: (ids) => set({ selectedAnnotationIds: ids }),
  toggleAnnotationVisibility: (id) =>
    set((state) => {
      const next = new Set(state.hiddenAnnotationIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { hiddenAnnotationIds: next };
    }),
  addAnnotationState: (annotation) =>
    set((state) => ({ annotations: [...state.annotations, annotation] })),
  updateAnnotationState: (id, updates) =>
    set((state) => ({
      annotations: state.annotations.map((ann) =>
        ann.id === id ? { ...ann, ...updates } : ann
      ),
    })),
  deleteAnnotationState: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((ann) => ann.id !== id),
      selectedAnnotationIds: state.selectedAnnotationIds.has(id)
        ? new Set([...state.selectedAnnotationIds].filter(x => x !== id))
        : state.selectedAnnotationIds,
    })),
  clearAnnotationsState: () => set({ annotations: [], selectedAnnotationIds: new Set(), hiddenAnnotationIds: new Set() }),
}));

// Contador global de saves en curso — bloquea sync externo mientras guardamos
let pendingSaves = 0;

// Guard para evitar que múltiples instancias de useAnnotations ejecuten undo/redo
// simultáneamente (cada componente que llama useAnnotations registra su propio listener)
let _undoRedoInProgress = false;

function fingerprint(anns: Annotation[] | undefined): string {
  if (!anns || anns.length === 0) return '';
  return `${anns.length}:${anns[0]?.id || ''}:${anns[anns.length - 1]?.id || ''}`;
}

export function useAnnotations() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { image, reload } = useCurrentImage();
  const currentProjectId = useUIStore((s) => s.currentProjectId);
  const {
    annotations,
    selectedAnnotationIds,
    hiddenAnnotationIds,
    setAnnotations,
    setSelectedAnnotationIds,
    toggleAnnotationVisibility,
    addAnnotationState,
    updateAnnotationState,
    deleteAnnotationState,
    clearAnnotationsState,
  } = useAnnotationStore();

  const imageFingerprint = fingerprint(image?.annotations);
  const undoStore = useUndoStore();
  const prevImageIdRef = useRef<string | null>(null);

  // Sync image → store.
  // Se bloquea durante saves locales para que no sobrescriba cambios optimistas.
  // Después de cada save local, reload() fuerza una recarga que re-dispara este effect.
  useEffect(() => {
    // Si cambió la imagen, sincronizar siempre (aunque haya saves pendientes
    // de la imagen anterior — los saves se hacen contra el id capturado, no
    // sobrescriben la nueva). Sin esto, el canvas queda mostrando annotations
    // viejas al cambiar rápido entre imágenes.
    const imageChanged = prevImageIdRef.current !== (image?.id ?? null);
    if (!imageChanged && pendingSaves > 0) return;
    if (image) {
      setAnnotations(image.annotations || []);
      if (imageChanged) {
        prevImageIdRef.current = image.id ?? null;
        setSelectedAnnotationIds(new Set());
        undoStore.reset(image.id ?? null);
      }
    } else {
      setAnnotations([]);
      setSelectedAnnotationIds(new Set());
      if (prevImageIdRef.current !== null) {
        prevImageIdRef.current = null;
        undoStore.reset(null);
      }
    }
  }, [image?.id, imageFingerprint, setAnnotations, setSelectedAnnotationIds]);

  const saveAnnotations = useCallback(async (targetAnnotations?: Annotation[], showToast = false) => {
    if (!image?.id || !currentProjectId) return;

    // P2P read-only guard
    const p2pState = useP2pStore.getState();
    if (currentProjectId && p2pState.sessions[currentProjectId] && p2pState.distributionByProject[currentProjectId]) {
      const checkId = image.videoId || image.id;
      const checkType: 'video' | 'image' = image.videoId ? 'video' : 'image';
      if (checkId && !p2pState.isItemAssignedToMe(currentProjectId, checkId, checkType)) {
        return;
      }
    }

    const annsToSave = targetAnnotations ?? useAnnotationStore.getState().annotations;

    pendingSaves++;
    try {
      await annotationService.save(currentProjectId, image.id, annsToSave);
      if (showToast) {
        toast({ title: t('notifications.imageSaved'), duration: 2000 });
      }
    } catch (error) {
      console.error('[useAnnotations] saveAnnotations - ERROR:', error);
      toast({ title: t('notifications.error.saveImage'), variant: 'destructive' });
      throw error;
    } finally {
      pendingSaves--;
    }
  }, [image?.id, currentProjectId, toast, t]);

  // ─── Debounce para saves durante drag de bbox ──────────────────────────────
  // Cada movimiento de mouse podría disparar un invoke; agrupamos a 300ms.
  // Flush inmediato al cambiar de imagen, en mouseup global y al desmontar.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ projectId: string; imageId: string; annotations: Annotation[] } | null>(null);

  const flushPendingSave = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    try {
      pendingSaves++;
      await annotationService.save(pending.projectId, pending.imageId, pending.annotations);
    } catch (error) {
      console.error('[useAnnotations] flushPendingSave - ERROR:', error);
    } finally {
      pendingSaves--;
    }
  }, []);

  const saveAnnotationsDebounced = useCallback((targetAnnotations?: Annotation[]) => {
    if (!image?.id || !currentProjectId) return;
    const annsToSave = (targetAnnotations ?? useAnnotationStore.getState().annotations).map(a => ({ ...a }));
    pendingSaveRef.current = {
      projectId: currentProjectId,
      imageId: image.id,
      annotations: annsToSave,
    };
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void flushPendingSave();
    }, 300);
  }, [image?.id, currentProjectId, flushPendingSave]);

  // Flush al cambiar de imagen
  useEffect(() => {
    return () => {
      // Al cambiar image.id o desmontar: flush sincrónico (best-effort)
      void flushPendingSave();
    };
  }, [image?.id, flushPendingSave]);

  // Flush en mouseup global (asegura escritura tras drag de bbox)
  useEffect(() => {
    const handleMouseUp = () => { void flushPendingSave(); };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('pointerup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('pointerup', handleMouseUp);
    };
  }, [flushPendingSave]);

  const pushUndo = useCallback(() => {
    const current = useAnnotationStore.getState().annotations;
    useUndoStore.getState().pushState(current.map(a => ({ ...a })));
  }, []);

  const addAnnotation = useCallback(async (annotation: Annotation) => {
    const currentImageId = image?.id || null;
    if (!currentImageId) return;
    if (!useSaveGuard.getState().isContextValid(currentImageId)) return;

    pushUndo();
    addAnnotationState(annotation);
    const latestAnns = useAnnotationStore.getState().annotations;
    await saveAnnotations(latestAnns);
  }, [addAnnotationState, saveAnnotations, image?.id, pushUndo]);

  const updateAnnotation = useCallback(async (id: string, updates: Partial<Annotation>) => {
    pushUndo();
    updateAnnotationState(id, updates);
    const latestAnns = useAnnotationStore.getState().annotations;
    await saveAnnotations(latestAnns);
  }, [updateAnnotationState, saveAnnotations, pushUndo]);

  const updateAnnotationLocal = useCallback((id: string, updates: Partial<Annotation>) => {
    updateAnnotationState(id, updates);
  }, [updateAnnotationState]);

  // Variante debounced para drags continuos (mouse move).
  // No empuja undo cada movimiento — el caller debe pushUndo() al iniciar el drag.
  const updateAnnotationDebounced = useCallback((id: string, updates: Partial<Annotation>) => {
    updateAnnotationState(id, updates);
    saveAnnotationsDebounced();
  }, [updateAnnotationState, saveAnnotationsDebounced]);

  const deleteAnnotation = useCallback(async (id: string) => {
    pushUndo();
    deleteAnnotationState(id);
    const latestAnns = useAnnotationStore.getState().annotations;
    await saveAnnotations(latestAnns);
    await reload();
  }, [deleteAnnotationState, saveAnnotations, reload, pushUndo]);

  // Compatibilidad: selectedAnnotationId devuelve el primero del set (o null)
  const selectedAnnotationId = selectedAnnotationIds.size > 0
    ? [...selectedAnnotationIds][0]
    : null;

  const selectAnnotation = useCallback((id: string | null, addToSelection = false) => {
    if (id === null) {
      setSelectedAnnotationIds(new Set());
      return;
    }
    let nextIds: Set<string>;
    if (addToSelection) {
      const current = useAnnotationStore.getState().selectedAnnotationIds;
      nextIds = new Set(current);
      if (nextIds.has(id)) nextIds.delete(id);
      else nextIds.add(id);
    } else {
      nextIds = new Set([id]);
    }
    setSelectedAnnotationIds(nextIds);

    // Auto-sync clase activa con la selección si todas comparten la misma clase
    const allAnns = useAnnotationStore.getState().annotations;
    const selected = allAnns.filter((a) => nextIds.has(a.id));
    if (selected.length === 0) return;
    const firstClassId = selected[0].classId;
    if (firstClassId == null) return;
    const allSame = selected.every((a) => a.classId === firstClassId);
    if (allSame) {
      const ui = useUIStore.getState();
      if (ui.activeClassId !== firstClassId) ui.setActiveClassId(firstClassId);
    }
  }, [setSelectedAnnotationIds]);

  const replaceAnnotations = useCallback(async (newAnnotations: Annotation[]) => {
    if (!image?.id || !currentProjectId) return;
    pushUndo();
    setAnnotations(newAnnotations);
    await saveAnnotations(newAnnotations);
  }, [image?.id, currentProjectId, setAnnotations, saveAnnotations, pushUndo]);

  const clearAnnotations = useCallback(async () => {
    if (await confirm(t('common.clearConfirm'), { kind: 'warning' })) {
      pushUndo();
      clearAnnotationsState();
      await saveAnnotations([]);
      await reload();
    }
  }, [t, clearAnnotationsState, saveAnnotations, reload, pushUndo]);

  useEffect(() => {
    const handleUndo = async () => {
      if (_undoRedoInProgress) return;
      _undoRedoInProgress = true;
      try {
        const currentAnns = useAnnotationStore.getState().annotations;
        const restored = useUndoStore.getState().undo(currentAnns.map(a => ({ ...a })));
        if (restored) {
          setAnnotations(restored);
          await saveAnnotations(restored);
          await reload();
        }
      } finally {
        _undoRedoInProgress = false;
      }
    };
    window.addEventListener('annotix:undo', handleUndo);
    return () => window.removeEventListener('annotix:undo', handleUndo);
  }, [setAnnotations, saveAnnotations, reload]);

  useEffect(() => {
    const handleRedo = async () => {
      if (_undoRedoInProgress) return;
      _undoRedoInProgress = true;
      try {
        const currentAnns = useAnnotationStore.getState().annotations;
        const restored = useUndoStore.getState().redo(currentAnns.map(a => ({ ...a })));
        if (restored) {
          setAnnotations(restored);
          await saveAnnotations(restored);
          await reload();
        }
      } finally {
        _undoRedoInProgress = false;
      }
    };
    window.addEventListener('annotix:redo', handleRedo);
    return () => window.removeEventListener('annotix:redo', handleRedo);
  }, [setAnnotations, saveAnnotations, reload]);

  useEffect(() => {
    const handleSave = () => { saveAnnotations(undefined, true); };
    window.addEventListener('annotix:save', handleSave);
    return () => window.removeEventListener('annotix:save', handleSave);
  }, [saveAnnotations]);

  // Auto-sync activeClassId con la selección (cubre selección por lasso/box/teclado)
  useEffect(() => {
    if (selectedAnnotationIds.size === 0) return;
    const selected = annotations.filter((a) => selectedAnnotationIds.has(a.id));
    if (selected.length === 0) return;
    const firstClassId = selected[0].classId;
    if (firstClassId == null) return;
    const allSame = selected.every((a) => a.classId === firstClassId);
    if (!allSame) return;
    const ui = useUIStore.getState();
    if (ui.activeClassId !== firstClassId) ui.setActiveClassId(firstClassId);
  }, [selectedAnnotationIds, annotations]);

  return {
    annotations,
    selectedAnnotationId,
    selectedAnnotationIds,
    hiddenAnnotationIds,
    toggleAnnotationVisibility,
    addAnnotation,
    updateAnnotation,
    updateAnnotationLocal,
    updateAnnotationDebounced,
    flushPendingSave,
    deleteAnnotation,
    replaceAnnotations,
    selectAnnotation,
    clearAnnotations,
    saveAnnotations: () => saveAnnotations(undefined, true),
  };
}
