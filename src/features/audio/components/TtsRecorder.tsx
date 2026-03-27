import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Mic, Square, Play, Pause, Check, RotateCcw, SkipForward, Upload,
  AlertTriangle, Volume2,
} from 'lucide-react';
import { TtsSentence } from '@/lib/db';
import { useMicRecorder } from '../hooks/useMicRecorder';
import { ttsService } from '../services/ttsService';
import { audioService } from '../services/audioService';
import { Button } from '@/components/ui/button';
import { matchesShortcut } from '@/features/core/utils/matchShortcut';
import { useShortcutKey } from '@/features/core/hooks/useShortcutKey';

interface Props {
  projectId: string;
  sentences: TtsSentence[];
  onSentencesChange: () => Promise<void>;
  stats: { total: number; recorded: number; pending: number; skipped: number };
}

/** Convierte Blob a base64 de forma eficiente usando FileReader */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // dataUrl = "data:audio/webm;base64,XXXXXX"
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

export function TtsRecorder({ projectId, sentences, onSentencesChange, stats }: Props) {
  const { t } = useTranslation('audio');
  const keyRecord = useShortcutKey('tts-record');
  const keyRepeat = useShortcutKey('tts-repeat');
  const keySkip = useShortcutKey('tts-skip');
  const [error, setError] = useState<string | null>(null);
  const recorder = useMicRecorder((msg) => {
    setError(msg);
    console.error('[TtsRecorder]', msg);
  });

  const findNextPending = useCallback((fromIdx: number = 0) => {
    for (let i = fromIdx; i < sentences.length; i++) {
      if (sentences[i].status === 'pending') return i;
    }
    for (let i = 0; i < fromIdx; i++) {
      if (sentences[i].status === 'pending') return i;
    }
    return -1;
  }, [sentences]);

  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = sentences.findIndex(s => s.status === 'pending');
    return idx >= 0 ? idx : 0;
  });
  const [saving, setSaving] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Audio del backend para oraciones ya grabadas
  const [savedAudioUrl, setSavedAudioUrl] = useState<string | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const current = sentences[currentIndex];
  const hasNewRecording = recorder.state.audioBlob !== null;
  const previewUrl = recorder.state.audioUrl || savedAudioUrl;
  const canPlay = previewUrl !== null && !recorder.state.isRecording;

  // Detectar micrófonos al montar
  useEffect(() => { recorder.refreshDevices(); }, []);

  // Cargar audio guardado cuando navegamos a una oración ya grabada
  useEffect(() => {
    // Limpiar URL anterior
    setSavedAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIsPlaying(false);

    if (!current || current.status !== 'recorded' || !current.audioId) return;

    let cancelled = false;
    setLoadingSaved(true);
    // Cargar datos y nombre del archivo para inferir mime type
    Promise.all([
      audioService.getAudioData(projectId, current.audioId!),
      audioService.getById(projectId, current.audioId!),
    ]).then(([bytes, audioEntry]) => {
      if (cancelled) return;
      // Inferir mime del nombre de archivo
      const name = audioEntry?.file || audioEntry?.name || '';
      const mimeType = name.endsWith('.ogg') ? 'audio/ogg'
        : name.endsWith('.mp4') || name.endsWith('.m4a') ? 'audio/mp4'
        : name.endsWith('.wav') ? 'audio/wav'
        : name.endsWith('.webm') ? 'audio/webm'
        : 'audio/ogg'; // fallback
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
      setSavedAudioUrl(URL.createObjectURL(blob));
    }).catch((err) => {
      console.error('Failed to load saved audio:', err);
    }).finally(() => {
      if (!cancelled) setLoadingSaved(false);
    });

    return () => { cancelled = true; };
  }, [currentIndex, current?.id, current?.status, current?.audioId, projectId]);

  // ── Auto-save: cuando el recorder produce un blob, guardar y avanzar ─
  const autoSaveRef = useRef(false);
  useEffect(() => {
    if (!recorder.state.audioBlob || recorder.state.isRecording || !autoSaveRef.current) return;
    autoSaveRef.current = false;
    // Guardar automáticamente
    (async () => {
      if (!current || saving) return;
      setSaving(true);
      setError(null);
      try {
        const base64 = await blobToBase64(recorder.state.audioBlob!);
        const durationMs = Math.round(recorder.state.duration * 1000);
        const mime = recorder.state.mimeType;
        const ext = mime.includes('ogg') ? 'ogg'
          : mime.includes('mp4') ? 'mp4'
          : mime.includes('webm') ? 'webm'
          : 'ogg';

        await ttsService.saveRecording(projectId, current.id, base64, ext, durationMs, 48000);
        recorder.reset();
        await onSentencesChange();

        const next = findNextPending(currentIndex + 1);
        if (next >= 0) setCurrentIndex(next);
      } catch (err) {
        setError(`Save failed: ${err}`);
        console.error('Failed to save recording:', err);
      } finally {
        setSaving(false);
      }
    })();
  }, [recorder.state.audioBlob, recorder.state.isRecording]);

  // ── Recording ──────────────────────────────────────────────────────────
  const handleToggleRecord = useCallback(async () => {
    setError(null);
    if (recorder.state.isRecording) {
      autoSaveRef.current = true;
      recorder.stop();
    } else {
      setSavedAudioUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      await recorder.start();
    }
  }, [recorder]);

  // ── Upload file ────────────────────────────────────────────────────────
  const handleUploadFile = useCallback(async () => {
    const result = await open({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'ogg', 'webm', 'm4a'] }],
    });
    if (!result) return;
    const path = Array.isArray(result) ? result[0] : result;

    try {
      const audioId = await audioService.upload(projectId, path, 0, 16000);
      if (current) {
        await ttsService.linkUpload(projectId, current.id, audioId);
        await onSentencesChange();
      }
    } catch (err) {
      setError(`Upload failed: ${err}`);
    }
  }, [projectId, current, onSentencesChange]);

  // ── Repeat ─────────────────────────────────────────────────────────────
  const handleRepeat = useCallback(() => {
    recorder.reset();
    setSavedAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [recorder]);

  // ── Skip ───────────────────────────────────────────────────────────────
  const handleSkip = useCallback(async () => {
    if (!current) return;
    try {
      const updated = sentences.map(s =>
        s.id === current.id ? { ...s, status: 'skipped' as const } : s
      );
      await ttsService.saveSentences(projectId, updated);
      recorder.reset();
      await onSentencesChange();

      const next = findNextPending(currentIndex + 1);
      if (next >= 0) setCurrentIndex(next);
    } catch (err) {
      setError(`Skip failed: ${err}`);
    }
  }, [current, sentences, projectId, recorder, onSentencesChange, findNextPending, currentIndex]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const navigateTo = useCallback((idx: number) => {
    setCurrentIndex(idx);
    recorder.reset();
    setIsPlaying(false);
    setError(null);
  }, [recorder]);

  // ── Preview playback ──────────────────────────────────────────────────
  const togglePreview = useCallback(() => {
    if (!audioPreviewRef.current || !previewUrl) return;
    if (isPlaying) {
      audioPreviewRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPreviewRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, previewUrl]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (matchesShortcut(e, 'tts-record')) {
        e.preventDefault();
        if (canPlay && !hasNewRecording && !recorder.state.isRecording) {
          togglePreview();
        } else {
          handleToggleRecord();
        }
      } else if (matchesShortcut(e, 'tts-repeat')) {
        e.preventDefault();
        handleRepeat();
      } else if (matchesShortcut(e, 'tts-skip')) {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleToggleRecord, handleRepeat, handleSkip, hasNewRecording, togglePreview, canPlay, recorder.state.isRecording]);

  if (!current) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--annotix-gray)]">
        <div className="text-center">
          <Check size={48} className="mx-auto mb-4 text-green-500" />
          <p className="text-lg font-medium">
            {t('tts.sentenceCount', { done: stats.recorded, total: stats.total })}
          </p>
        </div>
      </div>
    );
  }

  const isRecordedSentence = current.status === 'recorded' && !hasNewRecording && !recorder.state.isRecording;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 max-w-3xl mx-auto">
      {/* Progress indicator */}
      <div className="w-full mb-6">
        <div className="flex items-center justify-between text-sm text-[var(--annotix-gray)] mb-2">
          <span>{t('tts.sentenceOf', { current: currentIndex + 1, total: sentences.length })}</span>
          <span>{t('tts.sentenceCount', { done: stats.recorded, total: stats.total })}</span>
        </div>
        <div className="h-2 bg-[var(--annotix-gray-light)] rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${stats.total > 0 ? (stats.recorded / stats.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Sentence text */}
      <div className={`w-full rounded-xl border p-8 mb-8 text-center ${
        isRecordedSentence
          ? 'bg-green-50 border-green-200'
          : 'bg-[var(--annotix-white)] border-[var(--annotix-border)]'
      }`}>
        {isRecordedSentence && (
          <div className="flex items-center justify-center gap-2 mb-3 text-green-600">
            <Check size={16} />
            <span className="text-xs font-medium">{t('tts.totalRecorded')}</span>
          </div>
        )}
        <p className="text-2xl leading-relaxed font-medium text-[var(--annotix-dark)]">
          {current.text}
        </p>
      </div>

      {/* VU Meter */}
      {recorder.state.isRecording && (
        <div className="w-full mb-6 space-y-2">
          <div className="flex items-center gap-3">
            <Volume2 size={16} className="text-[var(--annotix-gray)] flex-shrink-0" />
            <div className="flex-1 h-4 bg-[var(--annotix-gray-light)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  recorder.state.isClipping ? 'bg-red-500' : recorder.state.vuLevel > 0.6 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${recorder.state.vuLevel * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-[var(--annotix-gray)] w-12 text-right">
              {(recorder.state.vuLevel * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center justify-center gap-4">
            {recorder.state.isClipping && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-600 animate-pulse">
                <AlertTriangle size={14} />
                {t('tts.clipping')}
              </span>
            )}
            {recorder.state.isNoisy && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                <AlertTriangle size={14} />
                {t('tts.noiseWarning')}
              </span>
            )}
            <span className="text-xs tabular-nums text-[var(--annotix-gray)]">
              {t('tts.timeRecorded')}: {formatDuration(recorder.state.duration)}
            </span>
          </div>
        </div>
      )}

      {/* Preview playback */}
      {canPlay && previewUrl && (
        <div className="mb-6">
          <audio
            ref={audioPreviewRef}
            src={previewUrl}
            onEnded={() => setIsPlaying(false)}
          />
          <Button variant="outline" size="sm" onClick={togglePreview} className="gap-2">
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {t('tts.playRecording')}
          </Button>
        </div>
      )}

      {loadingSaved && (
        <p className="mb-4 text-xs text-[var(--annotix-gray)]">Loading...</p>
      )}

      {/* Error */}
      {error && (
        <div className="w-full mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Mic selector */}
      {!recorder.state.isRecording && (
        <div className="mb-4 flex items-center gap-2">
          <Mic size={14} className="text-[var(--annotix-gray)] flex-shrink-0" />
          {recorder.devices.length > 0 ? (
            <select
              value={recorder.selectedDeviceId || ''}
              onChange={e => recorder.setSelectedDeviceId(e.target.value)}
              className="px-2 py-1.5 text-xs rounded border border-[var(--annotix-border)] bg-[var(--annotix-white)] max-w-[350px]"
            >
              {recorder.devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => recorder.refreshDevices()}
              className="px-2 py-1.5 text-xs rounded border border-[var(--annotix-border)] bg-[var(--annotix-white)] text-[var(--annotix-gray)] hover:border-[var(--annotix-primary)] transition-colors"
            >
              Detect microphones...
            </button>
          )}
        </div>
      )}

      {/* Main record button */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handleToggleRecord}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
            recorder.state.isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-[var(--annotix-primary)] hover:opacity-90'
          } text-white`}
        >
          {recorder.state.isRecording ? <Square size={32} /> : <Mic size={32} />}
        </button>
      </div>

      {/* Saving indicator */}
      {saving && (
        <p className="mb-4 text-xs text-[var(--annotix-primary)] animate-pulse">{t('saving')}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleRepeat} className="gap-2">
          <RotateCcw size={16} />
          {t('tts.repeat')}
        </Button>

        <Button variant="outline" onClick={handleSkip} className="gap-2">
          <SkipForward size={16} />
          {t('tts.skip')}
        </Button>

        <Button variant="outline" onClick={handleUploadFile} className="gap-2">
          <Upload size={16} />
          {t('tts.uploadFile')}
        </Button>
      </div>

      {/* Shortcuts */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-[var(--annotix-gray)]">
        <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">{keyRecord}</kbd> {t('tts.record')}/{t('tts.stopRecording')}</span>
        <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">{keyRepeat}</kbd> {t('tts.repeat')}</span>
        <span><kbd className="px-1 py-0.5 bg-[var(--annotix-gray-light)] rounded">{keySkip}</kbd> {t('tts.skip')}</span>
      </div>

      {/* Sentence navigator */}
      <div className="w-full mt-8 flex gap-1 flex-wrap justify-center">
        {sentences.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => navigateTo(idx)}
            className={`w-6 h-6 rounded text-[9px] font-medium transition-all ${
              idx === currentIndex
                ? 'bg-[var(--annotix-primary)] text-white ring-2 ring-[var(--annotix-primary)]/30'
                : s.status === 'recorded'
                ? 'bg-green-100 text-green-700'
                : s.status === 'skipped'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-[var(--annotix-gray-light)] text-[var(--annotix-gray)] hover:bg-[var(--annotix-border)]'
            }`}
            title={s.text.substring(0, 40)}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
