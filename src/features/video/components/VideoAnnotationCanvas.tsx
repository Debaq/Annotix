import { useEffect, useMemo } from 'react';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { AnnotationCanvas } from '../../canvas/components/AnnotationCanvas';
import { InterpolatedBBox, VideoTrack, ClassDefinition, Video } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoAnnotationBridge } from '../hooks/useVideoAnnotationBridge';
import { matchesShortcut } from '../../core/utils/matchShortcut';
import { useVideoNavigation } from '../hooks/useVideoNavigation';

interface VideoAnnotationCanvasProps {
  interpolatedBBoxes: InterpolatedBBox[];
  tracks: VideoTrack[];
  classes: ClassDefinition[];
  video: Video;
}

/**
 * Wrapper del canvas que:
 * - Renderiza el AnnotationCanvas existente para el frame actual
 * - Inyecta TODAS las bboxes (keyframes + interpoladas) como anotaciones editables via bridge
 * - Mover/redimensionar una bbox interpolada crea un keyframe en ese frame
 */
export function VideoAnnotationCanvas({
  interpolatedBBoxes,
  tracks: _tracks,
  classes: _classes,
  video,
}: VideoAnnotationCanvasProps) {
  const { currentFrameIndex } = useUIStore();
  const { image } = useCurrentImage();
  const { position, totalFrames, goToPosition, positionByFrameIndex } = useVideoNavigation();

  // Dimensiones de la imagen del frame actual (píxeles)
  const imageWidth = image?.width ?? 0;
  const imageHeight = image?.height ?? 0;

  const bridge = useVideoAnnotationBridge(
    interpolatedBBoxes,
    currentFrameIndex,
    imageWidth,
    imageHeight,
  );

  // `frameIndex` real del fotograma siguiente. Los keyframes se guardan por
  // `frameIndex`, no por posición, y los dos se separan en cuanto falta un
  // fotograma de la secuencia.
  const siguienteFrameIndex = useMemo(() => {
    for (const [frameIndex, pos] of positionByFrameIndex) {
      if (pos === position + 1) return frameIndex;
    }
    return null;
  }, [positionByFrameIndex, position]);

  // Atajos sobre la caja seleccionada. Viven aquí porque este es el único punto
  // que conoce la selección del puente; el atajo global opera sobre las
  // anotaciones de la imagen, que en modo track no son las que se ven.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (matchesShortcut(e, 'delete')) {
        if (bridge.selectedAnnotationIds.size === 0) return;
        e.preventDefault();
        for (const id of bridge.selectedAnnotationIds) {
          void bridge.deleteAnnotation(id);
        }
        return;
      }

      // Copiar la caja al fotograma siguiente y avanzar: anotar un objeto
      // quieto es esto repetido, y hacerlo redibujando la caja cada vez es lo
      // que empuja a poner dos keyframes lejanos y dejar que la interpolación
      // se invente el medio.
      if (matchesShortcut(e, 'video-propagate')) {
        if (siguienteFrameIndex === null || position + 1 >= totalFrames) return;
        e.preventDefault();
        void bridge.propagateToFrame(siguienteFrameIndex).then(() => {
          goToPosition(position + 1);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bridge, siguienteFrameIndex, position, totalFrames, goToPosition]);

  const videoFrameInfo = useMemo(() => ({
    frameIndex: currentFrameIndex,
    fps: video.fpsExtraction,
  }), [currentFrameIndex, video.fpsExtraction]);

  return (
    <div className="relative flex-1 h-full">
      <AnnotationCanvas overrideAnnotations={bridge} videoFrameInfo={videoFrameInfo} />
    </div>
  );
}
