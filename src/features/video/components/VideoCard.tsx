import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Video } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useUIStore } from '../../core/store/uiStore';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { videoService } from '../services/videoService';

interface VideoCardProps {
  video: Video;
}

export function VideoCard({ video }: VideoCardProps) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentVideoId } = useUIStore();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');

  // Thumbnail: usar el primer frame del video
  useEffect(() => {
    if (!projectId || !video.id || video.status !== 'ready') return;

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
  }, [projectId, video.id, video.status]);

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

  const isSelected = currentVideoId === video.id;
  const isReady = video.status === 'ready';

  return (
    <div
      className={cn(
        "annotix-gallery-item",
        isSelected && "active",
        !isReady && "opacity-60"
      )}
      onClick={isReady ? handleSelect : undefined}
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
      </div>
    </div>
  );
}
