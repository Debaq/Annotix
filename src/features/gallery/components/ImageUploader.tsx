import { ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useImages } from '../hooks/useImages';
import { Button } from '@/components/ui/button';

interface ImageUploaderProps {
  trigger?: ReactNode;
}

export function ImageUploader({ trigger }: ImageUploaderProps) {
  const { t } = useTranslation();
  const { uploadImages } = useImages();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      await uploadImages(Array.from(files));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to upload images:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

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
