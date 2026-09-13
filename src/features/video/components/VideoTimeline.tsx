import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoNavigation } from '../hooks/useVideoNavigation';
import { VideoTrack } from '@/lib/db';
import { cn } from '@/lib/utils';

const SPEEDS = [1, 2, 4, 8] as const;
const BASE_INTERVAL = 200; // ms (~5 fps a 1x)

interface VideoTimelineProps {
  tracks: VideoTrack[];
  classes: { id: number; color: string; name?: string }[];
  selectedTrackId?: string | null;
  onSelectTrack?: (trackId: string | null) => void;
}

export function VideoTimeline({
  tracks,
  classes,
  selectedTrackId = null,
  onSelectTrack,
}: VideoTimelineProps) {
  const { t } = useTranslation();
  const {
    currentFrameIndex,
    position,
    totalFrames,
    goToPosition,
    positionByFrameIndex,
    goPrev,
    goNext,
    canPrev,
    canNext,
  } = useVideoNavigation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Play/Pause
  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed(prev => {
      const idx = SPEEDS.indexOf(prev as (typeof SPEEDS)[number]);
      return SPEEDS[(idx + 1) % SPEEDS.length];
    });
  }, []);

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        goNext();
      }, BASE_INTERVAL / speed);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, speed, goNext]);

  // Stop playing when reaching end
  useEffect(() => {
    if (isPlaying && position >= totalFrames - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, position, totalFrames]);

  // Scrubber drag
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current || totalFrames === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    goToPosition(Math.round(ratio * (totalFrames - 1)));
  }, [totalFrames, goToPosition]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    handleTrackClick(e);
  }, [handleTrackClick]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      if (!trackRef.current || totalFrames === 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      goToPosition(Math.round(ratio * (totalFrames - 1)));
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, totalFrames, goToPosition]);

  // Rombos de keyframe. Los keyframes guardan el `frameIndex` real, así que hay
  // que traducirlo a posición para colocarlos sobre la barra.
  const keyframeIndicators = tracks.flatMap(track => {
    const classColor = classes.find(c => c.id === track.classId)?.color || '#888';
    return track.keyframes
      .filter(kf => kf.isKeyframe)
      .map(kf => ({
        position: positionByFrameIndex.get(kf.frameIndex),
        color: classColor,
      }))
      .filter((kf): kf is { position: number; color: string } => kf.position !== undefined);
  });

  const scrubberPosition = totalFrames > 1
    ? (position / (totalFrames - 1)) * 100
    : 0;

  const porcentaje = (pos: number) => (totalFrames > 1 ? (pos / (totalFrames - 1)) * 100 : 0);

  // Una pista por track: su extensión temporal y sus keyframes. Es lo que la lista
  // del panel no podía mostrar —cuándo existe cada track— y la razón de que fuera
  // un listado poco útil.
  const pistas = tracks
    .filter(track => track.enabled && track.keyframes.length > 0)
    .map(track => {
      const color = classes.find(c => c.id === track.classId)?.color || '#888';
      const posiciones = track.keyframes
        .map(kf => ({
          pos: positionByFrameIndex.get(kf.frameIndex),
          esKeyframe: kf.isKeyframe,
          frameIndex: kf.frameIndex,
        }))
        .filter((kf): kf is { pos: number; esKeyframe: boolean; frameIndex: number } => kf.pos !== undefined);
      if (posiciones.length === 0) return null;
      const desde = Math.min(...posiciones.map(p => p.pos));
      const hasta = Math.max(...posiciones.map(p => p.pos));
      return { track, color, posiciones, desde, hasta };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="bg-[var(--annotix-dark)] text-white px-3 py-2 select-none">
      {/* Controls row */}
      <div className="flex items-center gap-3 mb-2">
        {/* Play controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            disabled={!canPrev}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30"
          >
            <i className="fas fa-step-backward text-xs"></i>
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
          >
            <i className={cn("fas", isPlaying ? "fa-pause" : "fa-play", "text-sm")}></i>
          </button>
          <button
            onClick={goNext}
            disabled={!canNext}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30"
          >
            <i className="fas fa-step-forward text-xs"></i>
          </button>
        </div>

        {/* Speed control */}
        <button
          onClick={cycleSpeed}
          className={cn(
            "px-2 h-7 rounded text-[11px] font-bold tabular-nums transition-colors",
            speed > 1 ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/60"
          )}
        >
          {speed}x
        </button>

        {/* Frame counter */}
        <div className="text-xs font-mono tabular-nums">
          {t('video.frame', 'Frame')} {position + 1} / {totalFrames}
          {currentFrameIndex !== position && (
            <span className="ml-1 opacity-60">(#{currentFrameIndex})</span>
          )}
        </div>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-6 bg-white/10 rounded cursor-pointer"
        onMouseDown={handleMouseDown}
      >
        {/* Keyframe indicators */}
        {keyframeIndicators.map((kf, i) => {
          const pos = totalFrames > 1 ? (kf.position / (totalFrames - 1)) * 100 : 0;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rotate-45"
              style={{
                left: `${pos}%`,
                backgroundColor: kf.color,
                marginLeft: '-4px',
              }}
            />
          );
        })}

        {/* Scrubber */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white"
          style={{ left: `${scrubberPosition}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
        </div>
      </div>

      {/* Pistas por track. Altura acotada: con muchos tracks la zona hace scroll en
          vez de empujar el canvas. */}
      {pistas.length > 0 && (
        <div className="mt-1.5 max-h-24 space-y-1 overflow-y-auto pr-1">
          {pistas.map(({ track, color, posiciones, desde, hasta }) => {
            const seleccionado = selectedTrackId === track.id;
            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack?.(seleccionado ? null : track.id ?? null)}
                className={cn(
                  'relative h-3 cursor-pointer rounded bg-white/5 transition-colors',
                  seleccionado ? 'ring-1 ring-white/60' : 'hover:bg-white/10',
                )}
                title={track.label || `Track ${track.id}`}
              >
                {/* Extensión: del primer al último keyframe (lo interpolado incluido) */}
                <div
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded"
                  style={{
                    left: `${porcentaje(desde)}%`,
                    width: `${Math.max(porcentaje(hasta) - porcentaje(desde), 0.5)}%`,
                    backgroundColor: color,
                    opacity: seleccionado ? 0.9 : 0.45,
                  }}
                />
                {posiciones
                  .filter(p => p.esKeyframe)
                  .map(p => (
                    <button
                      key={p.frameIndex}
                      onClick={e => {
                        e.stopPropagation();
                        goToPosition(p.pos);
                      }}
                      className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 hover:scale-125 transition-transform"
                      style={{ left: `${porcentaje(p.pos)}%`, marginLeft: '-4px', backgroundColor: color }}
                      title={`#${p.frameIndex}`}
                    />
                  ))}
                {/* Posición actual sobre la pista */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-white/70"
                  style={{ left: `${scrubberPosition}%` }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
