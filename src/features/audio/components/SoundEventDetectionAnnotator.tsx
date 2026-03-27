import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Save, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Audio, AudioEvent, ClassDefinition } from '@/lib/db';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { audioService } from '../services/audioService';
import { Waveform } from './Waveform';
import { Button } from '@/components/ui/button';

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

export function SoundEventDetectionAnnotator({
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

  const [events, setEvents] = useState<AudioEvent[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number>(classes[0]?.id ?? 0);
  const [saving, setSaving] = useState(false);

  // Load from audio entry
  useEffect(() => {
    setEvents(audio.events?.length ? [...audio.events] : []);
    if (classes.length > 0 && !classes.find((c) => c.id === selectedClassId)) {
      setSelectedClassId(classes[0].id);
    }
  }, [audio.id]);

  const getClassColor = useCallback((classId: number) => {
    return classes.find((c) => c.id === classId)?.color || '#6366f1';
  }, [classes]);

  const getClassName = useCallback((classId: number) => {
    return classes.find((c) => c.id === classId)?.name || '?';
  }, [classes]);

  const handleRegionCreate = useCallback((startMs: number, endMs: number) => {
    const newEvent: AudioEvent = {
      id: crypto.randomUUID(),
      startMs,
      endMs,
      classId: selectedClassId,
    };
    setEvents((prev) => [...prev, newEvent].sort((a, b) => a.startMs - b.startMs));
  }, [selectedClassId]);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    if (!audio.id) return;
    setSaving(true);
    try {
      await audioService.saveAnnotation(projectId, audio.id, { events });
      onSaved();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }, [audio.id, projectId, events, onSaved]);

  // Auto-guardar cuando cambian los eventos
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!audio.id || events.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 1000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [events]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'F2') {
        e.preventDefault();
        player.togglePlay();
      }
      if (e.ctrlKey && e.code === 'KeyS') {
        e.preventDefault();
        handleSave();
      }
      // Number keys to switch class
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey) {
        const idx = parseInt(e.key) - 1;
        if (idx < classes.length) {
          setSelectedClassId(classes[idx].id);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [player.togglePlay, handleSave, classes]);

  const waveformRegions = events.map((ev) => ({
    id: ev.id,
    startMs: ev.startMs,
    endMs: ev.endMs,
    color: getClassColor(ev.classId),
  }));

  const formatMs = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}.${Math.floor((ms % 1000) / 10).toString().padStart(2, '0')}`;
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-[var(--annotix-light)]">
      <audio ref={player.audioRef} src={player.blobUrl} preload="auto" />

      {/* Player + Waveform with regions */}
      <div className="px-6 py-4 bg-[var(--annotix-white)] border-b border-[var(--annotix-border)]">
        <Waveform
          audioBuffer={player.audioBuffer}
          currentTime={player.currentTime}
          duration={player.duration}
          onSeek={player.seek}
          regions={waveformRegions}
          onRegionCreate={onEditSelectionChange || onEditSplitPointChange ? undefined : handleRegionCreate}
          height={130}
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

          <div className="flex-1" />

          {/* Active class selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--annotix-gray)] mr-1">{t('drawClass')}:</span>
            {classes.map((cls, idx) => (
              <button
                key={cls.id}
                onClick={() => setSelectedClassId(cls.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedClassId === cls.id
                    ? 'ring-2 ring-offset-1 shadow-sm'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: cls.color + '20',
                  color: cls.color,
                  '--tw-ring-color': selectedClassId === cls.id ? cls.color : 'transparent',
                } as React.CSSProperties}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cls.color }} />
                {cls.name}
                {idx < 9 && (
                  <span className="text-[9px] opacity-50 ml-0.5">{idx + 1}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-[var(--annotix-gray)] mt-2">
          {t('dragToMark')}
        </p>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-3">
          {t('events')} ({events.length})
        </h3>

        {events.length === 0 ? (
          <div className="text-center py-8 text-[var(--annotix-gray)]">
            <p className="text-sm">{t('noEvents')}</p>
            <p className="text-xs mt-1 opacity-70">{t('dragToMarkHint')}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {events.map((ev) => (
              <div
                key={ev.id}
                onClick={() => player.seek(ev.startMs / 1000)}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/40 cursor-pointer transition-all"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getClassColor(ev.classId) }}
                />
                <span className="text-xs font-medium" style={{ color: getClassColor(ev.classId) }}>
                  {getClassName(ev.classId)}
                </span>
                <span className="text-xs tabular-nums text-[var(--annotix-gray)]">
                  {formatMs(ev.startMs)} - {formatMs(ev.endMs)}
                </span>
                <span className="text-[10px] text-[var(--annotix-gray)]">
                  ({((ev.endMs - ev.startMs) / 1000).toFixed(1)}s)
                </span>
                <div className="flex-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); deleteEvent(ev.id); }}
                  className="p-1 text-[var(--annotix-gray)] hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
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
            <kbd className="px-1.5 py-0.5 bg-[var(--annotix-gray-light)] rounded text-[10px]">F2</kbd> {t('shortcuts.playPause')}
            <span className="opacity-30 mx-2">|</span>
            <kbd className="px-1.5 py-0.5 bg-[var(--annotix-gray-light)] rounded text-[10px]">1-9</kbd> {t('shortcuts.selectClass')}
            <span className="opacity-30 mx-2">|</span>
            <kbd className="px-1.5 py-0.5 bg-[var(--annotix-gray-light)] rounded text-[10px]">Ctrl+S</kbd> {t('shortcuts.save')}
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
