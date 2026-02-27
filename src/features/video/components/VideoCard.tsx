import { useNavigate, useParams } from 'react-router-dom';
import { Video } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useUIStore } from '../../core/store/uiStore';

interface VideoCardProps {
  video: Video;
}

export function VideoCard({ video }: VideoCardProps) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentVideoId } = useUIStore();

  const handleSelect = () => {
    if (projectId && video.id) {
      navigate(`/projects/${projectId}/videos/${video.id}`);
    }
  };

  const isSelected = currentVideoId === video.id;
  const isReady = video.metadata.status === 'ready';

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
        <i className={cn(
          "fas text-3xl opacity-30",
          isReady ? "fa-film" : "fa-spinner fa-spin"
        )}></i>

        {/* Status badge */}
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

        {/* Video icon badge */}
        <div className="absolute bottom-1 left-1">
          <div className="w-5 h-5 rounded-full flex items-center justify-center bg-black/50 text-white text-[10px]">
            <i className="fas fa-video"></i>
          </div>
        </div>
      </div>
    </div>
  );
}
