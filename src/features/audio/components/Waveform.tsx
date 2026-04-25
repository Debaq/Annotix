import { useRef, useEffect, useCallback, useState } from 'react';
import * as tauriDb from '@/lib/tauriDb';

interface WaveformProps {
  audioBuffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  /** For SED: regions to display on the waveform */
  regions?: { id: string; startMs: number; endMs: number; color: string }[];
  /** For SED: callback when user drags to create a region */
  onRegionCreate?: (startMs: number, endMs: number) => void;
  height?: number;
  /** Edit mode: selected range overlay */
  editSelection?: { startMs: number; endMs: number } | null;
  /** Edit mode: split point line */
  editSplitPoint?: number | null;
  /** Callback when user drags to create/change edit selection */
  onEditSelectionChange?: (startMs: number, endMs: number) => void;
  /** Callback when user clicks to set split point */
  onEditSplitPointChange?: (ms: number) => void;
}

export function Waveform({
  audioBuffer,
  currentTime,
  duration,
  onSeek,
  regions,
  onRegionCreate,
  height = 120,
  editSelection,
  editSplitPoint,
  onEditSelectionChange,
  onEditSplitPointChange,
}: WaveformProps) {
  const isEditRangeMode = !!onEditSelectionChange;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const peaksRef = useRef<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const dragEndRef = useRef<number | null>(null);

  // Compute peaks from audio buffer (Rust-accelerated)
  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.parentElement?.clientWidth || 800;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    let cancelled = false;
    const channelData = audioBuffer.getChannelData(0);
    tauriDb.computeAudioPeaks(channelData, width).then((peaks) => {
      if (!cancelled) peaksRef.current = peaks;
    });

    return () => { cancelled = true; };
  }, [audioBuffer, height]);

  // Resolve CSS variable to actual color for canvas
  const resolveColor = useCallback((varName: string, fallback: string) => {
    const el = containerRef.current;
    if (!el) return fallback;
    const val = getComputedStyle(el).getPropertyValue(varName).trim();
    return val || fallback;
  }, []);

  // Draw waveform + cursor + regions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio;
    const w = canvas.width;
    const h = canvas.height;
    const peaks = peaksRef.current;
    const pixelWidth = w / dpr;

    const primaryColor = resolveColor('--annotix-primary', '#6366f1');
    const darkColor = resolveColor('--annotix-dark', '#1e293b');
    const grayColor = resolveColor('--annotix-gray', '#94a3b8');

    ctx.clearRect(0, 0, w, h);

    // Draw regions
    if (regions) {
      for (const region of regions) {
        const x1 = (region.startMs / 1000 / duration) * w;
        const x2 = (region.endMs / 1000 / duration) * w;
        ctx.fillStyle = region.color + '40';
        ctx.fillRect(x1, 0, x2 - x1, h);
        ctx.strokeStyle = region.color;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x1, 0, x2 - x1, h);
      }
    }

    // Draw edit selection overlay (stable, from props)
    const showEditSelection = editSelection && !(isDragging && isEditRangeMode) && duration > 0;
    if (showEditSelection && editSelection) {
      const ex1 = (editSelection.startMs / 1000 / duration) * w;
      const ex2 = (editSelection.endMs / 1000 / duration) * w;
      ctx.fillStyle = '#f59e0b40';
      ctx.fillRect(ex1, 0, ex2 - ex1, h);
      // Edge lines
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(ex1, 0); ctx.lineTo(ex1, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex2, 0); ctx.lineTo(ex2, h); ctx.stroke();
      // Handle squares
      ctx.fillStyle = '#f59e0b';
      const hs = 5 * dpr;
      ctx.fillRect(ex1 - hs / 2, h / 2 - hs, hs, hs * 2);
      ctx.fillRect(ex2 - hs / 2, h / 2 - hs, hs, hs * 2);
    }

    // Draw edit split point
    if (editSplitPoint != null && duration > 0) {
      const sx = (editSplitPoint / 1000 / duration) * w;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
      ctx.setLineDash([]);
      // Triangle marker
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(sx - 6 * dpr, 0);
      ctx.lineTo(sx + 6 * dpr, 0);
      ctx.lineTo(sx, 8 * dpr);
      ctx.closePath();
      ctx.fill();
    }

    // Draw drag preview
    if (isDragging && dragStartRef.current !== null && dragEndRef.current !== null) {
      const x1 = Math.min(dragStartRef.current, dragEndRef.current) * dpr;
      const x2 = Math.max(dragStartRef.current, dragEndRef.current) * dpr;
      const dragColor = isEditRangeMode ? '#f59e0b' : primaryColor;
      ctx.fillStyle = dragColor + '33';
      ctx.fillRect(x1, 0, x2 - x1, h);
      ctx.strokeStyle = dragColor + '99';
      ctx.lineWidth = dpr;
      ctx.strokeRect(x1, 0, x2 - x1, h);
    }

    // Draw waveform bars
    if (peaks.length > 0) {
      const cursorX = duration > 0 ? (currentTime / duration) * pixelWidth : 0;

      for (let i = 0; i < peaks.length; i++) {
        const barHeight = peaks[i] * h * 0.9;
        const x = i * dpr;
        const y = (h - barHeight) / 2;

        ctx.fillStyle = i < cursorX ? primaryColor : darkColor + '40';
        ctx.fillRect(x, y, Math.max(dpr * 0.8, 1), barHeight);
      }

      // Draw cursor line
      if (duration > 0) {
        const cx = cursorX * dpr;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();
      }
    } else {
      // No data - draw placeholder
      ctx.fillStyle = grayColor + '60';
      const midY = h / 2;
      ctx.fillRect(0, midY - dpr, w, 2 * dpr);
    }
  }, [currentTime, duration, isDragging, regions, resolveColor, editSelection, editSplitPoint, isEditRangeMode]);

  const getTimeFromX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  const getPixelX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(clientX - rect.left, rect.width));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (onEditSelectionChange) {
      // Edit range mode: drag to select
      setIsDragging(true);
      const px = getPixelX(e.clientX);
      dragStartRef.current = px;
      dragEndRef.current = px;
    } else if (onEditSplitPointChange) {
      // Edit point mode: click to set
      const time = getTimeFromX(e.clientX);
      onEditSplitPointChange(Math.round(time * 1000));
    } else if (onRegionCreate) {
      // SED mode: start drag to create region
      setIsDragging(true);
      const px = getPixelX(e.clientX);
      dragStartRef.current = px;
      dragEndRef.current = px;
    } else {
      // Normal mode: seek
      onSeek(getTimeFromX(e.clientX));
    }
  }, [onEditSelectionChange, onEditSplitPointChange, onRegionCreate, onSeek, getTimeFromX, getPixelX]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && (onEditSelectionChange || onRegionCreate)) {
      dragEndRef.current = getPixelX(e.clientX);
    }
  }, [isDragging, onEditSelectionChange, onRegionCreate, getPixelX]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDragging && onEditSelectionChange && dragStartRef.current !== null) {
      const endPx = getPixelX(e.clientX);
      const canvas = canvasRef.current;
      if (canvas && duration > 0) {
        const rect = canvas.getBoundingClientRect();
        const startMs = Math.round((Math.min(dragStartRef.current, endPx) / rect.width) * duration * 1000);
        const endMs = Math.round((Math.max(dragStartRef.current, endPx) / rect.width) * duration * 1000);
        if (endMs - startMs > 50) {
          onEditSelectionChange(startMs, endMs);
        }
      }
    } else if (isDragging && onRegionCreate && dragStartRef.current !== null) {
      const endPx = getPixelX(e.clientX);
      const canvas = canvasRef.current;
      if (canvas && duration > 0) {
        const rect = canvas.getBoundingClientRect();
        const startMs = Math.round((Math.min(dragStartRef.current, endPx) / rect.width) * duration * 1000);
        const endMs = Math.round((Math.max(dragStartRef.current, endPx) / rect.width) * duration * 1000);
        if (endMs - startMs > 50) {
          onRegionCreate(startMs, endMs);
        }
      }
    } else if (isDragging && !onRegionCreate && !onEditSelectionChange) {
      onSeek(getTimeFromX(e.clientX));
    }
    setIsDragging(false);
    dragStartRef.current = null;
    dragEndRef.current = null;
  }, [isDragging, onEditSelectionChange, onRegionCreate, duration, getPixelX, getTimeFromX, onSeek]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !audioBuffer) return;

    const obs = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = container.clientWidth;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Recompute peaks via Rust
      const channelData = audioBuffer.getChannelData(0);
      tauriDb.computeAudioPeaks(channelData, width).then((peaks) => {
        peaksRef.current = peaks;
      });
    });

    obs.observe(container);
    return () => obs.disconnect();
  }, [audioBuffer, height]);

  return (
    <div
      ref={containerRef}
      className="w-full relative rounded-lg overflow-hidden bg-[var(--annotix-light)]"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${
          onEditSelectionChange ? 'cursor-crosshair'
            : onEditSplitPointChange ? 'cursor-col-resize'
            : onRegionCreate ? 'cursor-crosshair'
            : 'cursor-pointer'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDragging) {
            setIsDragging(false);
            dragStartRef.current = null;
            dragEndRef.current = null;
          }
        }}
      />
    </div>
  );
}
