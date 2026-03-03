import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { confirm } from '@/lib/dialogs';
import { Video } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useUIStore } from '../../core/store/uiStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { videoService } from '../services/videoService';
import { useP2pStore } from '@/features/p2p/store/p2pStore';
import { useP2pPermission } from '@/features/p2p/hooks/useP2pCanEdit';

interface VideoCardProps {
  video: Video;
}

export function VideoCard({ video }: VideoCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentVideoId, setCurrentVideoId } = useUIStore();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');

  const isSelected = currentVideoId === video.id;
  const isReady = video.status === 'ready';
  const isExtracting = video.status === 'extracting';
  const canOpen = isReady || isExtracting;
  const vidId = video.id || '';
  const assignee = useP2pStore.getState().getItemAssignee(vidId, 'video');
  const isAssignedToMe = useP2pStore.getState().isItemAssignedToMe(vidId, 'video');
  const hasDistribution = !!useP2pStore.getState().distribution;
  const canDelete = useP2pPermission('delete');

  // Thumbnail: usar el primer frame del video (disponible durante extracting o ready)
  useEffect(() => {
    if (!projectId || !video.id || !canOpen) return;
    if (video.totalFrames === 0) return;

    videoService.listFrames(projectId, video.id).then((frames) => {
      if (frames.length === 0) return;
      const firstFrame = frames[0];
      if (!firstFrame.id) return;

      invoke<string>('get_thumbnail_path', { projectId, imageId: firstFrame.id })
        .then((path) => setThumbnailUrl(convertFileSrc(path)))
        .catch(() => {
          invoke<string>('get_image_file_path', { projectId, id: firstFrame.id })
            .then((path) => setThumbnailUrl(convertFileSrc(path)));
        });
    });
  }, [projectId, video.id, video.status, video.totalFrames]);

  // Contar frames únicos con keyframes (marcados)
  const markedFrames = useMemo(() => {
    const frameSet = new Set<number>();
    for (const track of video.tracks) {
      for (const kf of track.keyframes) {
        frameSet.add(kf.frameIndex);
      }
    }
    return frameSet.size;
  }, [video.tracks]);

  const handleSelect = () => {
    if (projectId && video.id) {
      navigate(`/projects/${projectId}/videos/${video.id}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId || !video.id) return;
    if (!await confirm(t('video.confirmDeleteVideo'), { kind: 'warning' })) return;

    // Si estamos viendo este video, limpiar la selección
    if (currentVideoId === video.id) {
      setCurrentVideoId(null);
      navigate(`/projects/${projectId}`);
    }

    await videoService.delete(projectId, video.id);
  };

  return (
    <div
      className={cn(
        "annotix-gallery-item group",
        isSelected && "active",
        !canOpen && "opacity-60"
      )}
      onClick={canOpen ? handleSelect : undefined}
      title={`${video.name} (${video.totalFrames} frames)`}
    >
      <div className="relative w-full h-full bg-[var(--annotix-gray-light)] flex items-center justify-center">
        {/* Thumbnail o icono placeholder */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={video.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <i className={cn(
            "fas text-3xl opacity-30",
            isReady ? "fa-film" : "fa-spinner fa-spin"
          )}></i>
        )}

        {/* Badge: total frames (top-right) */}
        <div className="absolute top-1 right-1">
          {isReady ? (
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
              style={{ backgroundColor: 'var(--annotix-primary)' }}
            >
              {video.totalFrames}f
            </div>
          ) : isExtracting ? (
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
              style={{ backgroundColor: 'var(--annotix-warning)' }}
            >
              <i className="fas fa-spinner fa-spin mr-0.5"></i>{video.totalFrames}f
            </div>
          ) : (
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
              style={{ backgroundColor: 'var(--annotix-warning)' }}
            >
              <i className="fas fa-clock"></i>
            </div>
          )}
        </div>

        {/* Badge: frames marcados (top-left) */}
        {isReady && markedFrames > 0 && (
          <div className="absolute top-1 left-1">
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
              style={{ backgroundColor: 'var(--annotix-success)' }}
            >
              <i className="fas fa-check mr-0.5"></i>{markedFrames}
            </div>
          </div>
        )}

        {/* Video icon badge (bottom-left) */}
        <div className="absolute bottom-1 left-1">
          <div className="w-5 h-5 rounded-full flex items-center justify-center bg-black/50 text-white text-[10px]">
            <i className="fas fa-video"></i>
          </div>
        </div>

        {/* P2P Assignment badge */}
        {hasDistribution && assignee && (
          <div className="absolute top-1 left-1 z-10" style={{ top: markedFrames > 0 ? '22px' : undefined }}>
            <div className={`px-1 py-0.5 rounded text-[8px] font-bold text-white truncate max-w-[60px] ${
              isAssignedToMe ? 'bg-blue-500' : 'bg-gray-500'
            }`}>
              {isAssignedToMe ? 'Tú' : assignee.displayName}
            </div>
          </div>
        )}

        {/* Delete button (bottom-right, visible on hover) */}
        {canDelete && (
          <button
            onClick={handleDelete}
            className="absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
            title={t('video.deleteVideo')}
          >
            <i className="fas fa-trash-alt"></i>
          </button>
        )}
      </div>
    </div>
  );
}
