import { useTranslation } from 'react-i18next';
import { useImages } from '../hooks/useImages';
import { ImageGrid } from './ImageGrid';
import { ImageUploader } from './ImageUploader';
import { GalleryFilters } from './GalleryFilters';
import { VideoUploader } from '../../video/components/VideoUploader';
import { VideoCard } from '../../video/components/VideoCard';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useTauriQuery } from '@/hooks/useTauriQuery';
import { videoService } from '../../video/services/videoService';

export function ImageGallery() {
  const { t } = useTranslation();
  const { images, isLoading } = useImages();
  const { currentProjectId } = useUIStore();
  const { project } = useCurrentProject();

  const isBboxProject = project?.type === 'bbox';

  const { data: videos } = useTauriQuery(
    async () => {
      if (!currentProjectId || !isBboxProject) return [];
      return videoService.listByProject(currentProjectId);
    },
    [currentProjectId, isBboxProject],
    ['db:videos-changed', 'db:tracks-changed']
  );

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
      {/* Upload Buttons Section */}
      <div className="annotix-panel-section">
        <ImageUploader trigger={
          <button className="annotix-btn annotix-btn-primary w-full">
            <i className="fas fa-folder-open mr-2"></i>
            {t('gallery.upload')}
          </button>
        } />
        {isBboxProject && (
          <div className="mt-2">
            <VideoUploader />
          </div>
        )}
      </div>

      {/* Videos Section */}
      {isBboxProject && videos && videos.length > 0 && (
        <div className="annotix-panel-section">
          <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--annotix-gray)' }}>
            <i className="fas fa-video mr-1"></i>
            {t('video.videos', 'Videos')} ({videos.length})
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="panel-section">
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
