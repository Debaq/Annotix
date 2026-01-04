import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Annotation, BBoxData, MaskData, PolygonData } from '@/lib/db';
import { cn } from '@/lib/utils';

interface AnnotationThumbnailCardProps {
  annotation: Annotation;
  image: HTMLImageElement;
  classColor: string;
  className: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export const AnnotationThumbnailCard: React.FC<AnnotationThumbnailCardProps> = ({
  annotation,
  image,
  classColor,
  className,
  isSelected,
  onSelect,
  onDelete,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [maskImage, setMaskImage] = useState<HTMLImageElement | null>(null);

  // Load mask image if type is mask
  useEffect(() => {
    if (annotation.type === 'mask') {
      const maskData = annotation.data as MaskData;
      const img = new window.Image();
      img.onload = () => setMaskImage(img);
      img.src = maskData.base64png;
      return () => {
        setMaskImage(null);
      };
    }
  }, [annotation]);

  // Render thumbnail canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = 100;
    const canvasHeight = 75;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Helper function to fit region in canvas
    const fitRegion = (regionWidth: number, regionHeight: number) => {
      const regionAspect = regionWidth / regionHeight;
      const canvasAspect = canvasWidth / canvasHeight;

      let drawWidth, drawHeight, offsetX, offsetY;

      if (regionAspect > canvasAspect) {
        drawWidth = canvasWidth;
        drawHeight = canvasWidth / regionAspect;
        offsetX = 0;
        offsetY = (canvasHeight - drawHeight) / 2;
      } else {
        drawHeight = canvasHeight;
        drawWidth = canvasHeight * regionAspect;
        offsetX = (canvasWidth - drawWidth) / 2;
        offsetY = 0;
      }

      return { drawWidth, drawHeight, offsetX, offsetY };
    };

    // Draw annotation based on type
    if (annotation.type === 'bbox') {
      const bbox = annotation.data as BBoxData;
      const { drawWidth, drawHeight, offsetX, offsetY } = fitRegion(bbox.width, bbox.height);

      // Draw only the cropped region from the original image
      ctx.drawImage(
        image,
        bbox.x, bbox.y, bbox.width, bbox.height,
        offsetX, offsetY, drawWidth, drawHeight
      );

      // Draw border
      ctx.strokeStyle = classColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(offsetX, offsetY, drawWidth, drawHeight);

    } else if (annotation.type === 'mask' && maskImage) {
      // For mask, we need to find the bounding box of non-transparent pixels
      // For now, use the full image dimensions (can be optimized later)
      const { drawWidth, drawHeight, offsetX, offsetY } = fitRegion(image.width, image.height);

      // Draw cropped image
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

      // Draw mask overlay with class color
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = classColor + '80'; // Semi-transparent

      // Create temp canvas to draw mask
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = maskImage.width;
      tempCanvas.height = maskImage.height;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        tempCtx.drawImage(maskImage, 0, 0);
        ctx.drawImage(tempCanvas, offsetX, offsetY, drawWidth, drawHeight);
      }

      ctx.globalCompositeOperation = 'source-over';

      // Draw border
      ctx.strokeStyle = classColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(offsetX, offsetY, drawWidth, drawHeight);

    } else if (annotation.type === 'polygon') {
      const polygonData = annotation.data as PolygonData;

      if (polygonData.points.length > 0) {
        // Calculate bounding box of polygon
        const xs = polygonData.points.map(p => p.x);
        const ys = polygonData.points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const bboxWidth = maxX - minX;
        const bboxHeight = maxY - minY;

        // Add some padding
        const padding = 10;
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropWidth = Math.min(image.width - cropX, bboxWidth + padding * 2);
        const cropHeight = Math.min(image.height - cropY, bboxHeight + padding * 2);

        const { drawWidth, drawHeight, offsetX, offsetY } = fitRegion(cropWidth, cropHeight);

        // Draw cropped region
        ctx.drawImage(
          image,
          cropX, cropY, cropWidth, cropHeight,
          offsetX, offsetY, drawWidth, drawHeight
        );

        // Calculate scale for polygon points
        const scaleX = drawWidth / cropWidth;
        const scaleY = drawHeight / cropHeight;

        // Draw polygon overlay
        ctx.beginPath();
        polygonData.points.forEach((point, index) => {
          const x = (point.x - cropX) * scaleX + offsetX;
          const y = (point.y - cropY) * scaleY + offsetY;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.closePath();

        // Fill with semi-transparent color
        ctx.fillStyle = classColor + '40';
        ctx.fill();

        // Stroke with class color
        ctx.strokeStyle = classColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw border around thumbnail
        ctx.strokeStyle = classColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(offsetX, offsetY, drawWidth, drawHeight);
      }
    }
    // TODO: Add rendering for keypoints, landmarks, obb

  }, [annotation, image, classColor, maskImage]);

  // Get type label
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      bbox: 'BBox',
      mask: 'Mask',
      polygon: 'Poly',
      keypoints: 'Kpts',
      landmarks: 'Land',
      obb: 'OBB',
    };
    return labels[type] || type;
  };

  return (
    <div
      className={cn('annotix-annotation-card', isSelected && 'selected')}
      onClick={onSelect}
    >
      <div className="annotix-annotation-thumbnail">
        <canvas ref={canvasRef} />

        {/* Overlay with badges */}
        <div className="annotix-annotation-overlay">
          <div>
            <span
              className="annotix-annotation-class-label"
              style={{ backgroundColor: classColor }}
            >
              {className}
            </span>
            <span className="annotix-annotation-type-badge">
              {getTypeLabel(annotation.type)}
            </span>
          </div>
        </div>

        {/* Delete button */}
        <button
          className="annotix-annotation-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={t('annotations.delete')}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
    </div>
  );
};
