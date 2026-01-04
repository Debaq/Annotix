import { useLiveQuery } from 'dexie-react-hooks';
import { db, AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';

export function useImages() {
  const { currentProjectId, galleryFilter } = useUIStore();

  const images = useLiveQuery(
    async () => {
      if (!currentProjectId) return [];
      
      let data = await imageService.listByProject(currentProjectId);

      // Apply filters
      if (galleryFilter === 'annotated') {
        data = data.filter((img) => img.annotations.length > 0);
      } else if (galleryFilter === 'unannotated') {
        data = data.filter((img) => img.annotations.length === 0);
      }

      return data;
    },
    [currentProjectId, galleryFilter]
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

  const deleteImage = async (id: number) => {
    try {
      await imageService.delete(id);
    } catch (error) {
      console.error('Failed to delete image:', error);
      throw error;
    }
  };

  return {
    images: images || [],
    isLoading: images === undefined,
    uploadImages,
    deleteImage,
  };
}
