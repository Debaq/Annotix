import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { cn } from '@/lib/utils';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ImageLockIndicator } from '@/features/p2p/components/ImageLockIndicator';
import { useP2pStore } from '@/features/p2p/store/p2pStore';

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

  const isPendingDownload = image.downloadStatus === 'pending';
  const imgId = image.id || '';
  const assignee = useP2pStore.getState().getItemAssignee(image.videoId || imgId, image.videoId ? 'video' : 'image');
  const isAssignedToMe = useP2pStore.getState().isItemAssignedToMe(
    image.videoId || imgId,
    image.videoId ? 'video' : 'image'
  );
  const hasDistribution = !!useP2pStore.getState().distribution;

  const handleSelect = () => {
    if (projectId && !isPendingDownload) {
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
        !isAnnotated && "no-annotations",
        isPendingDownload && "opacity-60 cursor-default"
      )}
      onClick={handleSelect}
      title={isPendingDownload ? `${image.name} (downloading...)` : `${image.name} (${image.width}×${image.height})`}
    >
      <div className="relative w-full h-full bg-[var(--annotix-gray-light)]">
        {isPendingDownload ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <i className="fas fa-cloud-download-alt text-lg mb-1" />
            <span className="text-[9px]">{image.name}</span>
          </div>
        ) : (
          <>
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt={image.name}
                className="w-full h-full object-cover"
              />
            )}
          </>
        )}

        {/* P2P Lock indicator */}
        {image.id && !isPendingDownload && <ImageLockIndicator imageId={image.id} />}

        {/* P2P Assignment badge */}
        {hasDistribution && assignee && !isPendingDownload && (
          <div className="absolute bottom-1 right-1 z-10">
            <div className={`px-1 py-0.5 rounded text-[8px] font-bold text-white truncate max-w-[60px] ${
              isAssignedToMe ? 'bg-blue-500' : 'bg-gray-500'
            }`}>
              {isAssignedToMe ? 'Tú' : assignee.displayName}
            </div>
          </div>
        )}

        {/* Status indicator (top-right) */}
        {!isPendingDownload && (
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
        )}
      </div>
    </div>
  );
}
