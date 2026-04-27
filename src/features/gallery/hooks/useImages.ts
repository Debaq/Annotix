import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';
import { useTauriQuery } from '@/hooks/useTauriQuery';
import type { AnnotixImage } from '@/lib/db';
import type { ClassFilter } from '../../core/store/uiStore';

export function applyClassFilter(images: AnnotixImage[], filter: ClassFilter | undefined): AnnotixImage[] {
  if (!filter || filter.classIds.length === 0) return images;
  const set = new Set(filter.classIds);
  return images.filter((img) => {
    const anns = img.annotations ?? [];
    if (filter.mode === 'has') {
      return anns.some((a) => set.has(a.classId));
    }
    if (filter.mode === 'lacks') {
      return !anns.some((a) => set.has(a.classId));
    }
    if (filter.mode === 'only') {
      if (anns.length === 0) return false;
      return anns.every((a) => set.has(a.classId));
    }
    if (filter.mode === 'min') {
      const min = filter.minCount ?? 1;
      const count = anns.reduce((n, a) => n + (set.has(a.classId) ? 1 : 0), 0);
      return count >= min;
    }
    return true;
  });
}

export function useImages() {
  const { currentProjectId, galleryFilter, projectFilters } = useUIStore();
  const classFilter = currentProjectId ? projectFilters[currentProjectId]?.classFilter : undefined;

  const { data: images, isLoading } = useTauriQuery(
    async () => {
      if (!currentProjectId) return [];

      let data = await imageService.listByProject(currentProjectId);

      // Excluir frames extraídos de video (se ven desde VideoView)
      data = data.filter((img) => !img.videoId);

      // Apply filters
      if (galleryFilter === 'annotated') {
        data = data.filter((img) => img.annotations.length > 0);
      } else if (galleryFilter === 'unannotated') {
        data = data.filter((img) => img.annotations.length === 0);
      }

      data = applyClassFilter(data, classFilter);

      return data;
    },
    [currentProjectId, galleryFilter, classFilter],
    ['db:images-changed']
  );

  const uploadImages = async (files: File[]) => {
    if (!currentProjectId) return;
    try {
      await imageService.uploadMultiple(currentProjectId, files);
    } catch (error) {
      console.error('Failed to upload images:', error);
      throw error;
    }
  };

  const deleteImage = async (id: string) => {
    if (!currentProjectId) return;
    try {
      await imageService.delete(currentProjectId, id);
    } catch (error) {
      console.error('Failed to delete image:', error);
      throw error;
    }
  };

  return {
    images: images || [],
    isLoading,
    uploadImages,
    deleteImage,
  };
}
