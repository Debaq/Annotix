import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { useImages } from '../../gallery/hooks/useImages';

export function ProjectStats() {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { images } = useImages();

  if (!project) return null;

  const totalImages = images.length;
  const annotatedImages = images.filter((img) => img.annotations.length > 0).length;
  const totalAnnotations = images.reduce((sum, img) => sum + img.annotations.length, 0);
  const progress = totalImages > 0 ? (annotatedImages / totalImages) * 100 : 0;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        {t('sidebar.stats')}
      </h2>
      <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            <i className="fas fa-images mr-2"></i>
            {t('stats.images')}
          </span>
          <span className="font-medium">{totalImages}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            <i className="fas fa-check-circle mr-2"></i>
            {t('stats.annotated')}
          </span>
          <span className="font-medium">{annotatedImages}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            <i className="fas fa-tag mr-2"></i>
            {t('stats.annotations')}
          </span>
          <span className="font-medium">{totalAnnotations}</span>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('stats.progress')}</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
