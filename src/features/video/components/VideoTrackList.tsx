import { useTranslation } from 'react-i18next';
import { VideoTrack, ClassDefinition } from '@/lib/db';
import { VideoTrackItem } from './VideoTrackItem';
import { Button } from '@/components/ui/button';
import { useUIStore } from '../../core/store/uiStore';

interface VideoTrackListProps {
  tracks: VideoTrack[];
  classes: ClassDefinition[];
  currentFrameIndex: number;
  onCreateTrack: (classId: number, label?: string) => Promise<void>;
  onDeleteTrack: (trackId: number) => Promise<void>;
  onUpdateTrack: (trackId: number, updates: { classId?: number; label?: string; enabled?: boolean }) => Promise<void>;
}

export function VideoTrackList({
  tracks,
  classes,
  currentFrameIndex,
  onCreateTrack,
  onDeleteTrack,
  onUpdateTrack,
}: VideoTrackListProps) {
  const { t } = useTranslation();
  const { activeClassId } = useUIStore();

  const handleNewTrack = async () => {
    if (activeClassId === null) return;
    const className = classes.find(c => c.id === activeClassId)?.name || 'Track';
    await onCreateTrack(activeClassId, `${className} ${tracks.length + 1}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">{t('video.tracks', 'Tracks')}</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={handleNewTrack}
          disabled={activeClassId === null}
        >
          <i className="fas fa-plus mr-1"></i>
          {t('video.newTrack', 'Nuevo')}
        </Button>
      </div>

      {tracks.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('video.noTracks', 'No hay tracks. Crea uno para empezar a trackear.')}
        </p>
      ) : (
        <div className="space-y-1">
          {tracks.map(track => (
            <VideoTrackItem
              key={track.id}
              track={track}
              classes={classes}
              currentFrameIndex={currentFrameIndex}
              onDelete={() => track.id && onDeleteTrack(track.id)}
              onToggle={(enabled) => track.id && onUpdateTrack(track.id, { enabled })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
