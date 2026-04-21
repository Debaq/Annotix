import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { AnnotixImage } from '@/lib/db';
import { confirm } from '@/lib/dialogs';
import { useUIStore } from '../../core/store/uiStore';
import { cn } from '@/lib/utils';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { imageService } from '../services/imageService';
import { ImageLockIndicator } from '@/features/p2p/components/ImageLockIndicator';
import { useP2pStore } from '@/features/p2p/store/p2pStore';
import { useP2pPermission } from '@/features/p2p/hooks/useP2pCanEdit';

interface ImageCardProps {
  image: AnnotixImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const { t } = useTranslation('gallery');
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentImageId } = useUIStore();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canDelete = useP2pPermission('delete');

  // IntersectionObserver: solo marca inView=true cuando la card entra (o está cerca) del viewport.
  // Evita que 500+ cards lancen todos sus invokes al montarse simultáneamente.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || !image.id || !projectId) return;

    let cancelled = false;
    const trySetUrl = (path: string) => {
      const url = convertFileSrc(path);
      const testImg = new window.Image();
      testImg.onload = () => {
        if (!cancelled) setThumbnailUrl(url);
      };
      // Si el asset protocol falla (caso raro: paths con caracteres especiales),
      // dejamos la card sin thumbnail en vez de descargar los bytes completos.
      // Antes hacía fallback con `get_image_data` (bytes completos) → con 500 cards
      // y errores en cadena eso colgaba la app.
      testImg.src = url;
    };

    invoke<string>('get_thumbnail_path', { projectId, imageId: image.id })
      .then((p) => {
        if (!cancelled) trySetUrl(p);
      })
      .catch(() => {
        invoke<string>('get_image_file_path', { projectId, id: image.id })
          .then((p) => {
            if (!cancelled) trySetUrl(p);
          })
          .catch(() => {});
      });

    return () => {
      cancelled = true;
    };
  }, [inView, image.id, image.blobPath, projectId]);

  const isPendingDownload = image.downloadStatus === 'pending';
  const imgId = image.id || '';
  const assignee = projectId ? useP2pStore.getState().getItemAssignee(projectId, image.videoId || imgId, image.videoId ? 'video' : 'image') : null;
  const isAssignedToMe = projectId ? useP2pStore.getState().isItemAssignedToMe(
    projectId,
    image.videoId || imgId,
    image.videoId ? 'video' : 'image'
  ) : true;
  const hasDistribution = projectId ? !!useP2pStore.getState().distributionByProject[projectId] : false;

  const handleSelect = () => {
    if (projectId && !isPendingDownload) {
      navigate(`/projects/${projectId}/images/${image.id}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !image.id) return;
    if (!await confirm(t('deleteConfirm'), { kind: 'warning' })) return;

    if (currentImageId === image.id) {
      navigate(`/projects/${projectId}`);
    }

    await imageService.delete(projectId, image.id);
  };

  const isSelected = currentImageId === image.id;
  const isAnnotated = image.annotations.length > 0;

  return (
    <div
      ref={rootRef}
      className={cn(
        "annotix-gallery-item group",
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
            <span className="bunny-hop text-lg mb-1">&#x1F430;</span>
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

        {/* Delete button (bottom-right, visible on hover) */}
        {canDelete && !isPendingDownload && (
          <button
            onClick={handleDelete}
            className="absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
            title={t('deleteConfirm')}
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        )}
      </div>
    </div>
  );
}
