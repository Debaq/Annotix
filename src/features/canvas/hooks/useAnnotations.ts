import { useState, useEffect } from 'react';
import { Annotation } from '@/lib/db';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { annotationService } from '../services/annotationService';

export function useAnnotations() {
  const { image, reload } = useCurrentImage();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  useEffect(() => {
    if (image) {
      setAnnotations(image.annotations);
    } else {
      setAnnotations([]);
    }
  }, [image]);

  const addAnnotation = (annotation: Annotation) => {
    setAnnotations((prev) => [...prev, annotation]);
  };

  const updateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.id === id ? { ...ann, ...updates } : ann))
    );
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
  };

  const clearAnnotations = () => {
    if (confirm('Are you sure you want to clear all annotations?')) {
      setAnnotations([]);
    }
  };

  const saveAnnotations = async () => {
    if (!image?.id) return;

    try {
      await annotationService.save(image.id, annotations);
      await reload();
    } catch (error) {
      console.error('Failed to save annotations:', error);
      throw error;
    }
  };

  // Auto-save on custom event
  useEffect(() => {
    const handleSave = () => {
      saveAnnotations();
    };

    window.addEventListener('annotix:save', handleSave);
    return () => window.removeEventListener('annotix:save', handleSave);
  }, [image, annotations]);

  // Undo (simple: remove last annotation)
  useEffect(() => {
    const handleUndo = () => {
      if (annotations.length > 0) {
        setAnnotations((prev) => prev.slice(0, -1));
      }
    };

    window.addEventListener('annotix:undo', handleUndo);
    return () => window.removeEventListener('annotix:undo', handleUndo);
  }, [annotations]);

  return {
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,
    saveAnnotations,
  };
}
