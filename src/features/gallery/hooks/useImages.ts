import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useImages() {
  const { currentProjectId, galleryFilter } = useUIStore();

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

      return data;
    },
    [currentProjectId, galleryFilter],
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
