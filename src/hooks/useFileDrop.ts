import { useEffect, useState, useCallback } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useUIStore } from '@/features/core/store/uiStore';
import { imageService } from '@/features/gallery/services/imageService';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

interface FileDropState {
  isDragging: boolean;
  isUploading: boolean;
  fileCount: number;
}

export function useFileDrop(): FileDropState {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileCount, setFileCount] = useState(0);

  const handleDrop = useCallback(async (paths: string[]) => {
    const projectId = useUIStore.getState().currentProjectId;
    if (!projectId) return;

    const imagePaths = paths.filter(isImagePath);
    if (imagePaths.length === 0) return;

    setIsUploading(true);
    setFileCount(imagePaths.length);
    try {
      await imageService.uploadFromPaths(projectId, imagePaths);
    } catch (error) {
      console.error('Failed to upload dropped files:', error);
    } finally {
      setIsUploading(false);
      setFileCount(0);
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === 'enter') {
        const hasImages = payload.paths.some(isImagePath);
        if (hasImages) {
          setIsDragging(true);
          setFileCount(payload.paths.filter(isImagePath).length);
        }
      } else if (payload.type === 'over') {
        // mantener estado
      } else if (payload.type === 'drop') {
        setIsDragging(false);
        handleDrop(payload.paths);
      } else {
        // leave / cancel
        setIsDragging(false);
        setFileCount(0);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [handleDrop]);

  return { isDragging, isUploading, fileCount };
}
