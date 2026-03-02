import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { cn } from '@/lib/utils';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ImageLockIndicator } from '@/features/p2p/components/ImageLockIndicator';

interface ImageCardProps {
  image: AnnotixImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentImageId } = useUIStore();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');

  useEffect(() => {
    if (image.id && projectId) {
      invoke<string>('get_thumbnail_path', { projectId, imageId: image.id }).then((path) => {
        setThumbnailUrl(convertFileSrc(path));
      }).catch(() => {
        // Fallback to original image
        invoke<string>('get_image_file_path', { projectId, id: image.id }).then((path) => {
          setThumbnailUrl(convertFileSrc(path));
        });
      });
    }
  }, [image.id, image.blobPath, projectId]);

  const handleSelect = () => {
    if (projectId) {
      navigate(`/projects/${projectId}/images/${image.id}`);
    }
  };

  const isSelected = currentImageId === image.id;
  const isAnnotated = image.annotations.length > 0;

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

        {/* P2P Lock indicator */}
        {image.id && <ImageLockIndicator imageId={image.id} />}

        {/* Status indicator (top-right) */}
        <div className="absolute top-1 right-1">
          {isAnnotated ? (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: 'var(--annotix-success)' }}
              title={`${image.annotations.length} anotaciones`}
            >
              <i className="fas fa-check"></i>
            </div>
          ) : (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]"
              style={{ backgroundColor: 'var(--annotix-warning)' }}
              title="Sin anotar"
            >
              <i className="fas fa-circle"></i>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
