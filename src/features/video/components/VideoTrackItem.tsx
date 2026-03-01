import { useTranslation } from 'react-i18next';
import { VideoTrack, ClassDefinition } from '@/lib/db';
import { cn } from '@/lib/utils';

interface VideoTrackItemProps {
  track: VideoTrack;
  classes: ClassDefinition[];
  currentFrameIndex: number;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

export function VideoTrackItem({
  track,
  classes,
  currentFrameIndex,
  onDelete,
  onToggle,
}: VideoTrackItemProps) {
  const { t } = useTranslation();
  const classInfo = classes.find(c => c.id === track.classId);
  const color = classInfo?.color || '#888';
  const keyframeCount = track.keyframes.filter(kf => kf.isKeyframe).length;
  const hasKeyframeAtCurrent = track.keyframes.some(kf => kf.frameIndex === currentFrameIndex);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded border p-1.5 text-xs transition-all",
        track.enabled
          ? "border-[var(--annotix-border)] bg-[var(--annotix-white)]"
          : "border-[var(--annotix-border)] bg-[var(--annotix-light)] opacity-50"
      )}
    >
      {/* Color dot */}
      <div
        className="h-3 w-3 rounded-full shrink-0 border border-black/20"
        style={{ backgroundColor: color }}
      />

      {/* Label */}
      <span className="flex-1 truncate font-medium">
        {track.label || `Track ${track.id}`}
      </span>

      {/* Keyframe indicator */}
      {hasKeyframeAtCurrent && (
        <div className="w-2 h-2 rotate-45" style={{ backgroundColor: color }} title={t('video.keyframeHere')} />
      )}

      {/* Keyframe count */}
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {keyframeCount}kf
      </span>

      {/* Toggle */}
      <button
        onClick={() => onToggle(!track.enabled)}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--annotix-gray-light)] transition-colors"
        title={track.enabled ? t('video.hideTrack') : t('video.showTrack')}
      >
        <i className={cn("fas text-[10px]", track.enabled ? "fa-eye" : "fa-eye-slash")}></i>
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-red-400 hover:text-red-600"
        title={t('video.deleteTrack')}
      >
        <i className="fas fa-trash text-[10px]"></i>
      </button>
    </div>
  );
}
