import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Wand2, Trash2 } from 'lucide-react';
import { samRefilterCandidates, onSamAmgProgress } from '@/lib/tauriDb';
import type { BBoxData, Annotation } from '@/lib/db';
import { useSamStore } from '../store/useSamStore';
import { useToast } from '@/components/hooks/use-toast';

interface Props {
  projectId: string | null;
  imageId: string | null;
  annotations: Annotation[];
}

function bboxesFromAnnotations(anns: Annotation[]): [number, number, number, number][] {
  return anns
    .filter((a) => a.type === 'bbox')
    .map((a) => {
      const d = a.data as BBoxData;
      return [d.x, d.y, d.width, d.height] as [number, number, number, number];
    });
}

export function SamFloatingPanel({ projectId, imageId, annotations }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const samAssistActive = useSamStore((s) => s.samAssistActive);
  const setSamAssistActive = useSamStore((s) => s.setSamAssistActive);
  const candidates = useSamStore((s) => s.candidates);
  const setCandidates = useSamStore((s) => s.setCandidates);
  const filters = useSamStore((s) => s.filters);
  const setFilters = useSamStore((s) => s.setFilters);
  const activeMaskIdx = useSamStore((s) => s.activeMaskIdx);
  const setActiveMaskIdx = useSamStore((s) => s.setActiveMaskIdx);
  const amgProgress = useSamStore((s) => s.amgProgress);
  const setAmgProgress = useSamStore((s) => s.setAmgProgress);
  const encoding = useSamStore((s) => s.encoding);
  const refineMode = useSamStore((s) => s.refineMode);
  const setRefineMode = useSamStore((s) => s.setRefineMode);
  const refineRunning = useSamStore((s) => s.refineRunning);
  const generating = useSamStore((s) => s.generating);
  const requestAmg = useSamStore((s) => s.requestAmg);

  const overlapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Posición arrastrable del panel. Default: esquina superior derecha con
  // offset para no solaparse con FloatingZoomControls.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rootEl = e.currentTarget.parentElement as HTMLElement;
    const parentEl = (rootEl.offsetParent as HTMLElement) ?? document.body;
    const rootRect = rootEl.getBoundingClientRect();
    const parentRect = parentEl.getBoundingClientRect();
    // dx/dy: offset del puntero respecto a la esquina del panel.
    const dx = e.clientX - rootRect.left;
    const dy = e.clientY - rootRect.top;
    dragRef.current = { dx, dy };
    // Fijar posición actual antes de soltar right/top defaults para evitar salto.
    setPos({
      x: rootRect.left - parentRect.left,
      y: rootRect.top - parentRect.top,
    });
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, ev.clientX - parentRect.left - dragRef.current.dx),
        y: Math.max(0, ev.clientY - parentRect.top - dragRef.current.dy),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Suscribirse a progreso AMG.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onSamAmgProgress((p) => setAmgProgress(p)).then((u) => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [setAmgProgress]);

  if (!samAssistActive) return null;

  const handleGenerate = () => {
    if (!projectId || !imageId) return;
    requestAmg();
  };

  const handleClear = () => {
    setCandidates([]);
  };

  const handleOverlapChange = (value: number) => {
    setFilters({ overlapThresh: value });
    if (!imageId) return;
    if (overlapTimerRef.current) clearTimeout(overlapTimerRef.current);
    overlapTimerRef.current = setTimeout(() => {
      samRefilterCandidates(
        imageId,
        bboxesFromAnnotations(annotations),
        value,
      )
        .then((m) => setCandidates(m))
        .catch((e) => {
          toast({ title: String(e), variant: 'destructive' });
        });
    }, 200);
  };

  const progressLine =
    amgProgress && amgProgress.total > 0
      ? `${amgProgress.phase} ${amgProgress.current}/${amgProgress.total}`
      : '';

  const posStyle = pos
    ? { left: pos.x, top: pos.y }
    : { right: 16, top: 320 };

  return (
    <div
      className="absolute z-30 w-72 rounded-lg border bg-card shadow-lg"
      style={{ background: 'var(--annotix-bg, #fff)', ...posStyle }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2 cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="h-4 w-4" style={{ color: '#7c3aed' }} />
          {t('sam.panel.title')}
        </div>
        <button
          className="rounded p-1 hover:bg-muted"
          onClick={() => setSamAssistActive(false)}
          aria-label="close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 p-3 text-xs">
        <button
          className="annotix-btn annotix-btn-primary w-full"
          disabled={generating || !projectId || !imageId}
          onClick={handleGenerate}
        >
          {generating ? t('sam.panel.progress') : t('sam.panel.generate')}
        </button>

        {generating && progressLine && (
          <div
            className="rounded p-2 text-[11px] font-mono"
            style={{ background: 'var(--annotix-gray-light)' }}
          >
            {progressLine}
          </div>
        )}

        {encoding && (
          <div className="text-[11px]" style={{ color: 'var(--annotix-gray)' }}>
            {t('sam.panel.encoding')}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--annotix-gray)' }}>
            {candidates.length} {t('sam.panel.candidates')}
          </span>
          <button
            className="flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
            onClick={handleClear}
            disabled={candidates.length === 0}
          >
            <Trash2 className="h-3 w-3" />
            {t('sam.panel.clear')}
          </button>
        </div>

        <div className="space-y-1">
          <span style={{ color: 'var(--annotix-gray)' }}>
            {t('sam.panel.granularity')}
          </span>
          <div className="flex gap-1">
            {([0, 1, 2] as const).map((i) => (
              <button
                key={i}
                className="flex-1 rounded border py-1 transition-colors"
                style={{
                  background:
                    activeMaskIdx === i
                      ? 'rgba(124, 58, 237, 0.15)'
                      : 'transparent',
                  borderColor:
                    activeMaskIdx === i
                      ? 'rgba(124, 58, 237, 0.4)'
                      : 'var(--annotix-border)',
                  color:
                    activeMaskIdx === i ? '#7c3aed' : 'var(--annotix-dark)',
                }}
                onClick={() => setActiveMaskIdx(i)}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <SliderRow
          label={t('sam.panel.predIou')}
          value={filters.predIouMin}
          onChange={(v) => setFilters({ predIouMin: v })}
        />
        <SliderRow
          label={t('sam.panel.stability')}
          value={filters.stabilityMin}
          onChange={(v) => setFilters({ stabilityMin: v })}
        />
        <SliderRow
          label={t('sam.panel.overlap')}
          value={filters.overlapThresh}
          onChange={handleOverlapChange}
        />

        <button
          className="annotix-btn annotix-btn-outline w-full"
          onClick={() => setRefineMode(!refineMode)}
          style={
            refineMode
              ? {
                  background: 'rgba(124, 58, 237, 0.15)',
                  borderColor: 'rgba(124, 58, 237, 0.4)',
                  color: '#7c3aed',
                }
              : undefined
          }
        >
          {refineMode ? t('sam.panel.refineExit') : t('sam.panel.refine')}
        </button>

        {refineMode && (
          <div
            className="rounded p-2 text-[10px] leading-tight"
            style={{ background: 'var(--annotix-gray-light)' }}
          >
            {t('sam.panel.refineHelp')}
          </div>
        )}

        {refineRunning && (
          <div className="text-[11px]" style={{ color: 'var(--annotix-gray)' }}>
            {t('sam.panel.refineRunning')}
          </div>
        )}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--annotix-gray)' }}>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="annotix-range w-full"
      />
    </div>
  );
}
