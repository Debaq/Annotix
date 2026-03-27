import { useState, useEffect, useRef, useCallback } from 'react';
import { audioService } from '../services/audioService';

interface UseAudioPlayerOptions {
  projectId: string | undefined;
  audioId: string | undefined;
}

interface UseAudioPlayerResult {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioBuffer: AudioBuffer | null;
  blobUrl: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  loading: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
}

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

export function useAudioPlayer({ projectId, audioId }: UseAudioPlayerOptions): UseAudioPlayerResult {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [blobUrl, setBlobUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [loading, setLoading] = useState(false);
  const rafRef = useRef<number>(0);

  // Load audio bytes via IPC, create blob URL and AudioBuffer
  useEffect(() => {
    if (!projectId || !audioId) {
      setBlobUrl('');
      setAudioBuffer(null);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      return;
    }

    let cancelled = false;

    const loadAudio = async () => {
      setLoading(true);
      try {
        const bytes = await audioService.getAudioData(projectId, audioId);
        if (cancelled) return;

        // Create blob URL for <audio> element
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });

        // Decode for waveform
        const buffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const decoded = await audioCtx.decodeAudioData(buffer);
        if (!cancelled) {
          setAudioBuffer(decoded);
          setDuration(decoded.duration);
        }
      } catch (err) {
        console.error('Failed to load audio:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
    };
  }, [projectId, audioId]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);

  // RAF loop for smooth cursor
  useEffect(() => {
    const update = () => {
      const el = audioRef.current;
      if (el && !el.paused) {
        setCurrentTime(el.currentTime);
        rafRef.current = requestAnimationFrame(update);
      }
    };

    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => {
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(update);
    };
    const onPause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
    };
    const onEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
    };
    const onDurationChange = () => {
      if (el.duration && isFinite(el.duration)) setDuration(el.duration);
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('durationchange', onDurationChange);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('durationchange', onDurationChange);
      cancelAnimationFrame(rafRef.current);
    };
  }, [blobUrl]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      el.play();
    } else {
      el.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
    setPlaybackRateState(rate);
  }, []);

  return {
    audioRef,
    audioBuffer,
    blobUrl,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    loading,
    togglePlay,
    seek,
    setPlaybackRate,
  };
}
