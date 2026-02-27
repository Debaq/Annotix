import { useEffect, useCallback, useRef, useState } from 'react';
import { AnnotationCanvas } from '../../canvas/components/AnnotationCanvas';
import { InterpolatedBBox, VideoTrack, ClassDefinition } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useVideoTracks } from '../hooks/useVideoTracks';

interface VideoAnnotationCanvasProps {
  interpolatedBBoxes: InterpolatedBBox[];
  tracks: VideoTrack[];
  classes: ClassDefinition[];
}

/**
 * Wrapper del canvas que:
 * - Renderiza el AnnotationCanvas existente para el frame actual
 * - Intercepta creación de anotaciones para convertirlas en keyframes
 * - Superpone bboxes interpoladas como overlay visual
 */
export function VideoAnnotationCanvas({
  interpolatedBBoxes,
  tracks,
  classes,
}: VideoAnnotationCanvasProps) {
  const { currentFrameIndex, currentVideoId } = useUIStore();
  const { setKeyframe } = useVideoTracks();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Observe canvas container size for overlay positioning
  useEffect(() => {
    const container = overlayRef.current?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Intercept annotation creation events to create keyframes
  useEffect(() => {
    if (!currentVideoId) return;

    const handleAnnotationCreated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { type, data } = customEvent.detail;

      if (type !== 'bbox') return; // Only handle bbox for video tracks

      // Find if there's a selected track to add to, or auto-create
      // For now, let the default behavior create normal annotations
      // The user can use the track panel to manage keyframes
    };

    window.addEventListener('annotix:annotation-created', handleAnnotationCreated);
    return () => window.removeEventListener('annotix:annotation-created', handleAnnotationCreated);
  }, [currentVideoId, currentFrameIndex, setKeyframe]);

  // Non-keyframe interpolated bboxes (visual overlay)
  const nonKeyframeBBoxes = interpolatedBBoxes.filter(b => !b.isKeyframe && b.enabled);

  return (
    <div className="relative flex-1 h-full">
      {/* Actual canvas */}
      <AnnotationCanvas />

      {/* Interpolated bboxes overlay */}
      {nonKeyframeBBoxes.length > 0 && (
        <div
          ref={overlayRef}
          className="absolute inset-0 pointer-events-none z-10"
          style={{ overflow: 'hidden' }}
        >
          <svg width="100%" height="100%" className="absolute inset-0">
            {nonKeyframeBBoxes.map((bbox, i) => {
              const color = classes.find(c => c.id === bbox.classId)?.color || '#888';
              return (
                <g key={`${bbox.trackUuid}-${i}`} opacity={0.5}>
                  <rect
                    x={`${bbox.bbox.x}%`}
                    y={`${bbox.bbox.y}%`}
                    width={`${bbox.bbox.width}%`}
                    height={`${bbox.bbox.height}%`}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
