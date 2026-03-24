import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { confirm } from '@/lib/dialogs';
import { Annotation } from '@/lib/db';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { useUIStore } from '../../core/store/uiStore';
import { annotationService } from '../services/annotationService';
import { useToast } from '@/components/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useP2pStore } from '@/features/p2p/store/p2pStore';

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
    console.log('[SaveGuard] Capturando contexto:', { imageId, projectId });
    set({ allowedImageId: imageId, allowedProjectId: projectId });
  },
  invalidateContext: () => {
    console.log('[SaveGuard] Invalidando contexto');
    set({ allowedImageId: null, allowedProjectId: null });
  },
  isContextValid: (imageId) => {
    const state = get();
    // Si no hay contexto capturado, permitir (modo normal)
    if (state.allowedImageId === null) return true;
    // Si hay contexto capturado, solo permitir si coincide
    return state.allowedImageId === imageId;
  },
}));

// Exportar funciones para usar desde AnnotationCanvas
export const captureSaveContext = (imageId: string | null, projectId: string | null) => {
  useSaveGuard.getState().captureContext(imageId, projectId);
};

export const invalidateSaveContext = () => {
  useSaveGuard.getState().invalidateContext();
};

interface AnnotationState {
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  setAnnotations: (annotations: Annotation[]) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  addAnnotationState: (annotation: Annotation) => void;
  updateAnnotationState: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotationState: (id: string) => void;
  clearAnnotationsState: () => void;
}

const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: [],
  selectedAnnotationId: null,
  setAnnotations: (annotations) => set({ annotations }),
  setSelectedAnnotationId: (id) => set({ selectedAnnotationId: id }),
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
      selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
    })),
  clearAnnotationsState: () => set({ annotations: [], selectedAnnotationId: null }),
}));

export function useAnnotations() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { image } = useCurrentImage();
  const currentProjectId = useUIStore((s) => s.currentProjectId);
  const {
    annotations,
    selectedAnnotationId,
    setAnnotations,
    setSelectedAnnotationId,
    addAnnotationState,
    updateAnnotationState,
    deleteAnnotationState,
    clearAnnotationsState,
  } = useAnnotationStore();

  // Fingerprint de las anotaciones para detectar cambios (inferencia, import, etc.)
  const annotationsFingerprint = image?.annotations
    ? `${image.annotations.length}:${image.annotations[0]?.id || ''}:${image.annotations[image.annotations.length - 1]?.id || ''}`
    : '';

  useEffect(() => {
    if (image) {
      setAnnotations(image.annotations || []);
    } else {
      setAnnotations([]);
      setSelectedAnnotationId(null);
    }
  }, [image?.id, annotationsFingerprint, setAnnotations, setSelectedAnnotationId]);

  const saveAnnotations = useCallback(async (targetAnnotations?: Annotation[], showToast = false) => {
    if (!image?.id || !currentProjectId) {
      console.log('[useAnnotations] saveAnnotations - no image.id o projectId, cancelando');
      return;
    }

    // P2P read-only guard: no guardar si el item no está asignado a mí
    const p2pState = useP2pStore.getState();
    if (currentProjectId && p2pState.sessions[currentProjectId] && p2pState.distributionByProject[currentProjectId]) {
      const checkId = image.videoId || image.id;
      const checkType: 'video' | 'image' = image.videoId ? 'video' : 'image';
      if (checkId && !p2pState.isItemAssignedToMe(currentProjectId, checkId, checkType)) {
        return;
      }
    }

    const annsToSave = targetAnnotations ?? useAnnotationStore.getState().annotations;
    console.log('[useAnnotations] saveAnnotations - guardando', annsToSave.length, 'anotaciones para imagen', image.id);

    try {
      await annotationService.save(currentProjectId, image.id, annsToSave);
      console.log('[useAnnotations] saveAnnotations - guardado exitoso');
      
      if (showToast) {
        toast({
          title: t('notifications.imageSaved'),
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('[useAnnotations] saveAnnotations - ERROR:', error);
      toast({
        title: t('notifications.error.saveImage'),
        variant: 'destructive',
      });
      throw error;
    }
  }, [image?.id, currentProjectId, toast, t]);

  const addAnnotation = useCallback(async (annotation: Annotation) => {
    const currentImageId = image?.id || null;
    
    // VALIDACIÓN CRÍTICA: Verificar contexto de guardado
    const isValid = useSaveGuard.getState().isContextValid(currentImageId);
    
    if (!currentImageId) {
      console.error('[useAnnotations] BLOQUEADO: No hay imagen activa');
      return;
    }
    
    if (!isValid) {
      console.error('[useAnnotations] BLOQUEADO: Contexto de guardado inválido', {
        imagenActual: currentImageId,
        imagenPermitida: useSaveGuard.getState().allowedImageId
      });
      return;
    }
    
    console.log('[useAnnotations] addAnnotation llamado con:', {
      id: annotation.id,
      type: annotation.type,
      classId: annotation.classId,
      hasData: !!annotation.data,
      imageId: currentImageId
    });
    
    addAnnotationState(annotation);
    
    // Auto-save using latest state from store
    const latestAnns = useAnnotationStore.getState().annotations;
    console.log('[useAnnotations] Guardando en DB, total annotations:', latestAnns.length, 'para imagen:', currentImageId);
    
    await saveAnnotations(latestAnns);
    
    console.log('[useAnnotations] Anotación guardada exitosamente en imagen:', currentImageId);
  }, [addAnnotationState, saveAnnotations, image?.id]);

  const updateAnnotation = useCallback(async (id: string, updates: Partial<Annotation>) => {
    updateAnnotationState(id, updates);
    // Auto-save using latest state from store
    const latestAnns = useAnnotationStore.getState().annotations;
    await saveAnnotations(latestAnns);
  }, [updateAnnotationState, saveAnnotations]);

  const updateAnnotationLocal = useCallback((id: string, updates: Partial<Annotation>) => {
    updateAnnotationState(id, updates);
  }, [updateAnnotationState]);

  const deleteAnnotation = useCallback(async (id: string) => {
    deleteAnnotationState(id);
    // Auto-save using latest state from store
    const latestAnns = useAnnotationStore.getState().annotations;
    await saveAnnotations(latestAnns);
  }, [deleteAnnotationState, saveAnnotations]);

  const selectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
  }, [setSelectedAnnotationId]);

  const clearAnnotations = useCallback(async () => {
    if (await confirm(t('common.clearConfirm'), { kind: 'warning' })) {
      clearAnnotationsState();
      await saveAnnotations([]);
    }
  }, [t, clearAnnotationsState, saveAnnotations]);

  // Undo (simple: remove last annotation)
  useEffect(() => {
    const handleUndo = async () => {
      const currentAnns = useAnnotationStore.getState().annotations;
      if (currentAnns.length > 0) {
        const updatedAnns = currentAnns.slice(0, -1);
        setAnnotations(updatedAnns);
        await saveAnnotations(updatedAnns);
      }
    };

    window.addEventListener('annotix:undo', handleUndo);
    return () => window.removeEventListener('annotix:undo', handleUndo);
  }, [setAnnotations, saveAnnotations]);

  // Keep annotix:save listener for explicit saves
  useEffect(() => {
    const handleSave = () => {
      saveAnnotations(undefined, true);
    };

    window.addEventListener('annotix:save', handleSave);
    return () => window.removeEventListener('annotix:save', handleSave);
  }, [saveAnnotations]);

  return {
    annotations,
    selectedAnnotationId,
    addAnnotation,
    updateAnnotation,
    updateAnnotationLocal,
    deleteAnnotation,
    selectAnnotation,
    clearAnnotations,
    saveAnnotations: () => saveAnnotations(undefined, true),
  };
}
