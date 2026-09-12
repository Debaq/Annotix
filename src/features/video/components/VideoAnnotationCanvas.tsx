import { useEffect, useMemo } from 'react';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { AnnotationCanvas } from '../../canvas/components/AnnotationCanvas';
import { InterpolatedBBox, VideoTrack, ClassDefinition, Video } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoAnnotationBridge } from '../hooks/useVideoAnnotationBridge';
import { matchesShortcut } from '../../core/utils/matchShortcut';

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

  // Dimensiones de la imagen del frame actual (píxeles)
  const imageWidth = image?.width ?? 0;
  const imageHeight = image?.height ?? 0;

  const bridge = useVideoAnnotationBridge(
    interpolatedBBoxes,
    currentFrameIndex,
    imageWidth,
    imageHeight,
  );

  // Borrado de la caja seleccionada. Vive aquí porque este es el único punto
  // que conoce la selección del puente; el atajo global opera sobre las
  // anotaciones de la imagen, que en modo track no son las que se ven.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (!matchesShortcut(e, 'delete')) return;
      if (bridge.selectedAnnotationIds.size === 0) return;
      e.preventDefault();
      for (const id of bridge.selectedAnnotationIds) {
        void bridge.deleteAnnotation(id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bridge]);

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
