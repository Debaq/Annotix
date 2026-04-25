import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Scissors,
  ScissorsLineDashed,
  Trash2,
  Columns2,
  VolumeX,
  Activity,
  SlidersHorizontal,
  X,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { audioEditService } from '../services/audioEditService';

export type EditTool =
  | 'trim'
  | 'cut'
  | 'delete'
  | 'split'
  | 'silence'
  | 'normalize'
  | 'eq'
  | null;

// eslint-disable-next-line react-refresh/only-export-components
export const RANGE_TOOLS: EditTool[] = ['trim', 'cut', 'delete', 'silence'];

interface AudioEditToolbarProps {
  projectId: string;
  audioId: string | undefined;
  editSelection: { startMs: number; endMs: number } | null;
  splitPoint: number | null;
  activeTool: EditTool;
  onToolChange: (tool: EditTool) => void;
  onComplete: () => void;
}

const EQ_PRESETS = [
  { id: 'voice-clean', label: 'edit.eqVoiceClean' },
  { id: 'voice-telephone', label: 'edit.eqTelephone' },
  { id: 'room-reverb', label: 'edit.eqRoomReverb' },
  { id: 'noise-reduce', label: 'edit.eqNoiseReduce' },
  { id: 'flat', label: 'edit.eqFlat' },
] as const;

const TOOLS: { id: NonNullable<EditTool>; icon: typeof Scissors; label: string }[] = [
  { id: 'trim', icon: Scissors, label: 'edit.trim' },
  { id: 'cut', icon: ScissorsLineDashed, label: 'edit.cut' },
  { id: 'delete', icon: Trash2, label: 'edit.delete' },
  { id: 'split', icon: Columns2, label: 'edit.split' },
  { id: 'silence', icon: VolumeX, label: 'edit.silence' },
  { id: 'normalize', icon: Activity, label: 'edit.normalize' },
  { id: 'eq', icon: SlidersHorizontal, label: 'edit.eq' },
];

function formatMs(ms: number) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export function AudioEditToolbar({
  projectId,
  audioId,
  editSelection,
  splitPoint,
  activeTool,
  onToolChange,
  onComplete,
}: AudioEditToolbarProps) {
  const { t } = useTranslation('audio');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eqPreset, setEqPreset] = useState('voice-clean');

  const handleApply = useCallback(async () => {
    if (!audioId) return;
    setProcessing(true);
    setError(null);
    try {
      switch (activeTool) {
        case 'trim':
          if (editSelection)
            await audioEditService.trim(projectId, audioId, editSelection.startMs, editSelection.endMs);
          break;
        case 'cut':
          if (editSelection)
            await audioEditService.cut(projectId, audioId, editSelection.startMs, editSelection.endMs);
          break;
        case 'delete':
          if (editSelection)
            await audioEditService.deleteRange(projectId, audioId, editSelection.startMs, editSelection.endMs);
          break;
        case 'silence':
          if (editSelection)
            await audioEditService.silenceRange(projectId, audioId, editSelection.startMs, editSelection.endMs);
          break;
        case 'split':
          if (splitPoint !== null) await audioEditService.split(projectId, audioId, splitPoint);
          break;
        case 'normalize':
          await audioEditService.normalize(projectId, audioId);
          break;
        case 'eq':
          await audioEditService.equalize(projectId, audioId, eqPreset);
          break;
      }
      onToolChange(null);
      onComplete();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setProcessing(false);
    }
  }, [activeTool, audioId, projectId, editSelection, splitPoint, eqPreset, onComplete, onToolChange]);

  const needsRange = activeTool && RANGE_TOOLS.includes(activeTool);
  const canApply =
    activeTool === 'normalize' ||
    activeTool === 'eq' ||
    (needsRange && editSelection) ||
    (activeTool === 'split' && splitPoint !== null);

  return (
    <div className="px-4 py-1.5 border-b border-[var(--annotix-border)] bg-[var(--annotix-white)]/80">
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => {
              onToolChange(activeTool === id ? null : id);
              setError(null);
            }}
            disabled={processing}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
              activeTool === id
                ? 'bg-[var(--annotix-primary)] text-white shadow-sm'
                : 'text-[var(--annotix-gray)] hover:text-[var(--annotix-dark)] hover:bg-[var(--annotix-gray-light)]'
            }`}
            title={t(label)}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{t(label)}</span>
          </button>
        ))}
      </div>

      {/* Active tool controls */}
      {activeTool && (
        <div className="flex items-center gap-2 mt-1.5 min-h-[28px]">
          {/* Range display for trim/cut/delete/silence */}
          {needsRange && (
            <div className="flex items-center gap-2 text-xs text-[var(--annotix-dark)]">
              {editSelection ? (
                <>
                  <span className="tabular-nums font-medium">{formatMs(editSelection.startMs)}</span>
                  <span className="text-[var(--annotix-gray)]">&rarr;</span>
                  <span className="tabular-nums font-medium">{formatMs(editSelection.endMs)}</span>
                  <span className="text-[10px] text-[var(--annotix-gray)]">
                    ({((editSelection.endMs - editSelection.startMs) / 1000).toFixed(1)}s)
                  </span>
                </>
              ) : (
                <span className="text-[var(--annotix-gray)] italic text-[11px]">
                  {t('edit.dragToSelect')}
                </span>
              )}
            </div>
          )}

          {/* Split point display */}
          {activeTool === 'split' && (
            <div className="text-xs text-[var(--annotix-dark)]">
              {splitPoint !== null ? (
                <span className="tabular-nums font-medium">
                  {t('edit.splitAt')} {formatMs(splitPoint)}
                </span>
              ) : (
                <span className="text-[var(--annotix-gray)] italic text-[11px]">
                  {t('edit.clickToSplit')}
                </span>
              )}
            </div>
          )}

          {/* Normalize info */}
          {activeTool === 'normalize' && (
            <span className="text-[11px] text-[var(--annotix-gray)]">
              {t('edit.normalizeDesc')}
            </span>
          )}

          {/* EQ presets */}
          {activeTool === 'eq' && (
            <div className="flex items-center gap-1 flex-wrap">
              {EQ_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setEqPreset(p.id)}
                  className={`px-2 py-0.5 text-[11px] rounded transition-all ${
                    eqPreset === p.id
                      ? 'bg-[var(--annotix-primary)] text-white'
                      : 'bg-[var(--annotix-gray-light)] text-[var(--annotix-gray)] hover:text-[var(--annotix-dark)]'
                  }`}
                >
                  {t(p.label)}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1" />

          {/* Error */}
          {error && (
            <span
              className="text-[11px] text-red-500 max-w-[250px] truncate"
              title={error}
            >
              {error}
            </span>
          )}

          {/* Cancel */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onToolChange(null);
              setError(null);
            }}
            disabled={processing}
            className="h-6 px-2 text-xs"
          >
            <X size={12} className="mr-1" />
            {t('edit.cancel')}
          </Button>

          {/* Apply */}
          <Button
            size="sm"
            onClick={handleApply}
            disabled={!canApply || processing}
            className="h-6 px-3 text-xs annotix-btn annotix-btn-primary"
          >
            {processing ? (
              <>
                <Loader2 size={12} className="mr-1 animate-spin" />
                {t('edit.processing')}
              </>
            ) : (
              <>
                <Check size={12} className="mr-1" />
                {t('edit.apply')}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
