import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';

export function useCurrentImage() {
  const { currentProjectId, currentImageId } = useUIStore();
  const [image, setImage] = useState<AnnotixImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadVersionRef = useRef(0);

  const loadImage = useCallback(async () => {
    if (!currentImageId || !currentProjectId) {
      setImage(null);
      return;
    }
    const version = ++loadVersionRef.current;
    setIsLoading(true);
    try {
      const data = await imageService.get(currentProjectId, currentImageId);
      // Descartar respuestas obsoletas: solo aplicar si es la carga más reciente
      if (version === loadVersionRef.current) {
        setImage(data || null);
      }
    } catch (error) {
      if (version === loadVersionRef.current) {
        console.error('Failed to load current image:', error);
        setImage(null);
      }
    } finally {
      if (version === loadVersionRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentProjectId, currentImageId]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  // Recargar cuando las imágenes cambian (inferencia, import, etc.)
  useEffect(() => {
    const unlisten = listen('db:images-changed', () => {
      loadImage();
    });
    return () => { unlisten.then(fn => fn()); };
  }, [loadImage]);

  const reload = async () => {
    if (!currentImageId || !currentProjectId) return;
    const version = ++loadVersionRef.current;
    try {
      const data = await imageService.get(currentProjectId, currentImageId);
      if (version === loadVersionRef.current) {
        setImage(data || null);
      }
    } catch (error) {
      if (version === loadVersionRef.current) {
        console.error('Failed to reload image:', error);
      }
    }
  };

  return { image, isLoading, reload };
}
