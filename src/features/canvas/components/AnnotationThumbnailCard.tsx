import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Annotation, BBoxData, MaskData, PolygonData, KeypointsData, LandmarksData, OBBData } from '@/lib/db';
import { cn } from '@/lib/utils';
import { skeletonPresets } from '../data/skeletonPresets';

interface AnnotationThumbnailCardProps {
  annotation: Annotation;
  image: HTMLImageElement;
  classColor: string;
  className: string;
  classShortcut?: string;
  isSelected: boolean;
  /** Si true, oculta el badge de tipo (todos son iguales) */
  hideTypeBadge?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export const AnnotationThumbnailCard: React.FC<AnnotationThumbnailCardProps> = ({
  annotation,
  image,
  classColor,
  className,
  classShortcut,
  isSelected,
  hideTypeBadge = false,
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

    const drawBorder = (offsetX: number, offsetY: number, drawWidth: number, drawHeight: number) => {
      ctx.strokeStyle = classColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(offsetX, offsetY, drawWidth, drawHeight);
    };

    const drawCroppedRegion = (cropX: number, cropY: number, cropWidth: number, cropHeight: number) => {
      const safeCropX = Math.max(0, cropX);
      const safeCropY = Math.max(0, cropY);
      const safeCropWidth = Math.max(1, Math.min(image.width - safeCropX, cropWidth));
      const safeCropHeight = Math.max(1, Math.min(image.height - safeCropY, cropHeight));

      const { drawWidth, drawHeight, offsetX, offsetY } = fitRegion(safeCropWidth, safeCropHeight);

      ctx.drawImage(
        image,
        safeCropX, safeCropY, safeCropWidth, safeCropHeight,
        offsetX, offsetY, drawWidth, drawHeight
      );

      return {
        cropX: safeCropX,
        cropY: safeCropY,
        cropWidth: safeCropWidth,
        cropHeight: safeCropHeight,
        drawWidth,
        drawHeight,
        offsetX,
        offsetY,
        scaleX: drawWidth / safeCropWidth,
        scaleY: drawHeight / safeCropHeight,
      };
    };

    // Draw annotation based on type
    if (annotation.type === 'bbox') {
      const bbox = annotation.data as BBoxData;
      const region = drawCroppedRegion(bbox.x, bbox.y, bbox.width, bbox.height);
      drawBorder(region.offsetX, region.offsetY, region.drawWidth, region.drawHeight);

    } else if (annotation.type === 'mask' && maskImage) {
      const { drawWidth, drawHeight, offsetX, offsetY } = fitRegion(image.width, image.height);

      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = classColor + '80';

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = maskImage.width;
      tempCanvas.height = maskImage.height;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        tempCtx.drawImage(maskImage, 0, 0);
        ctx.drawImage(tempCanvas, offsetX, offsetY, drawWidth, drawHeight);
      }

      ctx.globalCompositeOperation = 'source-over';
      drawBorder(offsetX, offsetY, drawWidth, drawHeight);

    } else if (annotation.type === 'polygon') {
      const polygonData = annotation.data as PolygonData;

      if (polygonData.points.length > 0) {
        const xs = polygonData.points.map(p => p.x);
        const ys = polygonData.points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const bboxWidth = Math.max(1, maxX - minX);
        const bboxHeight = Math.max(1, maxY - minY);
        const padding = 10;
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropWidth = Math.min(image.width - cropX, bboxWidth + padding * 2);
        const cropHeight = Math.min(image.height - cropY, bboxHeight + padding * 2);

        const region = drawCroppedRegion(cropX, cropY, cropWidth, cropHeight);

        ctx.beginPath();
        polygonData.points.forEach((point, index) => {
          const x = (point.x - region.cropX) * region.scaleX + region.offsetX;
          const y = (point.y - region.cropY) * region.scaleY + region.offsetY;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.closePath();

        ctx.fillStyle = classColor + '40';
        ctx.fill();

        ctx.strokeStyle = classColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        drawBorder(region.offsetX, region.offsetY, region.drawWidth, region.drawHeight);
      }
    } else if (annotation.type === 'keypoints') {
      const keypointsData = annotation.data as KeypointsData;
      const visiblePoints = keypointsData.points.filter((point) => point.visible);

      if (visiblePoints.length > 0) {
        const xs = visiblePoints.map(point => point.x);
        const ys = visiblePoints.map(point => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const bboxWidth = Math.max(1, maxX - minX);
        const bboxHeight = Math.max(1, maxY - minY);
        const padding = 12;

        const region = drawCroppedRegion(
          minX - padding,
          minY - padding,
          bboxWidth + padding * 2,
          bboxHeight + padding * 2
        );

        const preset = skeletonPresets[keypointsData.skeletonType];
        if (preset) {
          preset.connections.forEach(([startIdx, endIdx]) => {
            const start = keypointsData.points[startIdx];
            const end = keypointsData.points[endIdx];

            if (!start || !end || !start.visible || !end.visible) {
              return;
            }

            ctx.beginPath();
            ctx.moveTo(
              (start.x - region.cropX) * region.scaleX + region.offsetX,
              (start.y - region.cropY) * region.scaleY + region.offsetY
            );
            ctx.lineTo(
              (end.x - region.cropX) * region.scaleX + region.offsetX,
              (end.y - region.cropY) * region.scaleY + region.offsetY
            );
            ctx.strokeStyle = classColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          });
        }

        visiblePoints.forEach((point) => {
          const px = (point.x - region.cropX) * region.scaleX + region.offsetX;
          const py = (point.y - region.cropY) * region.scaleY + region.offsetY;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = classColor;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        drawBorder(region.offsetX, region.offsetY, region.drawWidth, region.drawHeight);
      }
    } else if (annotation.type === 'landmarks') {
      const landmarksData = annotation.data as LandmarksData;

      if (landmarksData.points.length > 0) {
        const xs = landmarksData.points.map(point => point.x);
        const ys = landmarksData.points.map(point => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const bboxWidth = Math.max(1, maxX - minX);
        const bboxHeight = Math.max(1, maxY - minY);
        const padding = 12;

        const region = drawCroppedRegion(
          minX - padding,
          minY - padding,
          bboxWidth + padding * 2,
          bboxHeight + padding * 2
        );

        landmarksData.points.forEach((point) => {
          const px = (point.x - region.cropX) * region.scaleX + region.offsetX;
          const py = (point.y - region.cropY) * region.scaleY + region.offsetY;
          ctx.beginPath();
          ctx.arc(px, py, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = classColor;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        drawBorder(region.offsetX, region.offsetY, region.drawWidth, region.drawHeight);
      }
    } else if (annotation.type === 'obb') {
      const obbData = annotation.data as OBBData;
      const halfWidth = obbData.width / 2;
      const halfHeight = obbData.height / 2;
      const angle = (obbData.rotation * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const corners = [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
      ].map((corner) => ({
        x: obbData.x + corner.x * cos - corner.y * sin,
        y: obbData.y + corner.x * sin + corner.y * cos,
      }));

      const xs = corners.map(point => point.x);
      const ys = corners.map(point => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const bboxWidth = Math.max(1, maxX - minX);
      const bboxHeight = Math.max(1, maxY - minY);
      const padding = 10;

      const region = drawCroppedRegion(
        minX - padding,
        minY - padding,
        bboxWidth + padding * 2,
        bboxHeight + padding * 2
      );

      const centerX = (obbData.x - region.cropX) * region.scaleX + region.offsetX;
      const centerY = (obbData.y - region.cropY) * region.scaleY + region.offsetY;
      const rectWidth = obbData.width * region.scaleX;
      const rectHeight = obbData.height * region.scaleY;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.fillStyle = classColor + '40';
      ctx.fillRect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
      ctx.strokeStyle = classColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight);
      ctx.restore();

      drawBorder(region.offsetX, region.offsetY, region.drawWidth, region.drawHeight);
    }

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

        {/* Overlay: badges en bordes superior e inferior */}
        <div className="annotix-annotation-overlay">
          <div>
            <span
              className="annotix-annotation-class-label"
              style={{ backgroundColor: classColor }}
            >
              {className}
            </span>
            {!hideTypeBadge && (
              <span className="annotix-annotation-type-badge">
                {getTypeLabel(annotation.type)}
              </span>
            )}
          </div>
          <div>
            {annotation.source === 'ai' && annotation.confidence != null && (
              <span className="annotix-annotation-ai-badge">
                AI {Math.round(annotation.confidence * 100)}%
              </span>
            )}
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
