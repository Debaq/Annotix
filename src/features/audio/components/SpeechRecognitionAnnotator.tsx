import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Save, ChevronLeft, ChevronRight, Plus, Zap, Trash2 } from 'lucide-react';
import { Audio, AudioSegment, ClassDefinition } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { audioService } from '../services/audioService';
import { Waveform } from './Waveform';
import { Button } from '@/components/ui/button';

interface Props {
  audio: Audio;
  projectId: string;
  classes?: ClassDefinition[];
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

const SPEED_OPTIONS = [0.5, 0.75, 1];
const SCRUB_STEP = 1;       // seconds for arrow keys
const SCRUB_FINE = 0.1;     // seconds for shift+arrow

export function SpeechRecognitionAnnotator({
  audio,
  projectId,
  classes = [],
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
  const { activeClassId } = useUIStore();

  const getSpeakerColor = useCallback((speakerId?: number) => {
    if (!speakerId || classes.length === 0) return '#94a3b8';
    return classes.find(c => c.id === speakerId)?.color || '#94a3b8';
  }, [classes]);

  const getSpeakerName = useCallback((speakerId?: number) => {
    if (!speakerId || classes.length === 0) return '';
    return classes.find(c => c.id === speakerId)?.name || '';
  }, [classes]);

  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [speakerId, setSpeakerId] = useState('');
  const [language, setLanguage] = useState('en');
  const [saving, setSaving] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const segmentListRef = useRef<HTMLDivElement>(null);
  const liveSegmentIdRef = useRef<string | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    setSegments(audio.segments?.length ? [...audio.segments] : []);
    setSpeakerId(audio.speakerId || '');
    setLanguage(audio.language || 'en');
    setActiveSegmentId(null);
    liveSegmentIdRef.current = null;
    pendingFocusIdRef.current = null;
  }, [audio.id]);

  // ── Focus new segment after render ─────────────────────────────────────
  useEffect(() => {
    if (!pendingFocusIdRef.current) return;
    const id = pendingFocusIdRef.current;
    pendingFocusIdRef.current = null;
    requestAnimationFrame(() => {
      const el = segmentListRef.current?.querySelector<HTMLInputElement>(`[data-seg-id="${id}"]`);
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }, [segments]);

  // ── Live segment growth + active highlight ─────────────────────────────
  useEffect(() => {
    const ms = Math.round(player.currentTime * 1000);

    if (liveSegmentIdRef.current && player.isPlaying) {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === liveSegmentIdRef.current ? { ...s, endMs: ms } : s
        )
      );
      setActiveSegmentId(liveSegmentIdRef.current);
      return;
    }

    // Finalize live segment on pause
    if (liveSegmentIdRef.current && !player.isPlaying) {
      const liveId = liveSegmentIdRef.current;
      liveSegmentIdRef.current = null;
      // Focus its input so user can type the text
      pendingFocusIdRef.current = liveId;
      setSegments((prev) => [...prev]); // trigger focus effect
    }

    if (segments.length > 0) {
      const active = segments.find((s) => ms >= s.startMs && ms <= s.endMs);
      if (active) setActiveSegmentId(active.id);
    }
  }, [player.currentTime, player.isPlaying]);

  // ── Waveform regions from segments ─────────────────────────────────────
  const waveformRegions = useMemo(() =>
    segments.map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      color: liveSegmentIdRef.current === s.id
        ? '#ef4444'
        : activeSegmentId === s.id
        ? '#6366f1'
        : getSpeakerColor(s.speakerId),
    })),
    [segments, activeSegmentId, getSpeakerColor]
  );

  // ── Helpers ────────────────────────────────────────────────────────────
  const focusSegment = useCallback((id: string) => {
    setActiveSegmentId(id);
    pendingFocusIdRef.current = id;
    setSegments((prev) => [...prev]); // trigger focus effect
  }, []);

  const addSegment = useCallback(() => {
    const ms = Math.round(player.currentTime * 1000);
    const newId = crypto.randomUUID();
    const newSeg: AudioSegment = {
      id: newId,
      startMs: ms,
      endMs: Math.min(ms + 3000, Math.round(player.duration * 1000)),
      text: '',
      speakerId: activeClassId ?? undefined,
    };
    setSegments((prev) => [...prev, newSeg].sort((a, b) => a.startMs - b.startMs));
    setActiveSegmentId(newId);
    pendingFocusIdRef.current = newId;
  }, [player.currentTime, player.duration, activeClassId]);

  const updateSegment = useCallback((id: string, field: keyof AudioSegment, value: string | number) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }, []);

  const deleteSegment = useCallback((id: string) => {
    // If deleting the live segment, cancel live mode
    if (liveSegmentIdRef.current === id) {
      liveSegmentIdRef.current = null;
    }

    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const next = prev.filter((s) => s.id !== id);

      // Pick neighbor to focus: prefer next, then previous
      if (next.length > 0) {
        const focusIdx = Math.min(idx, next.length - 1);
        const neighbor = next[focusIdx];
        setActiveSegmentId(neighbor.id);
        pendingFocusIdRef.current = neighbor.id;
        player.seek(neighbor.startMs / 1000);
      } else {
        setActiveSegmentId(null);
      }

      return next;
    });
  }, [player]);

  // ── Split / Enter ──────────────────────────────────────────────────────
  const splitAndStartLive = useCallback(() => {
    const ms = Math.round(player.currentTime * 1000);

    // Finalize live segment if active
    if (liveSegmentIdRef.current) {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === liveSegmentIdRef.current ? { ...s, endMs: ms } : s
        )
      );
      liveSegmentIdRef.current = null;
    }

    // Close the active segment at current time
    if (activeSegmentId) {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === activeSegmentId ? { ...s, endMs: Math.min(s.endMs, ms) } : s
        )
      );
    }

    // Create new segment
    const newId = crypto.randomUUID();
    const newSeg: AudioSegment = { id: newId, startMs: ms, endMs: ms, text: '' };
    setSegments((prev) => [...prev, newSeg].sort((a, b) => a.startMs - b.startMs));
    setActiveSegmentId(newId);
    pendingFocusIdRef.current = newId;

    if (autoplay) {
      liveSegmentIdRef.current = newId;
      if (!player.isPlaying) player.togglePlay();
    }
  }, [player.currentTime, player.isPlaying, player.togglePlay, activeSegmentId, autoplay]);

  // ── Replay active segment from start ───────────────────────────────────
  const replaySegment = useCallback(() => {
    if (!activeSegmentId) return;
    const seg = segments.find((s) => s.id === activeSegmentId);
    if (!seg) return;
    player.seek(seg.startMs / 1000);
    if (!player.isPlaying) player.togglePlay();
  }, [activeSegmentId, segments, player]);

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!audio.id) return;
    setSaving(true);
    try {
      const transcription = segments.map((s) => s.text).filter(Boolean).join(' ');
      await audioService.saveAnnotation(projectId, audio.id, {
        transcription,
        speakerId: speakerId || undefined,
        language,
        segments,
      });
      onSaved();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }, [audio.id, projectId, segments, speakerId, language, onSaved]);

  // Auto-guardar con debounce cuando cambian los datos
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!audio.id) return;
    // No auto-guardar en el mount inicial
    if (segments === audio.segments || segments.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [segments, speakerId, language]);

  const handleSaveAndNext = useCallback(async () => {
    // Cancelar auto-save pendiente antes de guardar+avanzar
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    await handleSave();
    onNext();
  }, [handleSave, onNext]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isSegInput = target.hasAttribute('data-seg-id');

      // F2 = play/pause (global)
      if (e.code === 'F2') {
        e.preventDefault();
        player.togglePlay();
        return;
      }
      // F3 = replay active segment from start (global)
      if (e.code === 'F3') {
        e.preventDefault();
        replaySegment();
        return;
      }
      // F4 = rewind 2s (global)
      if (e.code === 'F4') {
        e.preventDefault();
        player.seek(Math.max(0, player.currentTime - 2));
        return;
      }
      // Arrow keys for scrubbing (only from segment inputs)
      if (isSegInput && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        // Only scrub if cursor is at edge of input or input is empty
        const input = target as HTMLInputElement;
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const atEnd = input.selectionStart === input.value.length;
        const isEmpty = input.value.length === 0;

        if (e.code === 'ArrowLeft' && (atStart || isEmpty)) {
          e.preventDefault();
          const step = e.shiftKey ? SCRUB_FINE : SCRUB_STEP;
          player.seek(Math.max(0, player.currentTime - step));
          return;
        }
        if (e.code === 'ArrowRight' && (atEnd || isEmpty)) {
          e.preventDefault();
          const step = e.shiftKey ? SCRUB_FINE : SCRUB_STEP;
          player.seek(Math.min(player.duration, player.currentTime + step));
          return;
        }
      }
      // Enter = split & new segment (from segment input)
      if (e.code === 'Enter' && isSegInput) {
        e.preventDefault();
        splitAndStartLive();
        return;
      }
      // Delete/Backspace on empty input = delete segment
      if ((e.code === 'Backspace' || e.code === 'Delete') && isSegInput) {
        const input = target as HTMLInputElement;
        if (input.value.length === 0) {
          e.preventDefault();
          const segId = input.getAttribute('data-seg-id');
          if (segId) deleteSegment(segId);
          return;
        }
      }
      // Tab = save & next audio
      if (e.code === 'Tab' && isSegInput) {
        e.preventDefault();
        handleSaveAndNext();
        return;
      }
      // Ctrl+S = save
      if (e.ctrlKey && e.code === 'KeyS') {
        e.preventDefault();
        handleSave();
        return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [player, replaySegment, splitAndStartLive, deleteSegment, handleSave, handleSaveAndNext]);

  // ── Format helpers ─────────────────────────────────────────────────────
  const formatMs = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const centis = Math.floor((ms % 1000) / 10);
    return `${m}:${s.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[var(--annotix-light)]">
      <audio ref={player.audioRef} src={player.blobUrl} preload="auto" />

      {/* TOP: Player */}
      <div className="px-6 py-4 bg-[var(--annotix-white)] border-b border-[var(--annotix-border)]">
        <Waveform
          audioBuffer={player.audioBuffer}
          currentTime={player.currentTime}
          duration={player.duration}
          onSeek={player.seek}
          regions={waveformRegions}
          height={100}
          editSelection={editSelection}
          editSplitPoint={editSplitPoint}
          onEditSelectionChange={onEditSelectionChange}
          onEditSplitPointChange={onEditSplitPointChange}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={player.togglePlay}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--annotix-primary)] text-white hover:opacity-90 transition-opacity"
          >
            {player.isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          <div className="flex items-center gap-1">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                onClick={() => player.setPlaybackRate(rate)}
                className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                  player.playbackRate === rate
                    ? 'bg-[var(--annotix-primary)] text-white'
                    : 'bg-[var(--annotix-gray-light)] text-[var(--annotix-gray)] hover:bg-[var(--annotix-border)]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <span className="text-sm tabular-nums text-[var(--annotix-dark)]">
            {formatTime(player.currentTime)} / {formatTime(player.duration)}
          </span>

          <button
            onClick={() => setAutoplay((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              autoplay
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-[var(--annotix-gray-light)] text-[var(--annotix-gray)]'
            }`}
            title={t('autoplay')}
          >
            <Zap size={12} />
            Autoplay
          </button>

          <div className="flex-1" />

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--annotix-gray)]">
            <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">F2</kbd> {t('shortcuts.playPause')}</span>
            <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">F3</kbd> {t('shortcuts.replaySegment')}</span>
            <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">F4</kbd> {t('shortcuts.rewind')}</span>
            <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">Enter</kbd> {t('shortcuts.splitSegment')}</span>
            <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">&larr;&rarr;</kbd> {t('shortcuts.scrub')}</span>
          </div>
        </div>
      </div>

      {/* MIDDLE: Segments */}
      <div className="flex-1 overflow-y-auto p-4" ref={segmentListRef}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[var(--annotix-dark)]">
            {t('segments')} ({segments.length})
          </h3>
          <Button size="sm" variant="outline" onClick={addSegment}>
            <Plus size={14} className="mr-1" /> {t('addSegment')}
          </Button>
        </div>

        {segments.length === 0 && (
          <div className="text-center py-8 text-[var(--annotix-gray)]">
            <p className="text-sm">{t('noSegments')}</p>
            <p className="text-xs mt-1 opacity-70">{t('addSegmentHint')}</p>
          </div>
        )}

        <div className="space-y-0.5">
          {segments.map((seg) => {
            const isLive = liveSegmentIdRef.current === seg.id;
            const isActive = activeSegmentId === seg.id;
            return (
              <div
                key={seg.id}
                onClick={() => { player.seek(seg.startMs / 1000); focusSegment(seg.id); }}
                className={`flex items-center gap-2 px-2 py-1 rounded border cursor-pointer transition-all ${
                  isLive
                    ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                    : isActive
                    ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/5'
                    : 'border-transparent hover:border-[var(--annotix-border)] hover:bg-[var(--annotix-white)]'
                }`}
              >
                {isLive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                )}

                <span className="text-[10px] tabular-nums text-[var(--annotix-gray)] flex-shrink-0 w-[5.5rem] text-center">
                  {formatMs(seg.startMs)}-{formatMs(seg.endMs)}
                </span>

                {classes.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Asignar speaker activo al segmento
                      if (activeClassId != null) {
                        updateSegment(seg.id, 'speakerId', activeClassId);
                      }
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: getSpeakerColor(seg.speakerId) + '20',
                      borderColor: getSpeakerColor(seg.speakerId),
                      color: getSpeakerColor(seg.speakerId),
                    }}
                    title={t('clickToAssignSpeaker', 'Click to assign active speaker')}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getSpeakerColor(seg.speakerId) }}
                    />
                    {getSpeakerName(seg.speakerId) || '?'}
                  </button>
                )}

                <input
                  type="text"
                  data-seg-id={seg.id}
                  value={seg.text}
                  onChange={(e) => updateSegment(seg.id, 'text', e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={() => { setActiveSegmentId(seg.id); }}
                  placeholder={t('segmentTextPlaceholder')}
                  className="flex-1 min-w-0 px-2 py-0.5 text-sm rounded border border-transparent focus:border-[var(--annotix-border)] bg-transparent focus:bg-[var(--annotix-white)] focus:outline-none focus:ring-1 focus:ring-[var(--annotix-primary)]/50"
                />

                <button
                  onClick={(e) => { e.stopPropagation(); deleteSegment(seg.id); }}
                  className="text-[var(--annotix-gray)] hover:text-red-500 transition-colors p-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100"
                  style={{ opacity: isActive || isLive ? 1 : undefined }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM: Metadata + Nav */}
      <div className="px-6 py-2 bg-[var(--annotix-white)] border-t border-[var(--annotix-border)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--annotix-dark)]">{t('language')}</label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en"
              className="w-16 px-2 py-1 text-xs rounded border border-[var(--annotix-border)] bg-[var(--annotix-white)]"
            />
          </div>
          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
            audio.metadata.status === 'done'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {audio.metadata.status}
          </span>

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
