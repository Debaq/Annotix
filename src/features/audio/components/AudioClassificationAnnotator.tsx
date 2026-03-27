import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { Audio, ClassDefinition } from '@/lib/db';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { audioService } from '../services/audioService';
import { Waveform } from './Waveform';
import { Button } from '@/components/ui/button';
import { matchesShortcut } from '@/features/core/utils/matchShortcut';
import { useShortcutKey } from '@/features/core/hooks/useShortcutKey';
import { CLASS_SHORTCUTS } from '@/features/core/constants';

interface Props {
  audio: Audio;
  projectId: string;
  classes: ClassDefinition[];
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onNext: () => void;
  onSaved: () => void;
  editSelection?: { startMs: number; endMs: number } | null;
  editSplitPoint?: number | null;
  onEditSelectionChange?: (startMs: number, endMs: number) => void;
  onEditSplitPointChange?: (ms: number) => void;
}

export function AudioClassificationAnnotator({
  audio,
  projectId,
  classes,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  onSaved,
  editSelection,
  editSplitPoint,
  onEditSelectionChange,
  onEditSplitPointChange,
}: Props) {
  const { t } = useTranslation('audio');
  const player = useAudioPlayer({ projectId, audioId: audio.id });
  const keyPlayPause = useShortcutKey('audio-play-pause');
  const keySave = useShortcutKey('save');

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Load from audio entry
  useEffect(() => {
    setSelectedClassId(audio.classId ?? null);
  }, [audio.id]);

  const handleSave = useCallback(async () => {
    if (!audio.id) return;
    setSaving(true);
    try {
      await audioService.saveAnnotation(projectId, audio.id, {
        classId: selectedClassId,
      });
      onSaved();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }, [audio.id, projectId, selectedClassId, onSaved]);

  const handleSaveAndNext = useCallback(async () => {
    await handleSave();
    onNext();
  }, [handleSave, onNext]);

  const handleClassSelect = useCallback(async (classId: number) => {
    const newId = selectedClassId === classId ? null : classId;
    setSelectedClassId(newId);
    // Auto-guardar al seleccionar clase
    if (audio.id) {
      try {
        await audioService.saveAnnotation(projectId, audio.id, { classId: newId });
        onSaved();
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }
  }, [audio.id, projectId, selectedClassId, onSaved]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (matchesShortcut(e, 'audio-play-pause')) {
        e.preventDefault();
        player.togglePlay();
      }
      if (matchesShortcut(e, 'save')) {
        e.preventDefault();
        handleSave();
      }
      // Class selection shortcuts
      const key = e.key.toLowerCase();
      const classIndex = CLASS_SHORTCUTS.indexOf(key);
      if (classIndex !== -1 && !e.ctrlKey && !e.metaKey && classIndex < classes.length) {
        e.preventDefault();
        handleClassSelect(classes[classIndex].id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [player.togglePlay, handleSave, handleClassSelect, classes]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-[var(--annotix-light)]">
      <audio ref={player.audioRef} src={player.blobUrl} preload="auto" />

      {/* Player */}
      <div className="px-6 py-4 bg-[var(--annotix-white)] border-b border-[var(--annotix-border)]">
        <Waveform
          audioBuffer={player.audioBuffer}
          currentTime={player.currentTime}
          duration={player.duration}
          onSeek={player.seek}
          height={100}
          editSelection={editSelection}
          editSplitPoint={editSplitPoint}
          onEditSelectionChange={onEditSelectionChange}
          onEditSplitPointChange={onEditSplitPointChange}
        />
        <div className="flex items-center gap-4 mt-3">
          <button
            onClick={player.togglePlay}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--annotix-primary)] text-white hover:opacity-90 transition-opacity"
          >
            {player.isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <span className="text-sm tabular-nums text-[var(--annotix-dark)]">
            {formatTime(player.currentTime)} / {formatTime(player.duration)}
          </span>
        </div>
      </div>

      {/* Class Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-4">{t('selectClass')}</h3>

        {classes.length === 0 ? (
          <div className="text-center py-8 text-[var(--annotix-gray)]">
            <p className="text-sm">{t('noClasses')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {classes.map((cls, idx) => {
              const isSelected = selectedClassId === cls.id;
              return (
                <button
                  key={cls.id}
                  onClick={() => handleClassSelect(cls.id)}
                  className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10 shadow-md scale-[1.02]'
                      : 'border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/40 hover:shadow-sm'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full mb-2 ${isSelected ? 'ring-2 ring-offset-2 ring-[var(--annotix-primary)]' : ''}`}
                    style={{ backgroundColor: cls.color }}
                  />
                  <span className="text-sm font-medium text-[var(--annotix-dark)] text-center truncate w-full">
                    {cls.name}
                  </span>
                  {idx < 9 && (
                    <span className="absolute top-1 right-2 text-[10px] text-[var(--annotix-gray)] opacity-50">
                      {idx + 1}
                    </span>
                  )}
                  {isSelected && (
                    <div className="absolute top-1 left-2">
                      <i className="fas fa-check-circle text-[var(--annotix-primary)]"></i>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="px-6 py-3 bg-[var(--annotix-white)] border-t border-[var(--annotix-border)]">
        <div className="flex items-center gap-4">
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
            audio.metadata.status === 'done'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {audio.metadata.status}
          </span>

          <div className="text-xs text-[var(--annotix-gray)]">
            <kbd className="px-1.5 py-0.5 bg-[var(--annotix-gray-light)] rounded text-[10px]">{keyPlayPause}</kbd> {t('shortcuts.playPause')}
            <span className="opacity-30 mx-2">|</span>
            <kbd className="px-1.5 py-0.5 bg-[var(--annotix-gray-light)] rounded text-[10px]">1-9</kbd> {t('shortcuts.selectClass')}
            <span className="opacity-30 mx-2">|</span>
            <kbd className="px-1.5 py-0.5 bg-[var(--annotix-gray-light)] rounded text-[10px]">{keySave}</kbd> {t('shortcuts.save')}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentIndex <= 0} onClick={onPrev}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-xs font-medium tabular-nums text-[var(--annotix-dark)]">
              {currentIndex + 1} / {totalCount}
            </span>
            <Button variant="outline" size="sm" disabled={currentIndex >= totalCount - 1} onClick={onNext}>
              <ChevronRight size={16} />
            </Button>
          </div>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="annotix-btn annotix-btn-primary"
          >
            <Save size={14} className="mr-1" />
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
