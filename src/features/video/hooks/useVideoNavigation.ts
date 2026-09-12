import { useCallback, useEffect, useMemo } from 'react';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoFrames } from './useVideoFrames';

/**
 * Navegación por fotogramas de un video.
 *
 * Distingue dos índices que antes se confundían:
 *  - `position`: posición dentro del array de fotogramas cargados (0..n-1).
 *    Es lo que mueven los botones y la línea de tiempo.
 *  - `currentFrameIndex`: el `frameIndex` real del fotograma, asignado durante
 *    la extracción. Es lo que se guarda en los keyframes y lo que usa el bake.
 *
 * Coinciden solo si la secuencia está completa. Basta con borrar un fotograma
 * desde la galería, o con una extracción interrumpida, para que se separen: si
 * se navegara por posición, los keyframes acabarían aplicados a otro fotograma.
 */
export function useVideoNavigation() {
  const { currentFrameIndex, setCurrentFrameIndex, setCurrentImageId } = useUIStore();
  const { frames } = useVideoFrames();

  const totalFrames = frames.length;

  // frameIndex real → posición en el array
  const positionByFrameIndex = useMemo(() => {
    const map = new Map<number, number>();
    frames.forEach((frame, i) => {
      map.set(frame.frameIndex ?? i, i);
    });
    return map;
  }, [frames]);

  const position = useMemo(() => {
    const exact = positionByFrameIndex.get(currentFrameIndex);
    if (exact !== undefined) return exact;
    // El fotograma actual ya no está (borrado, o aún no cargado): la posición
    // más cercana mantiene la navegación utilizable en vez de saltar al inicio.
    let best = 0;
    let bestDist = Infinity;
    frames.forEach((frame, i) => {
      const dist = Math.abs((frame.frameIndex ?? i) - currentFrameIndex);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }, [positionByFrameIndex, frames, currentFrameIndex]);

  const canPrev = position > 0 && totalFrames > 0;
  const canNext = position < totalFrames - 1;

  /** Salta a una posición del array de fotogramas. */
  const goToPosition = useCallback((pos: number) => {
    if (pos < 0 || pos >= frames.length) return;
    const frame = frames[pos];
    if (!frame) return;
    setCurrentFrameIndex(frame.frameIndex ?? pos);
    if (frame.id) setCurrentImageId(frame.id);
  }, [frames, setCurrentFrameIndex, setCurrentImageId]);

  /** Salta al fotograma con este `frameIndex` real, si existe. */
  const goToFrameIndex = useCallback((frameIndex: number) => {
    const pos = positionByFrameIndex.get(frameIndex);
    if (pos === undefined) return;
    goToPosition(pos);
  }, [positionByFrameIndex, goToPosition]);

  const goPrev = useCallback(() => {
    if (canPrev) goToPosition(position - 1);
  }, [canPrev, position, goToPosition]);

  const goNext = useCallback(() => {
    if (canNext) goToPosition(position + 1);
  }, [canNext, position, goToPosition]);

  // Sincronizar la imagen del lienzo con el fotograma actual
  useEffect(() => {
    const frame = frames[position];
    if (frame?.id) setCurrentImageId(frame.id);
  }, [frames, position, setCurrentImageId]);

  return {
    /** `frameIndex` real del fotograma actual */
    currentFrameIndex,
    /** posición en el array de fotogramas */
    position,
    totalFrames,
    canPrev,
    canNext,
    goToPosition,
    goToFrameIndex,
    positionByFrameIndex,
    goPrev,
    goNext,
    currentFrame: frames[position] || null,
  };
}
