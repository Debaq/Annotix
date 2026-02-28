import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { AnnotationCanvas } from '../../canvas/components/AnnotationCanvas';
import { InterpolatedBBox, VideoTrack, ClassDefinition } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoAnnotationBridge } from '../hooks/useVideoAnnotationBridge';

interface VideoAnnotationCanvasProps {
  interpolatedBBoxes: InterpolatedBBox[];
  tracks: VideoTrack[];
  classes: ClassDefinition[];
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

  return (
    <div className="relative flex-1 h-full">
      <AnnotationCanvas overrideAnnotations={bridge} />
    </div>
  );
}
