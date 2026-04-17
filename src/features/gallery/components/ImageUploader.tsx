import { ReactNode, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';
import { pickImages } from '@/lib/nativeDialogs';
import * as tauriDb from '@/lib/tauriDb';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface UploadProgress {
  projectId: string;
  current: number;
  total: number;
  fileName: string;
}

interface ImageUploaderProps {
  trigger?: ReactNode;
}

export function ImageUploader({ trigger }: ImageUploaderProps) {
  const { t } = useTranslation();
  const { currentProjectId } = useUIStore();
  const [isUploading, setIsUploading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<tauriDb.PdfExtractionProgress | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // Escuchar progreso de extracción PDF
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    tauriDb.onPdfExtractionProgress((data) => {
      if (data.progress >= 100) {
        setPdfProgress(null);
      } else {
        setPdfProgress(data);
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // Escuchar progreso de copia de imágenes
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<UploadProgress>('upload:progress', (event) => {
      if (!currentProjectId || event.payload.projectId !== currentProjectId) return;
      setUploadProgress(event.payload);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [currentProjectId]);

  const handleClick = async () => {
    if (!currentProjectId || isUploading) return;

    const filePaths = await pickImages();
    if (!filePaths || filePaths.length === 0) return;

    // Separar PDFs de imágenes normales
    const imageFiles: string[] = [];
    const pdfFiles: string[] = [];
    for (const fp of filePaths) {
      if (fp.toLowerCase().endsWith('.pdf')) {
        pdfFiles.push(fp);
      } else {
        imageFiles.push(fp);
      }
    }

    setIsUploading(true);
    try {
      // Subir imágenes normales
      if (imageFiles.length > 0) {
        await imageService.uploadFromPaths(currentProjectId, imageFiles);
      }

      // Extraer páginas de cada PDF
      for (const pdfPath of pdfFiles) {
        await tauriDb.extractPdfPages(currentProjectId, pdfPath);
      }
    } catch (error) {
      console.error('Failed to upload:', error);
    } finally {
      setIsUploading(false);
      setPdfProgress(null);
      setUploadProgress(null);
    }
  };

  const getLabel = () => {
    if (pdfProgress) {
      return (
        <>
          <i className="fas fa-file-pdf fa-spin mr-2"></i>
          {t('gallery.extractingPdf', 'PDF {{current}}/{{total}}', {
            current: pdfProgress.current,
            total: pdfProgress.total,
          })}
        </>
      );
    }
    if (isUploading) {
      return (
        <>
          <i className="fas fa-spinner fa-spin mr-2"></i>
          {t('gallery.uploading')}
        </>
      );
    }
    return (
      <>
        <i className="fas fa-upload mr-2"></i>
        {t('gallery.upload')}
      </>
    );
  };

  const showModal = isUploading && uploadProgress && uploadProgress.total > 1;
  const pct = uploadProgress && uploadProgress.total > 0
    ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
    : 0;

  return (
    <>
      {trigger ? (
        <div onClick={handleClick}>{trigger}</div>
      ) : (
        <Button onClick={handleClick} disabled={isUploading}>
          {getLabel()}
        </Button>
      )}

      <Dialog open={!!showModal}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              <i className="fas fa-images mr-2"></i>
              {t('gallery.uploadingImages', 'Importando imágenes')}
            </DialogTitle>
          </DialogHeader>
          {uploadProgress && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-medium">
                  {uploadProgress.current} / {uploadProgress.total}
                </span>
                <span className="text-gray-500">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
              {uploadProgress.fileName && (
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={uploadProgress.fileName}>
                  <i className="fas fa-file-image mr-1"></i>
                  {uploadProgress.fileName}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('gallery.copyingFiles', 'Copiando archivos al proyecto...')}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
