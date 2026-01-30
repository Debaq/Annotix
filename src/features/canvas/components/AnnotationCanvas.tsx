import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Line, Circle } from 'react-konva';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useAnnotations } from '../hooks/useAnnotations';
import { useUIStore } from '../../core/store/uiStore';
import { FloatingTools } from './FloatingTools';
import { FloatingZoomControls } from './FloatingZoomControls';
import { ImageNavigation } from '../../gallery/components/ImageNavigation';
import { AnnotationsBar } from './AnnotationsBar';
import { skeletonPresets } from '../data/skeletonPresets';
import type { Annotation, BBoxData, OBBData, PolygonData, KeypointsData, LandmarksData, MaskData } from '@/lib/db';
import type { MouseEventData } from '../types/handlers';
import { BBoxHandler } from '../handlers/BBoxHandler';
import { OBBHandler } from '../handlers/OBBHandler';
import { PolygonHandler } from '../handlers/PolygonHandler';
import { KeypointsHandler } from '../handlers/KeypointsHandler';
import { LandmarksHandler } from '../handlers/LandmarksHandler';
import { MaskHandler } from '../handlers/MaskHandler';
import { BBoxRenderer } from './renderers/BBoxRenderer';
import { OBBRenderer } from './renderers/OBBRenderer';
import { PolygonRenderer } from './renderers/PolygonRenderer';
import { KeypointsRenderer } from './renderers/KeypointsRenderer';
import { LandmarksRenderer } from './renderers/LandmarksRenderer';
import { MaskRenderer } from './renderers/MaskRenderer';

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

  // Initialize handlers
  const classColor = useMemo(() => {
    if (activeClassId === null) return '#FF6B6B';
    const classInfo = project?.classes.find(c => c.id === activeClassId);
    return classInfo?.color || '#FF6B6B';
  }, [activeClassId, project]);

  const bboxHandler = useMemo(() => new BBoxHandler(activeClassId, addAnnotation), [activeClassId, addAnnotation]);
  const obbHandler = useMemo(() => new OBBHandler(activeClassId, addAnnotation), [activeClassId, addAnnotation]);
  const polygonHandler = useMemo(() => new PolygonHandler(activeClassId, addAnnotation), [activeClassId, addAnnotation]);
  const keypointsHandler = useMemo(() => new KeypointsHandler(activeClassId, addAnnotation), [activeClassId, addAnnotation]);
  const landmarksHandler = useMemo(() => new LandmarksHandler(activeClassId, addAnnotation), [activeClassId, addAnnotation]);
  const maskHandler = useMemo(() => new MaskHandler(activeClassId, addAnnotation, classColor), [activeClassId, addAnnotation, classColor]);

  // Get current handler based on active tool
  const currentHandler = useMemo(() => {
    switch (activeTool) {
      case 'bbox': return bboxHandler;
      case 'obb': return obbHandler;
      case 'polygon': return polygonHandler;
      case 'keypoints': return keypointsHandler;
      case 'landmarks': return landmarksHandler;
      case 'mask': return maskHandler;
      default: return null;
    }
  }, [activeTool, bboxHandler, obbHandler, polygonHandler, keypointsHandler, landmarksHandler, maskHandler]);

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

  // Helper to convert stage coordinates to image coordinates
  const getImageCoordinates = useCallback((stage: any): MouseEventData | null => {
    const pos = stage.getPointerPosition();
    if (!pos) return null;

    const relativeX = pos.x - stagePos.x;
    const relativeY = pos.y - stagePos.y;
    const canvasX = relativeX / stageScale;
    const canvasY = relativeY / stageScale;
    const imageX = (canvasX - imageOffset.x) / scale;
    const imageY = (canvasY - imageOffset.y) / scale;

    return { imageX, imageY, canvasX, canvasY };
  }, [stagePos, stageScale, imageOffset, scale]);

  // Handle mouse down for drawing
  const handleMouseDown = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    const clickedOnImage = e.target.getClassName() === 'Image';

    if (clickedOnEmpty || clickedOnImage) {
      selectAnnotation(null);

      if (currentHandler && stageRef.current) {
        const coords = getImageCoordinates(stageRef.current);
        if (coords) {
          currentHandler.onMouseDown(coords);
        }
      }
    }
  };

  // Handle mouse move for drawing
  const handleMouseMove = (e: any) => {
    if (!currentHandler || !stageRef.current) return;

    const coords = getImageCoordinates(stageRef.current);
    if (coords) {
      currentHandler.onMouseMove(coords);
    }
  };

  // Handle mouse up for drawing
  const handleMouseUp = () => {
    if (!currentHandler || !stageRef.current) return;

    const coords = getImageCoordinates(stageRef.current);
    if (coords) {
      currentHandler.onMouseUp(coords);
    }
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

  // Handle OBB-specific transform (including rotation)
  const handleOBBTransform = (id: string, e: any) => {
    const node = e.target;
    const parent = node.getParent();
    
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();

    // Reset scale
    node.scaleX(1);
    node.scaleY(1);

    const parentX = parent.x();
    const parentY = parent.y();
    const x = (parentX - imageOffset.x) / scale;
    const y = (parentY - imageOffset.y) / scale;
    const width = Math.max(5, (node.width() * scaleX) / scale);
    const height = Math.max(5, (node.height() * scaleY) / scale);

    updateAnnotation(id, {
      data: {
        x,
        y,
        width,
        height,
        rotation: rotation % 360,
      }
    });
  };

  // Handle OBB drag
  const handleOBBDragEnd = (id: string, e: any) => {
    const group = e.target;
    const x = (group.x() - imageOffset.x) / scale;
    const y = (group.y() - imageOffset.y) / scale;

    const currentAnn = annotations.find(a => a.id === id);
    if (currentAnn && currentAnn.type === 'obb') {
      const currentData = currentAnn.data as OBBData;
      updateAnnotation(id, {
        data: {
          x,
          y,
          width: currentData.width,
          height: currentData.height,
          rotation: currentData.rotation,
        }
      });
    }
  };

  // Keyboard shortcuts for handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentHandler && currentHandler.isActive()) {
        if (e.key === 'Enter' && currentHandler.finish) {
          currentHandler.finish();
        } else if (e.key === 'Escape' && currentHandler.cancel) {
          currentHandler.cancel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentHandler]);

  // Initialize handlers when tool changes
  useEffect(() => {
    if (!konvaImage) return;

    if (activeTool === 'keypoints' && keypointsHandler && !keypointsHandler.isActive()) {
      keypointsHandler.initialize(konvaImage.width, konvaImage.height);
    } else if (activeTool === 'mask' && maskHandler && !maskHandler.isActive()) {
      maskHandler.initialize(konvaImage.width, konvaImage.height);
    }
  }, [activeTool, konvaImage, keypointsHandler, maskHandler]);

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
            const classInfo = project.classes.find(c => c.id === ann.classId);
            if (!classInfo) return null;

            const isSelected = selectedAnnotationId === ann.id;
            const commonProps = {
              scale,
              imageOffset,
              color: classInfo.color,
              isSelected,
              listening: activeTool === 'select',
              onClick: () => {
                if (activeTool === 'select') {
                  selectAnnotation(ann.id);
                }
              },
            };

            switch (ann.type) {
              case 'bbox':
                return (
                  <BBoxRenderer
                    key={ann.id}
                    id={'ann-' + ann.id}
                    data={ann.data as BBoxData}
                    {...commonProps}
                    draggable={activeTool === 'select' && isSelected}
                    onDragEnd={(e) => handleAnnotationDragEnd(ann.id, e)}
                    onTransformEnd={(e) => handleAnnotationTransform(ann.id, e)}
                  />
                );

              case 'obb':
                return (
                  <OBBRenderer
                    key={ann.id}
                    id={'ann-' + ann.id}
                    data={ann.data as OBBData}
                    {...commonProps}
                    draggable={activeTool === 'select' && isSelected}
                    onDragEnd={(e) => handleOBBDragEnd(ann.id, e)}
                    onTransformEnd={(e) => handleOBBTransform(ann.id, e)}
                  />
                );

              case 'polygon':
                return (
                  <PolygonRenderer
                    key={ann.id}
                    id={'ann-' + ann.id}
                    data={ann.data as PolygonData}
                    {...commonProps}
                    draggable={activeTool === 'select' && isSelected}
                    onDragEnd={(e) => {
                      const polygonData = ann.data as PolygonData;
                      const group = e.target;
                      const dx = group.x() / scale;
                      const dy = group.y() / scale;
                      const updatedPoints = polygonData.points.map(p => ({
                        x: p.x + dx,
                        y: p.y + dy
                      }));
                      updateAnnotation(ann.id, {
                        data: {
                          points: updatedPoints,
                          closed: true,
                        }
                      });
                      group.x(0);
                      group.y(0);
                    }}
                  />
                );

              case 'keypoints':
                return (
                  <KeypointsRenderer
                    key={ann.id}
                    data={ann.data as KeypointsData}
                    {...commonProps}
                  />
                );

              case 'landmarks':
                return (
                  <LandmarksRenderer
                    key={ann.id}
                    data={ann.data as LandmarksData}
                    {...commonProps}
                  />
                );

              case 'mask':
                return (
                  <MaskRenderer
                    key={ann.id}
                    data={ann.data as MaskData}
                    {...commonProps}
                    opacity={0.6}
                  />
                );

              default:
                return null;
            }
          })}

          {/* Drawing previews for active tools */}
          {activeTool === 'polygon' && polygonHandler.isActive() && (
            <>
              {polygonHandler.getPoints().length >= 2 && (
                <Line
                  points={polygonHandler.getPoints().flatMap(p => [
                    p.x * scale + imageOffset.x,
                    p.y * scale + imageOffset.y
                  ])}
                  stroke={classColor}
                  strokeWidth={2}
                  dash={[10, 5]}
                />
              )}

              {polygonHandler.getPoints().map((point, idx) => (
                <Circle
                  key={`poly-point-${idx}`}
                  x={point.x * scale + imageOffset.x}
                  y={point.y * scale + imageOffset.y}
                  radius={5}
                  fill={classColor}
                  stroke="white"
                  strokeWidth={1}
                />
              ))}

              {polygonHandler.getPoints().length >= 2 && (
                <Line
                  points={[
                    polygonHandler.getPoints()[polygonHandler.getPoints().length - 1].x * scale + imageOffset.x,
                    polygonHandler.getPoints()[polygonHandler.getPoints().length - 1].y * scale + imageOffset.y,
                    polygonHandler.getPoints()[0].x * scale + imageOffset.x,
                    polygonHandler.getPoints()[0].y * scale + imageOffset.y,
                  ]}
                  stroke={classColor}
                  strokeWidth={1}
                  dash={[5, 5]}
                />
              )}
            </>
          )}

          {activeTool === 'keypoints' && keypointsHandler.isActive() && (
            <>
              {(() => {
                const preset = skeletonPresets[keypointsHandler.getSkeletonType()];
                return preset.connections.map(([startIdx, endIdx], connIdx) => {
                  const start = keypointsHandler.getKeypoints()[startIdx];
                  const end = keypointsHandler.getKeypoints()[endIdx];
                  if (!start || !end) return null;

                  return (
                    <Line
                      key={`temp-conn-${connIdx}`}
                      points={[
                        start.x * scale + imageOffset.x,
                        start.y * scale + imageOffset.y,
                        end.x * scale + imageOffset.x,
                        end.y * scale + imageOffset.y,
                      ]}
                      stroke={classColor}
                      strokeWidth={2}
                    />
                  );
                });
              })()}

              {keypointsHandler.getKeypoints().map((kp, idx) => (
                <Circle
                  key={`temp-kp-${idx}`}
                  x={kp.x * scale + imageOffset.x}
                  y={kp.y * scale + imageOffset.y}
                  radius={keypointsHandler.getSelectedIndex() === idx ? 7 : 5}
                  fill={keypointsHandler.getSelectedIndex() === idx ? "#FF0000" : classColor}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </>
          )}

          {activeTool === 'landmarks' && landmarksHandler.isActive() && (
            <>
              {landmarksHandler.getLandmarks().map((lm, idx) => (
                <Circle
                  key={`temp-lm-${idx}`}
                  x={lm.x * scale + imageOffset.x}
                  y={lm.y * scale + imageOffset.y}
                  radius={5}
                  fill={classColor}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </>
          )}

          {activeTool === 'mask' && maskHandler.getMaskImage() && (
            <KonvaImage
              image={maskHandler.getMaskImage()!}
              x={imageOffset.x}
              y={imageOffset.y}
              scaleX={scale}
              scaleY={scale}
              opacity={0.6}
            />
          )}

          {activeTool === 'bbox' && bboxHandler.getDrawingData() && (
            <Rect
              x={bboxHandler.getDrawingData().startX * scale + imageOffset.x}
              y={bboxHandler.getDrawingData().startY * scale + imageOffset.y}
              width={bboxHandler.getDrawingData().width * scale}
              height={bboxHandler.getDrawingData().height * scale}
              stroke={classColor}
              strokeWidth={2}
              dash={[10, 5]}
            />
          )}

          {activeTool === 'obb' && obbHandler.getDrawingData() && (
            <Rect
              x={obbHandler.getDrawingData().startX * scale + imageOffset.x}
              y={obbHandler.getDrawingData().startY * scale + imageOffset.y}
              width={obbHandler.getDrawingData().width * scale}
              height={obbHandler.getDrawingData().height * scale}
              stroke={classColor}
              strokeWidth={2}
              dash={[10, 5]}
            />
          )}
        </Layer>

        {/* Transformer Layer */}
        <Layer>
          <Transformer
            ref={trRef}
            rotateEnabled={selectedAnnotationId ? annotations.find(a => a.id === selectedAnnotationId)?.type === 'obb' : false}
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
