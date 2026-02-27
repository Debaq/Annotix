import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { imageService } from '../services/imageService';
import { pickImages } from '@/lib/nativeDialogs';
import { Button } from '@/components/ui/button';

interface ImageUploaderProps {
  trigger?: ReactNode;
}

export function ImageUploader({ trigger }: ImageUploaderProps) {
  const { t } = useTranslation();
  const { currentProjectId } = useUIStore();
  const [isUploading, setIsUploading] = useState(false);

  const handleClick = async () => {
    if (!currentProjectId || isUploading) return;

    const filePaths = await pickImages();
    if (!filePaths || filePaths.length === 0) return;

    setIsUploading(true);
    try {
      await imageService.uploadFromPaths(currentProjectId, filePaths);
    } catch (error) {
      console.error('Failed to upload images:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      {trigger ? (
        <div onClick={handleClick}>{trigger}</div>
      ) : (
        <Button onClick={handleClick} disabled={isUploading}>
          {isUploading ? (
            <>
              <i className="fas fa-spinner fa-spin mr-2"></i>
              {t('gallery.uploading')}
            </>
          ) : (
            <>
              <i className="fas fa-upload mr-2"></i>
              {t('gallery.upload')}
            </>
          )}
        </Button>
      )}
    </>
  );
}
