import { useEffect, useRef } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { CanvasToolbar } from './CanvasToolbar';
import { ZoomControls } from './ZoomControls';
import { AnnotationList } from './AnnotationList';
import { ImageNavigation } from '../../gallery/components/ImageNavigation';

export function AnnotationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { image } = useCurrentImage();
  const { setupCanvas, cleanup } = useCanvas(canvasRef);

  useEffect(() => {
    if (!canvasRef.current || !image) return;

    setupCanvas(image);
    return cleanup;
  }, [image, setupCanvas, cleanup]);

  if (!image) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <i className="fas fa-mouse-pointer text-6xl text-muted-foreground"></i>
          <p className="mt-4 text-muted-foreground">Select an image to start annotating</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between border-b bg-card p-4">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold">{image.name}</h2>
          <span className="text-sm text-muted-foreground">
            {image.width} × {image.height}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ImageNavigation />
          <ZoomControls />
        </div>
      </div>

      {/* Main canvas area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 bg-muted">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 cursor-crosshair"
            style={{ touchAction: 'none' }}
          />
          <CanvasToolbar />
        </div>

        {/* Annotation list sidebar */}
        <div className="w-80 border-l bg-card">
          <AnnotationList />
        </div>
      </div>
    </div>
  );
}
