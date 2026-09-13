import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { AnnotationCanvas } from '../../canvas/components/AnnotationCanvas';
import { InterpolatedBBox, VideoTrack, ClassDefinition, Video } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoAnnotationBridge } from '../hooks/useVideoAnnotationBridge';
import { matchesShortcut } from '../../core/utils/matchShortcut';
import { useVideoNavigation } from '../hooks/useVideoNavigation';
import { Button } from '@/components/ui/button';
import * as tauriDb from '@/lib/tauriDb';

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
  const { t } = useTranslation();
  const { currentFrameIndex, currentProjectId } = useUIStore();
  const { image } = useCurrentImage();
  const [guardandoFondo, setGuardandoFondo] = useState(false);
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

  // Marca este fotograma como fondo: una imagen sin objetos a propósito, que
  // entra al entrenamiento como negativo en vez de quedar descartada.
  const marcarFondo = useCallback(async (esFondo: boolean) => {
    if (!currentProjectId || !image?.id) return;
    setGuardandoFondo(true);
    try {
      await tauriDb.setImageBackground(currentProjectId, image.id, esFondo);
    } finally {
      setGuardandoFondo(false);
      bridge.descartarAvisoFondo();
    }
  }, [currentProjectId, image?.id, bridge]);

  const videoFrameInfo = useMemo(() => ({
    frameIndex: currentFrameIndex,
    fps: video.fpsExtraction,
  }), [currentFrameIndex, video.fpsExtraction]);

  const preguntarFondo = bridge.frameVaciado === currentFrameIndex && !image?.isBackground;

  return (
    <div className="relative flex-1 h-full">
      <AnnotationCanvas overrideAnnotations={bridge} videoFrameInfo={videoFrameInfo} />

      {/* Se acaba de quedar sin cajas: es el único momento en que se sabe si el
          fotograma está vacío porque no hay nada o porque falta anotarlo, y
          solo el anotador puede decirlo. */}
      {preguntarFondo && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] px-3 py-2 shadow-lg">
          <p className="text-xs font-medium">{t('video.emptyFrameTitle')}</p>
          <p className="mt-0.5 max-w-xs text-[11px] text-muted-foreground">
            {t('video.emptyFrameDesc')}
          </p>
          <div className="mt-2 flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 flex-1 text-[11px]"
              disabled={guardandoFondo}
              onClick={() => bridge.descartarAvisoFondo()}
            >
              {t('video.emptyFrameNo')}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-6 flex-1 text-[11px]"
              disabled={guardandoFondo}
              onClick={() => void marcarFondo(true)}
            >
              {t('video.emptyFrameYes')}
            </Button>
          </div>
        </div>
      )}

      {/* Ya marcado: se ve y se puede deshacer sin buscar dónde. */}
      {image?.isBackground && (
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--annotix-border)] bg-[var(--annotix-white)] px-3 py-1 shadow-lg">
          <i className="fas fa-image text-[11px] opacity-70"></i>
          <span className="text-[11px] font-medium">{t('video.markedBackground')}</span>
          <button
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
            disabled={guardandoFondo}
            onClick={() => void marcarFondo(false)}
          >
            {t('video.unmarkBackground')}
          </button>
        </div>
      )}
    </div>
  );
}
