import { useTranslationWithLogging } from '../../../hooks/useTranslationWithLogging';
import { useImages } from '../hooks/useImages';
import { ImageGrid } from './ImageGrid';
import { ImageUploader } from './ImageUploader';
import { GalleryFilters } from './GalleryFilters';

export function ImageGallery() {
  const { t } = useTranslationWithLogging();
  const { images, isLoading } = useImages();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-muted-foreground"></i>
          <p className="mt-4 text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{t('gallery.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('gallery.imageCount', { count: images.length })}
            </p>
          </div>
          <ImageUploader />
        </div>
        <GalleryFilters />
      </div>

      <div className="flex-1 overflow-auto">
        {images.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <i className="fas fa-images text-6xl text-muted-foreground"></i>
              <h3 className="mt-4 text-lg font-semibold">{t('gallery.empty.title')}</h3>
              <p className="mt-2 text-muted-foreground">{t('gallery.empty.description')}</p>
              <ImageUploader trigger={
                <button className="mt-6 rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90">
                  <i className="fas fa-upload mr-2"></i>
                  {t('gallery.upload')}
                </button>
              } />
            </div>
          </div>
        ) : (
          <ImageGrid images={images} />
        )}
      </div>
    </div>
  );
}
