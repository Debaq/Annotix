import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { Annotation } from '@/lib/db';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { annotationService } from '../services/annotationService';
import { useToast } from '@/components/hooks/use-toast';
import { useTranslation } from 'react-i18next';

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

  useEffect(() => {
    if (image) {
      setAnnotations(image.annotations || []);
      setSelectedAnnotationId(null);
    } else {
      setAnnotations([]);
      setSelectedAnnotationId(null);
    }
  }, [image?.id, setAnnotations, setSelectedAnnotationId]);

  const saveAnnotations = useCallback(async (targetAnnotations?: Annotation[], showToast = false) => {
    if (!image?.id) return;

    const annsToSave = targetAnnotations ?? useAnnotationStore.getState().annotations;
    try {
      await annotationService.save(image.id, annsToSave);
      if (showToast) {
        toast({
          title: t('notifications.imageSaved'),
          duration: 2000,
        });
      }
    } catch (error) {
      console.error('Failed to save annotations:', error);
      toast({
        title: t('notifications.error.saveImage'),
        variant: 'destructive',
      });
      throw error;
    }
  }, [image?.id, toast, t]);

  const addAnnotation = useCallback(async (annotation: Annotation) => {
    addAnnotationState(annotation);
    // Auto-save using latest state from store
    const latestAnns = useAnnotationStore.getState().annotations;
    await saveAnnotations(latestAnns);
  }, [addAnnotationState, saveAnnotations]);

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
    if (confirm(t('common.clearConfirm'))) {
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
