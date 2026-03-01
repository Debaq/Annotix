import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoNavigation } from '../hooks/useVideoNavigation';
import { VideoTrack } from '@/lib/db';
import { cn } from '@/lib/utils';

interface VideoTimelineProps {
  tracks: VideoTrack[];
  classes: { id: number; color: string }[];
}

export function VideoTimeline({ tracks, classes }: VideoTimelineProps) {
  const { t } = useTranslation();
  const { currentFrameIndex, totalFrames, goToFrame, goPrev, goNext, canPrev, canNext } = useVideoNavigation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SPEEDS = [1, 2, 4, 8] as const;
  const BASE_INTERVAL = 200; // ms (~5 fps a 1x)

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
    if (isPlaying && currentFrameIndex >= totalFrames - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentFrameIndex, totalFrames]);

  // Scrubber drag
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current || totalFrames === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const frame = Math.round(ratio * (totalFrames - 1));
    goToFrame(frame);
  }, [totalFrames, goToFrame]);

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
      const frame = Math.round(ratio * (totalFrames - 1));
      goToFrame(frame);
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, totalFrames, goToFrame]);

  // Get keyframe positions for indicators
  const keyframeIndicators = tracks.flatMap(track => {
    const classColor = classes.find(c => c.id === track.classId)?.color || '#888';
    return track.keyframes
      .filter(kf => kf.isKeyframe)
      .map(kf => ({
        frameIndex: kf.frameIndex,
        color: classColor,
      }));
  });

  const scrubberPosition = totalFrames > 1
    ? (currentFrameIndex / (totalFrames - 1)) * 100
    : 0;

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
          {t('video.frame', 'Frame')} {currentFrameIndex + 1} / {totalFrames}
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
          const pos = totalFrames > 1 ? (kf.frameIndex / (totalFrames - 1)) * 100 : 0;
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
    </div>
  );
}
