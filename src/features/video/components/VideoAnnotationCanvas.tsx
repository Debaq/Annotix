import { useMemo } from 'react';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { AnnotationCanvas } from '../../canvas/components/AnnotationCanvas';
import { InterpolatedBBox, VideoTrack, ClassDefinition, Video } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoAnnotationBridge } from '../hooks/useVideoAnnotationBridge';

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
  tracks,
  classes,
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
