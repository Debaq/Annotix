import { useState, useEffect } from 'react';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';

export function useCurrentImage() {
  const { currentImageId } = useUIStore();
  const [image, setImage] = useState<AnnotixImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentImageId) {
      setImage(null);
      return;
    }

    const loadImage = async () => {
      setIsLoading(true);
      try {
        const data = await imageService.get(currentImageId);
        setImage(data || null);
      } catch (error) {
        console.error('Failed to load current image:', error);
        setImage(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [currentImageId]);

  const reload = async () => {
    if (!currentImageId) return;

    try {
      const data = await imageService.get(currentImageId);
      setImage(data || null);
    } catch (error) {
      console.error('Failed to reload image:', error);
    }
  };

  return { image, isLoading, reload };
}
