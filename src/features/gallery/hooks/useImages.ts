import { useState, useEffect } from 'react';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';

export function useImages() {
  const { currentProjectId, galleryFilter } = useUIStore();
  const [images, setImages] = useState<AnnotixImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadImages = async () => {
    if (!currentProjectId) {
      setImages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let data = await imageService.listByProject(currentProjectId);

      // Apply filters
      if (galleryFilter === 'annotated') {
        data = data.filter((img) => img.annotations.length > 0);
      } else if (galleryFilter === 'unannotated') {
        data = data.filter((img) => img.annotations.length === 0);
      }

      setImages(data);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, [currentProjectId, galleryFilter]);

  const uploadImages = async (files: File[]) => {
    if (!currentProjectId) return;

    try {
      await imageService.uploadMultiple(currentProjectId, files);
      await loadImages();
    } catch (error) {
      console.error('Failed to upload images:', error);
      throw error;
    }
  };

  const deleteImage = async (id: number) => {
    try {
      await imageService.delete(id);
      await loadImages();
    } catch (error) {
      console.error('Failed to delete image:', error);
      throw error;
    }
  };

  return {
    images,
    isLoading,
    uploadImages,
    deleteImage,
    reload: loadImages,
  };
}
