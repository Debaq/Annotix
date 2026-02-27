import { useCallback, useEffect } from 'react';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoFrames } from './useVideoFrames';

export function useVideoNavigation() {
  const { currentFrameIndex, setCurrentFrameIndex, setCurrentImageId } = useUIStore();
  const { frames } = useVideoFrames();

  const totalFrames = frames.length;
  const canPrev = currentFrameIndex > 0;
  const canNext = currentFrameIndex < totalFrames - 1;

  const goToFrame = useCallback((index: number) => {
    if (index >= 0 && index < totalFrames) {
      setCurrentFrameIndex(index);
      // Also set the current image ID for the canvas
      const frame = frames[index];
      if (frame?.id) {
        setCurrentImageId(frame.id);
      }
    }
  }, [totalFrames, frames, setCurrentFrameIndex, setCurrentImageId]);

  const goPrev = useCallback(() => {
    if (canPrev) goToFrame(currentFrameIndex - 1);
  }, [canPrev, currentFrameIndex, goToFrame]);

  const goNext = useCallback(() => {
    if (canNext) goToFrame(currentFrameIndex + 1);
  }, [canNext, currentFrameIndex, goToFrame]);

  // Set initial frame image
  useEffect(() => {
    if (frames.length > 0 && currentFrameIndex < frames.length) {
      const frame = frames[currentFrameIndex];
      if (frame?.id) {
        setCurrentImageId(frame.id);
      }
    }
  }, [frames, currentFrameIndex, setCurrentImageId]);

  return {
    currentFrameIndex,
    totalFrames,
    canPrev,
    canNext,
    goToFrame,
    goPrev,
    goNext,
    currentFrame: frames[currentFrameIndex] || null,
  };
}
