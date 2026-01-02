import { useState, useEffect } from 'react';
import { Annotation, ClassificationData } from '@/lib/db';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { annotationService } from '../../canvas/services/annotationService';

export function useClassification() {
  const { image, reload } = useCurrentImage();
  const { project } = useCurrentProject();
  const [selectedLabels, setSelectedLabels] = useState<number[]>([]);

  // Load existing classification annotation
  useEffect(() => {
    if (image) {
      const classificationAnnotation = image.annotations.find(
        (ann) => ann.type === 'classification' || ann.type === 'multi-label-classification'
      );
      if (classificationAnnotation) {
        const data = classificationAnnotation.data as ClassificationData;
        setSelectedLabels(data.labels);
      } else {
        setSelectedLabels([]);
      }
    } else {
      setSelectedLabels([]);
    }
  }, [image]);

  const toggleLabel = (classId: number) => {
    if (!project) return;

    const isMultiLabel = project.type === 'multi-label-classification';

    if (isMultiLabel) {
      // Multi-label: toggle label in array
      setSelectedLabels((prev) =>
        prev.includes(classId)
          ? prev.filter((id) => id !== classId)
          : [...prev, classId]
      );
    } else {
      // Single-label: replace with new label
      setSelectedLabels([classId]);
    }
  };

  const clearLabels = () => {
    setSelectedLabels([]);
  };

  const saveClassification = async () => {
    if (!image?.id || !project) return;

    try {
      // Remove existing classification annotation
      const otherAnnotations = image.annotations.filter(
        (ann) => ann.type !== 'classification' && ann.type !== 'multi-label-classification'
      );

      // Create new classification annotation if labels selected
      const newAnnotations: Annotation[] = [...otherAnnotations];

      if (selectedLabels.length > 0) {
        const classificationAnnotation: Annotation = {
          id: crypto.randomUUID(),
          type: project.type as 'classification' | 'multi-label-classification',
          classId: selectedLabels[0], // For compatibility, use first label
          data: {
            labels: selectedLabels,
          } as ClassificationData,
        };
        newAnnotations.push(classificationAnnotation);
      }

      await annotationService.save(image.id, newAnnotations);
      await reload();
    } catch (error) {
      console.error('Failed to save classification:', error);
      throw error;
    }
  };

  // Auto-save on custom event
  useEffect(() => {
    const handleSave = () => {
      saveClassification();
    };

    window.addEventListener('annotix:save', handleSave);
    return () => window.removeEventListener('annotix:save', handleSave);
  }, [image, selectedLabels]);

  return {
    selectedLabels,
    toggleLabel,
    clearLabels,
    saveClassification,
    isMultiLabel: project?.type === 'multi-label-classification',
  };
}
