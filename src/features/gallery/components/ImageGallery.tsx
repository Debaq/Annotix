import { useTranslation } from 'react-i18next';
import { useImages } from '../hooks/useImages';
import { ImageGrid } from './ImageGrid';
import { ImageUploader } from './ImageUploader';
import { GalleryFilters } from './GalleryFilters';

export function ImageGallery() {
  const { t } = useTranslation();
  const { images, isLoading } = useImages();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl" style={{ color: 'var(--annotix-primary)' }}></i>
          <p className="mt-4" style={{ color: 'var(--annotix-gray)' }}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Upload Button Section */}
      <div className="annotix-panel-section">
        <ImageUploader trigger={
          <button className="annotix-btn annotix-btn-primary w-full">
            <i className="fas fa-folder-open mr-2"></i>
            {t('gallery.upload')}
          </button>
        } />
      </div>

      {/* Filters Section */}
      <div className="annotix-panel-section">
        <GalleryFilters />
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-auto p-3">
        {images.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center" style={{ color: 'var(--annotix-gray)' }}>
              <i className="fas fa-images text-5xl mb-3 opacity-30"></i>
              <p className="text-sm font-medium">{t('gallery.empty.title')}</p>
              <p className="text-xs mt-1 opacity-70">{t('gallery.empty.description')}</p>
            </div>
          </div>
        ) : (
          <ImageGrid images={images} />
        )}
      </div>
    </div>
  );
}
