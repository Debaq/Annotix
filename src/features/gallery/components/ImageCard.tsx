import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { cn } from '@/lib/utils';

interface ImageCardProps {
  image: AnnotixImage;
  onDelete: (id: number) => void;
}

function isClassificationType(type: string): boolean {
  return type === 'classification' || type === 'multi-label-classification';
}

export function ImageCard({ image, onDelete }: ImageCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentImageId } = useUIStore();
  const { project } = useCurrentProject();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');

  useEffect(() => {
    if (image.image) {
      const url = URL.createObjectURL(image.image);
      setThumbnailUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [image.image]);

  const handleSelect = () => {
    if (projectId) {
      navigate(`/projects/${projectId}/images/${image.id}`);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (image.id != null) {
      onDelete(image.id);
    }
  };

  const isSelected = currentImageId === image.id;
  const isAnnotated = image.annotations.length > 0;
  const isClassification = project ? isClassificationType(project.type) : false;

  // Build classification badges
  const classBadges = isClassification && isAnnotated && project
    ? image.annotations
        .filter(a => a.data && 'labels' in a.data)
        .flatMap(a => (a.data as { labels: number[] }).labels)
        .map(classId => project.classes.find(c => c.id === classId))
        .filter((c): c is NonNullable<typeof c> => c != null)
    : [];

  return (
    <div
      className={cn(
        "annotix-gallery-item",
        isSelected && "active",
        !isAnnotated && "no-annotations"
      )}
      onClick={handleSelect}
      title={`${image.name} (${image.width}×${image.height})`}
    >
      <div className="relative w-full h-full bg-[var(--annotix-gray-light)]">
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={image.name}
            className="w-full h-full object-cover"
          />
        )}

        {/* Bottom overlay: annotation count or classification badges */}
        {isAnnotated && (
          <div className="gallery-item-overlay">
            {isClassification && classBadges.length > 0 ? (
              <div className="gallery-class-badges">
                {classBadges.map((cls) => (
                  <span
                    key={cls.id}
                    className="gallery-class-badge"
                    style={{ background: cls.color }}
                  >
                    {cls.name}
                  </span>
                ))}
              </div>
            ) : (
              <span>{image.annotations.length} labels</span>
            )}
          </div>
        )}

        {/* Hover actions: delete button */}
        <div className="gallery-item-actions">
          <button
            className="gallery-item-delete"
            onClick={handleDelete}
            title={t('actions.delete')}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
