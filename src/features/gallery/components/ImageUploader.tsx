import { ReactNode, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';
import { pickImages } from '@/lib/nativeDialogs';
import * as tauriDb from '@/lib/tauriDb';
import { Button } from '@/components/ui/button';

interface ImageUploaderProps {
  trigger?: ReactNode;
}

export function ImageUploader({ trigger }: ImageUploaderProps) {
  const { t } = useTranslation();
  const { currentProjectId } = useUIStore();
  const [isUploading, setIsUploading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<tauriDb.PdfExtractionProgress | null>(null);

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

  return (
    <>
      {trigger ? (
        <div onClick={handleClick}>{trigger}</div>
      ) : (
        <Button onClick={handleClick} disabled={isUploading}>
          {getLabel()}
        </Button>
      )}
    </>
  );
}
