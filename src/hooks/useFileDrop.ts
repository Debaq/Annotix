import { useEffect, useState, useCallback } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useUIStore } from '@/features/core/store/uiStore';
import { imageService } from '@/features/gallery/services/imageService';
import * as tauriDb from '@/lib/tauriDb';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];

function getExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.includes(getExtension(path));
}

function isPdfPath(path: string): boolean {
  return getExtension(path) === 'pdf';
}

function isSupportedPath(path: string): boolean {
  return isImagePath(path) || isPdfPath(path);
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
    const pdfPaths = paths.filter(isPdfPath);
    if (imagePaths.length === 0 && pdfPaths.length === 0) return;

    setIsUploading(true);
    setFileCount(imagePaths.length + pdfPaths.length);
    try {
      if (imagePaths.length > 0) {
        await imageService.uploadFromPaths(projectId, imagePaths);
      }
      for (const pdfPath of pdfPaths) {
        await tauriDb.extractPdfPages(projectId, pdfPath);
      }
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
        const hasSupported = payload.paths.some(isSupportedPath);
        if (hasSupported) {
          setIsDragging(true);
          setFileCount(payload.paths.filter(isSupportedPath).length);
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
