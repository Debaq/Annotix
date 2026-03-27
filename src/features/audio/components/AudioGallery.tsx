import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { useAudio } from '../hooks/useAudio';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useUIStore } from '../../core/store/uiStore';
import { audioService } from '../services/audioService';
import { Button } from '@/components/ui/button';

async function pickAudioFiles(): Promise<string[] | null> {
  const result = await open({
    multiple: true,
    filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'ogg', 'webm', 'm4a'] }],
  });
  if (!result) return null;
  return Array.isArray(result) ? result : [result];
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function AudioGallery() {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { audioList, loading, reload, deleteAudio, stats } = useAudio();
  const { currentAudioId, setCurrentAudioId } = useUIStore();
  const navigate = useNavigate();

  const handleUpload = useCallback(async () => {
    if (!project?.id) return;

    const paths = await pickAudioFiles();
    if (!paths || paths.length === 0) return;

    for (const path of paths) {
      await audioService.upload(project.id, path, 0, 16000, 'en');
    }

    await reload();
  }, [project?.id, reload]);

  const handleSelect = useCallback((audioId: string) => {
    if (!project?.id) return;
    setCurrentAudioId(audioId);
    navigate(`/projects/${project.id}/audio/${audioId}`);
  }, [project?.id, setCurrentAudioId, navigate]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteAudio(id);
    if (currentAudioId === id) {
      setCurrentAudioId(null);
    }
  }, [deleteAudio, currentAudioId, setCurrentAudioId]);

  return (
    <div className="flex flex-col h-full bg-[var(--annotix-white)]">
      {/* Stats */}
      <div className="p-4 border-b border-[var(--annotix-border)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[var(--annotix-dark)]">
            {t('audio.audioList')}
          </h3>
          <Button
            size="sm"
            className="annotix-btn annotix-btn-primary"
            onClick={handleUpload}
          >
            <i className="fas fa-upload mr-1"></i>
            {t('audio.upload')}
          </Button>
        </div>
        <div className="flex gap-4 text-xs text-[var(--annotix-gray)]">
          <span>{t('audio.total')}: <strong>{stats.total}</strong></span>
          <span>{t('audio.done')}: <strong className="text-green-600">{stats.done}</strong></span>
          <span>{t('audio.pending')}: <strong className="text-amber-600">{stats.pending}</strong></span>
        </div>
        {stats.total > 0 && (
          <div className="mt-2 h-1.5 bg-[var(--annotix-gray-light)] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && audioList.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground"></i>
          </div>
        )}

        {!loading && audioList.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--annotix-gray)]">
            <i className="fas fa-microphone text-3xl mb-2 opacity-30"></i>
            <p className="text-sm">{t('audio.noAudioYet')}</p>
            <p className="text-xs mt-1 opacity-70">{t('audio.uploadToStart')}</p>
          </div>
        )}

        {audioList.map((audio) => (
          <button
            key={audio.id}
            onClick={() => audio.id && handleSelect(audio.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
              currentAudioId === audio.id
                ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10'
                : 'border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/50'
            }`}
          >
            <div className="flex-shrink-0">
              <i className={`fas fa-${audio.metadata.status === 'done' ? 'check-circle text-green-500' : 'circle text-[var(--annotix-gray-light)]'} text-lg`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-[var(--annotix-dark)]">{audio.name}</p>
              <p className="text-xs text-[var(--annotix-gray)] truncate">
                {audio.durationMs > 0 ? formatDuration(audio.durationMs) : '--:--'}
                {audio.transcription && ` \u2022 ${audio.transcription.substring(0, 40)}${audio.transcription.length > 40 ? '...' : ''}`}
              </p>
            </div>
            <button
              onClick={(e) => audio.id && handleDelete(e, audio.id)}
              className="flex-shrink-0 p-1 text-[var(--annotix-gray)] hover:text-red-500 transition-colors"
            >
              <i className="fas fa-trash text-xs"></i>
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
