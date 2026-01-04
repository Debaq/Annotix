import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useAnnotations } from '../hooks/useAnnotations';
import { useUIStore } from '../../core/store/uiStore';
import { FloatingTools } from './FloatingTools';
import { FloatingZoomControls } from './FloatingZoomControls';
import { ImageNavigation } from '../../gallery/components/ImageNavigation';
import { AnnotationsBar } from './AnnotationsBar';
import type { Annotation, BBoxData } from '@/lib/db';

const ZOOM_WHEEL_FACTOR = 1.05;
const MIN_ZOOM_SCALE = 0.1;
const MAX_ZOOM_SCALE = 20;

export function AnnotationCanvas() {
  const { t } = useTranslation();
  const { image } = useCurrentImage();
  const { project } = useCurrentProject();
  const { annotations, selectedAnnotationId, selectAnnotation, updateAnnotation, addAnnotation } = useAnnotations();
  const { activeTool, activeClassId } = useUIStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  // Drawing state
  const [newAnnotation, setNewAnnotation] = useState<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Load image
  useEffect(() => {
    if (!image) return;

    const img = new window.Image();
    const url = URL.createObjectURL(image.image);

    img.onload = () => {
      setKonvaImage(img);
      imageElementRef.current = img;
      URL.revokeObjectURL(url);

      // Calculate initial scale
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight || 600;

        const scaleX = containerWidth / img.width;
        const scaleY = containerHeight / img.height;
        const newScale = Math.min(scaleX, scaleY) * 0.9;

        const scaledWidth = img.width * newScale;
        const scaledHeight = img.height * newScale;
        const offsetX = (containerWidth - scaledWidth) / 2;
        const offsetY = (containerHeight - scaledHeight) / 2;

        setScale(newScale);
        setImageOffset({ x: offsetX, y: offsetY });
        setStageSize({ width: containerWidth, height: containerHeight });
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
      }
    };

    img.src = url;

    return () => {
      if (img.src) URL.revokeObjectURL(img.src);
    };
  }, [image]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (konvaImage && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight || 600;

        const scaleX = containerWidth / konvaImage.width;
        const scaleY = containerHeight / konvaImage.height;
        const newScale = Math.min(scaleX, scaleY) * 0.9;

        const scaledWidth = konvaImage.width * newScale;
        const scaledHeight = konvaImage.height * newScale;
        const offsetX = (containerWidth - scaledWidth) / 2;
        const offsetY = (containerHeight - scaledHeight) / 2;

        setScale(newScale);
        setImageOffset({ x: offsetX, y: offsetY });
        setStageSize({ width: containerWidth, height: containerHeight });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [konvaImage]);

  // Update transformer when selection changes
  useEffect(() => {
    if (selectedAnnotationId && trRef.current && stageRef.current) {
      const stage = stageRef.current;
      const selectedNode = stage.findOne('#ann-' + selectedAnnotationId);
      if (selectedNode) {
        trRef.current.nodes([selectedNode]);
        trRef.current.getLayer().batchDraw();
      } else {
        trRef.current.nodes([]);
      }
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selectedAnnotationId, annotations]);

  // Handle zoom with mouse wheel
  const handleWheel = (e: any) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale * ZOOM_WHEEL_FACTOR : oldScale / ZOOM_WHEEL_FACTOR;
    const clampedScale = Math.max(MIN_ZOOM_SCALE, Math.min(MAX_ZOOM_SCALE, newScale));

    setStageScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  };

  // Handle stage drag
  const handleDragEnd = (e: any) => {
    if (e.target === e.target.getStage()) {
      setStagePos({
        x: e.target.x(),
        y: e.target.y(),
      });
    }
  };

  // Handle mouse down for drawing
  const handleMouseDown = (e: any) => {
    // Deselect when clicking on empty area
    const clickedOnEmpty = e.target === e.target.getStage();
    const clickedOnImage = e.target.getClassName() === 'Image';

    if (clickedOnEmpty || clickedOnImage) {
      selectAnnotation(null);
    }

    if (activeTool === 'bbox' && (clickedOnEmpty || clickedOnImage)) {
      const stage = stageRef.current;
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Convert to image coordinates
      const relativeX = pos.x - stagePos.x;
      const relativeY = pos.y - stagePos.y;
      const canvasX = relativeX / stageScale;
      const canvasY = relativeY / stageScale;
      const x = (canvasX - imageOffset.x) / scale;
      const y = (canvasY - imageOffset.y) / scale;

      setIsDrawing(true);
      setNewAnnotation({
        x,
        y,
        width: 0,
        height: 0,
      });
    }
  };

  // Handle mouse move for drawing
  const handleMouseMove = (e: any) => {
    if (!isDrawing || !newAnnotation || activeTool !== 'bbox') return;

    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const relativeX = pos.x - stagePos.x;
    const relativeY = pos.y - stagePos.y;
    const canvasX = relativeX / stageScale;
    const canvasY = relativeY / stageScale;
    const x = (canvasX - imageOffset.x) / scale;
    const y = (canvasY - imageOffset.y) / scale;

    setNewAnnotation({
      ...newAnnotation,
      width: x - newAnnotation.x,
      height: y - newAnnotation.y,
    });
  };

  // Handle mouse up for drawing
  const handleMouseUp = () => {
    if (isDrawing && newAnnotation && konvaImage && activeClassId !== null) {
      // Normalize bbox
      const normalizedBbox: BBoxData = {
        x: newAnnotation.width < 0 ? newAnnotation.x + newAnnotation.width : newAnnotation.x,
        y: newAnnotation.height < 0 ? newAnnotation.y + newAnnotation.height : newAnnotation.y,
        width: Math.abs(newAnnotation.width),
        height: Math.abs(newAnnotation.height),
      };

      // Minimum size threshold
      const minSize = 5;
      if (normalizedBbox.width > minSize && normalizedBbox.height > minSize) {
        const annotation: Annotation = {
          id: crypto.randomUUID(),
          type: 'bbox',
          classId: activeClassId,
          data: normalizedBbox,
        };

        addAnnotation(annotation);
      }

      setNewAnnotation(null);
    }
    setIsDrawing(false);
  };

  // Handle annotation drag
  const handleAnnotationDragEnd = (id: string, e: any) => {
    const node = e.target;
    const x = (node.x() - imageOffset.x) / scale;
    const y = (node.y() - imageOffset.y) / scale;
    const width = node.width() / scale;
    const height = node.height() / scale;

    updateAnnotation(id, {
      data: {
        x,
        y,
        width,
        height,
      }
    });
  };

  // Handle annotation transform
  const handleAnnotationTransform = (id: string, e: any) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale
    node.scaleX(1);
    node.scaleY(1);

    const x = (node.x() - imageOffset.x) / scale;
    const y = (node.y() - imageOffset.y) / scale;
    const width = Math.max(5, (node.width() * scaleX) / scale);
    const height = Math.max(5, (node.height() * scaleY) / scale);

    updateAnnotation(id, {
      data: { x, y, width, height }
    });
  };

  // Reset zoom
  const handleResetZoom = useCallback(() => {
    setStageScale(1);
    setStagePos({ x: 0, y: 0 });
  }, []);

  // Zoom in/out
  const handleZoomIn = useCallback(() => {
    setStageScale(prev => Math.min(MAX_ZOOM_SCALE, prev * 1.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setStageScale(prev => Math.max(MIN_ZOOM_SCALE, prev / 1.2));
  }, []);

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

  if (!konvaImage || !project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="annotix-canvas-container"
    >
      {/* Floating Tools (Left) */}
      <FloatingTools />

      {/* Floating Zoom Controls (Right) */}
      <FloatingZoomControls
        zoom={stageScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleResetZoom}
      />

      {/* Image Info (Top Left) */}
      <div className="annotix-floating" style={{ top: '20px', left: '20px' }}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm">
            <i className="fas fa-image" style={{ color: 'var(--annotix-primary)' }}></i>
            <span className="font-medium text-[var(--annotix-dark)]">{image.name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--annotix-gray)' }}>
            <i className="fas fa-expand-arrows-alt"></i>
            <span>{image.width} × {image.height}</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--annotix-gray)' }}>
            <i className="fas fa-layer-group"></i>
            <span>{annotations.length} {t('annotations.title')}</span>
          </div>
        </div>
      </div>

      {/* Image Navigation (Circular buttons) */}
      <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', transform: 'translateY(-50%)', zIndex: 50, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
          <ImageNavigation />
        </div>
      </div>

      {/* Konva Stage */}
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        onWheel={handleWheel}
        onDragEnd={handleDragEnd}
        draggable={activeTool === 'pan' || activeTool === 'select'}
        onDragStart={(e) => {
          if (e.target !== e.target.getStage()) {
            return;
          }
          if (activeTool !== 'pan') {
            e.target.stopDrag();
          }
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Image Layer */}
        <Layer>
          <KonvaImage
            image={konvaImage}
            x={imageOffset.x}
            y={imageOffset.y}
            width={konvaImage.width}
            height={konvaImage.height}
            scaleX={scale}
            scaleY={scale}
          />
        </Layer>

        {/* Annotations Layer */}
        <Layer>
          {annotations.map((ann) => {
            if (ann.type !== 'bbox') return null;

            const bboxData = ann.data as BBoxData;
            const classInfo = project.classes.find(c => c.id === ann.classId);
            if (!classInfo) return null;

            const isSelected = selectedAnnotationId === ann.id;

            return (
              <Rect
                key={ann.id}
                id={'ann-' + ann.id}
                x={bboxData.x * scale + imageOffset.x}
                y={bboxData.y * scale + imageOffset.y}
                width={bboxData.width * scale}
                height={bboxData.height * scale}
                fill={classInfo.color + '20'}
                stroke={classInfo.color}
                strokeWidth={2}
                draggable={activeTool === 'select' && isSelected}
                listening={activeTool !== 'bbox'}
                onClick={() => {
                  if (activeTool === 'select') {
                    selectAnnotation(ann.id);
                  }
                }}
                onDragEnd={(e) => handleAnnotationDragEnd(ann.id, e)}
                onTransformEnd={(e) => handleAnnotationTransform(ann.id, e)}
              />
            );
          })}

          {/* New annotation being drawn */}
          {newAnnotation && (
            <Rect
              x={newAnnotation.x * scale + imageOffset.x}
              y={newAnnotation.y * scale + imageOffset.y}
              width={newAnnotation.width * scale}
              height={newAnnotation.height * scale}
              stroke="#FF6B6B"
              strokeWidth={2}
              dash={[10, 5]}
            />
          )}
        </Layer>

        {/* Transformer Layer */}
        <Layer>
          <Transformer
            ref={trRef}
            rotateEnabled={false}
            keepRatio={false}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>

      {/* Annotations Bar (Bottom) */}
      <AnnotationsBar image={konvaImage} />
    </div>
  );
}
