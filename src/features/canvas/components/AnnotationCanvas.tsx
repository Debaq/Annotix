import { useEffect, useRef, useCallback } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { CanvasToolbar } from './CanvasToolbar';
import { ZoomControls } from './ZoomControls';
import { AnnotationList } from './AnnotationList';
import { ImageNavigation } from '../../gallery/components/ImageNavigation';

export function AnnotationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { image } = useCurrentImage();
  const { setupCanvas, cleanup } = useCanvas(canvasRef);
  const { setZoom, setPan } = useCanvasTransform();

  useEffect(() => {
    if (!canvasRef.current || !image) return;

    setupCanvas(image);
    return cleanup;
  }, [image, setupCanvas, cleanup]);

  const handleFit = useCallback(() => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    if (rect.width > 0 && rect.height > 0) {
      const scaleX = rect.width / image.width;
      const scaleY = rect.height / image.height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // 90% fit
      
      const centerX = (rect.width - image.width * scale) / 2;
      const centerY = (rect.height - image.height * scale) / 2;
      
      setZoom(scale);
      setPan(centerX, centerY);
    }
  }, [image, setZoom, setPan]);

  if (!image) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <i className="fas fa-mouse-pointer text-6xl text-muted-foreground"></i>
          <p className="mt-4 text-muted-foreground">{t('common.selectImageToStart')}</p>
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
          <ZoomControls onFit={handleFit} />
        </div>
      </div>

      {/* Main canvas area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 bg-muted">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-crosshair"
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
