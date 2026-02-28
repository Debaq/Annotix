import React, { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Line, Circle, Group } from 'react-konva';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useAnnotations, captureSaveContext, invalidateSaveContext } from '../hooks/useAnnotations';
import { useUIStore } from '../../core/store/uiStore';
import { FloatingTools } from './FloatingTools';
import { FloatingZoomControls } from './FloatingZoomControls';
import { ImageNavigation } from '../../gallery/components/ImageNavigation';
import { AnnotationsBar } from './AnnotationsBar';
import { skeletonPresets } from '../data/skeletonPresets';
import { imageService } from '../../gallery/services/imageService';
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

function formatFrameTime(frameIndex: number, fps: number): string {
  if (fps <= 0) return '0:00.000';
  const totalSeconds = frameIndex / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export interface AnnotationOverride {
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  selectAnnotation: (id: string | null) => void;
  addAnnotation: (annotation: Annotation) => Promise<void>;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  disabledAnnotationIds?: Set<string>;
  onToggleAnnotation?: (id: string) => Promise<void>;
}

interface AnnotationCanvasProps {
  overrideAnnotations?: AnnotationOverride;
  videoFrameInfo?: { frameIndex: number; fps: number };
}

export function AnnotationCanvas({ overrideAnnotations, videoFrameInfo }: AnnotationCanvasProps = {}) {
  const { t } = useTranslation();
  const { image } = useCurrentImage();
  const { project } = useCurrentProject();
  const defaults = useAnnotations();
  const { annotations, selectedAnnotationId, selectAnnotation, updateAnnotation, addAnnotation, deleteAnnotation } = overrideAnnotations ?? defaults;
  const { activeTool, activeClassId, setActiveTool } = useUIStore();

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
  const [maskImage, setMaskImage] = useState<HTMLImageElement | null>(null);
  const [bboxDrawingData, setBboxDrawingData] = useState<any>(null);
  const [obbDrawingData, setObbDrawingData] = useState<any>(null);
  const [maskBrushSize, setMaskBrushSize] = useState(15);
  const [maskEraseMode, setMaskEraseMode] = useState(false);
  const [maskCursor, setMaskCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [, forceKeypointsPreviewUpdate] = useReducer((v: number) => v + 1, 0);

  // Track previous tool to finish handlers when switching
  const prevToolRef = useRef<string | null>(null);
  const prevImageIdRef = useRef<string | null>(null);
  const prevProjectIdRef = useRef<string | null>(null);
  const justChangedProjectRef = useRef<boolean>(false);
  const prevActiveClassIdRef = useRef<number | null>(activeClassId);

  // Initialize handlers
  const classColor = useMemo(() => {
    if (activeClassId === null) return '#FF6B6B';
    const classInfo = project?.classes.find(c => c.id === activeClassId);
    return classInfo?.color || '#FF6B6B';
  }, [activeClassId, project]);

  const bboxHandlerRef = useRef<BBoxHandler | null>(null);
  if (!bboxHandlerRef.current) {
    bboxHandlerRef.current = new BBoxHandler(null, addAnnotation);
  }
  const bboxHandler = bboxHandlerRef.current;

  const obbHandlerRef = useRef<OBBHandler | null>(null);
  if (!obbHandlerRef.current) {
    obbHandlerRef.current = new OBBHandler(null, addAnnotation);
  }
  const obbHandler = obbHandlerRef.current;

  const polygonHandlerRef = useRef<PolygonHandler | null>(null);
  if (!polygonHandlerRef.current) {
    polygonHandlerRef.current = new PolygonHandler(null, addAnnotation);
  }
  const polygonHandler = polygonHandlerRef.current;

  const keypointsHandlerRef = useRef<KeypointsHandler | null>(null);
  if (!keypointsHandlerRef.current) {
    keypointsHandlerRef.current = new KeypointsHandler(null, addAnnotation);
  }
  const keypointsHandler = keypointsHandlerRef.current;

  const landmarksHandlerRef = useRef<LandmarksHandler | null>(null);
  if (!landmarksHandlerRef.current) {
    landmarksHandlerRef.current = new LandmarksHandler(null, addAnnotation);
  }
  const landmarksHandler = landmarksHandlerRef.current;
  
  const maskHandlerRef = useRef<MaskHandler | null>(null);
  if (!maskHandlerRef.current) {
    maskHandlerRef.current = new MaskHandler(null, addAnnotation, '#FF6B6B');
  }
  const maskHandler = maskHandlerRef.current;

  const getActiveClassMaskBase = useCallback((): string | undefined => {
    if (activeClassId === null) return undefined;
    const maskCandidates = annotations.filter(
      (annotation) => annotation.type === 'mask' && annotation.classId === activeClassId
    );
    if (maskCandidates.length === 0) return undefined;
    const latest = maskCandidates[maskCandidates.length - 1];
    return (latest.data as MaskData).base64png;
  }, [annotations, activeClassId]);

  const initializeMaskHandler = useCallback(() => {
    if (!konvaImage) return;
    const baseMask = getActiveClassMaskBase();
    maskHandler.initialize(konvaImage.width, konvaImage.height, baseMask);
  }, [konvaImage, getActiveClassMaskBase, maskHandler]);

  const addAnnotationWithMaskReplace = useCallback(async (annotation: Annotation) => {
    if (annotation.type !== 'mask') {
      await addAnnotation(annotation);
      return;
    }

    const existingMaskIds = annotations
      .filter((item) => item.type === 'mask' && item.classId === annotation.classId)
      .map((item) => item.id);

    for (const annotationId of existingMaskIds) {
      await deleteAnnotation(annotationId);
    }

    await addAnnotation(annotation);
  }, [annotations, addAnnotation, deleteAnnotation]);

  // Registrar callbacks y actualizar activeClassId cuando cambia
  useEffect(() => {
    bboxHandler.setDrawingDataUpdateCallback(setBboxDrawingData);
    bboxHandler.updateActiveClassId(activeClassId);
  }, [activeClassId]);

  useEffect(() => {
    obbHandler.setDrawingDataUpdateCallback(setObbDrawingData);
    obbHandler.updateActiveClassId(activeClassId);
  }, [activeClassId]);

  useEffect(() => {
    polygonHandler.updateActiveClassId(activeClassId);
  }, [activeClassId]);

  useEffect(() => {
    keypointsHandler.updateActiveClassId(activeClassId);
  }, [activeClassId]);

  useEffect(() => {
    keypointsHandler.setPreviewUpdateCallback(() => {
      forceKeypointsPreviewUpdate();
    });
  }, [keypointsHandler]);

  useEffect(() => {
    landmarksHandler.updateActiveClassId(activeClassId);
  }, [activeClassId]);

  // Actualizar activeClassId y classColor en el MaskHandler sin recrearlo
  useEffect(() => {
    console.log('[AnnotationCanvas] Actualizando MaskHandler con activeClassId:', activeClassId, 'y color:', classColor);
    maskHandler.updateActiveClassId(activeClassId);
    maskHandler.updateClassColor(classColor);
    setMaskBrushSize(maskHandler.getBrushSize());
    setMaskEraseMode(maskHandler.getEraseMode());
    // Registrar callback para actualizaciones de la imagen
    maskHandler.setMaskImageUpdateCallback(setMaskImage);
  }, [activeClassId, classColor]);

  useEffect(() => {
    if (!selectedAnnotationId || activeClassId === null) {
      prevActiveClassIdRef.current = activeClassId;
      return;
    }

    const previousClassId = prevActiveClassIdRef.current;
    prevActiveClassIdRef.current = activeClassId;

    if (previousClassId === activeClassId) {
      return;
    }

    const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedAnnotationId);
    if (!selectedAnnotation || selectedAnnotation.classId === activeClassId) {
      return;
    }

    updateAnnotation(selectedAnnotationId, { classId: activeClassId });
  }, [activeClassId, selectedAnnotationId, annotations, updateAnnotation]);

  // Actualizar callback de addAnnotation en TODOS los handlers cuando cambia
  useEffect(() => {
    console.log('[AnnotationCanvas] Actualizando callback addAnnotation en todos los handlers');
    bboxHandler.updateAddAnnotationCallback(addAnnotationWithMaskReplace);
    obbHandler.updateAddAnnotationCallback(addAnnotationWithMaskReplace);
    polygonHandler.updateAddAnnotationCallback(addAnnotationWithMaskReplace);
    keypointsHandler.updateAddAnnotationCallback(addAnnotationWithMaskReplace);
    landmarksHandler.updateAddAnnotationCallback(addAnnotationWithMaskReplace);
    maskHandler.updateAddAnnotationCallback(addAnnotationWithMaskReplace);
  }, [addAnnotationWithMaskReplace]);

  // Get current handler based on active tool
  const currentHandler = useMemo(() => {
    switch (activeTool) {
      case 'bbox': return activeClassId !== null ? bboxHandler : null;
      case 'obb': return activeClassId !== null ? obbHandler : null;
      case 'polygon': return activeClassId !== null ? polygonHandler : null;
      case 'keypoints': return activeClassId !== null ? keypointsHandler : null;
      case 'landmarks': return activeClassId !== null ? landmarksHandler : null;
      case 'mask': return activeClassId !== null ? maskHandler : null;
      default: return null;
    }
  }, [activeTool, activeClassId]);

  // Load image from filesystem via Tauri
  useEffect(() => {
    if (!image || !image.id) return;

    let cancelled = false;

    imageService.getFilePath(image.projectId, image.id).then((filePath) => {
      if (cancelled) return;

      const img = new window.Image();
      const url = convertFileSrc(filePath);

      img.onload = () => {
        if (cancelled) return;
        setKonvaImage(img);
        imageElementRef.current = img;

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
    });

    return () => {
      cancelled = true;
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

    // Si es proyecto mask y se presiona Ctrl, ajustar tamaño de pincel
    if (project?.type === 'mask' && e.evt.ctrlKey && maskHandler) {
      const delta = e.evt.deltaY > 0 ? -2 : 2; // Invertir para que scroll up = más grande
      const currentSize = maskHandler.getBrushSize();
      const newSize = Math.max(5, Math.min(100, currentSize + delta));
      maskHandler.setBrushSize(newSize);
      setMaskBrushSize(newSize);
      return;
    }

    // Zoom normal si no es mask o no hay Ctrl
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

      if (activeTool === 'mask' && konvaImage && !maskHandler.isActive()) {
        console.log('[AnnotationCanvas] Re-inicializando maskHandler on-demand en mouseDown');
        initializeMaskHandler();
      }

      if (currentHandler && stageRef.current) {
        // CRÍTICO: Capturar contexto ANTES de empezar a dibujar
        captureSaveContext(image?.id || null, project?.id || null);
        console.log('[AnnotationCanvas] Iniciando dibujo en imagen:', image?.id, 'proyecto:', project?.id);
        
        const coords = getImageCoordinates(stageRef.current);
        if (coords) {
          currentHandler.onMouseDown(coords);
        }
      }
    }
  };

  // Handle mouse move for drawing
  const handleMouseMove = (e: any) => {
    if (!stageRef.current) return;

    const coords = getImageCoordinates(stageRef.current);
    if (coords) {
      if (currentHandler) {
        currentHandler.onMouseMove(coords);
      }

      if (activeTool === 'mask' && image) {
        const insideImage =
          coords.imageX >= 0 &&
          coords.imageY >= 0 &&
          coords.imageX <= image.width &&
          coords.imageY <= image.height;

        setMaskCursor({
          x: coords.canvasX,
          y: coords.canvasY,
          visible: insideImage,
        });
      }
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

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();

    // Reset scale
    node.scaleX(1);
    node.scaleY(1);

    const x = (node.x() - imageOffset.x) / scale;
    const y = (node.y() - imageOffset.y) / scale;

    const currentAnn = annotations.find(a => a.id === id);
    if (!currentAnn || currentAnn.type !== 'obb') {
      return;
    }

    const currentData = currentAnn.data as OBBData;
    const width = Math.max(5, currentData.width * scaleX);
    const height = Math.max(5, currentData.height * scaleY);
    const normalizedRotation = ((rotation % 360) + 360) % 360;

    updateAnnotation(id, {
      data: {
        x,
        y,
        width,
        height,
        rotation: normalizedRotation,
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
      // Handler specific shortcuts (Enter/Escape)
      if (currentHandler && currentHandler.isActive()) {
        if (e.key === 'Enter' && currentHandler.finish) {
          currentHandler.finish();
        } else if (e.key === 'Escape' && currentHandler.cancel) {
          currentHandler.cancel();
        }
      }

      // Mask-specific shortcuts (solo en proyectos mask)
      if (project?.type === 'mask' && maskHandler) {
        // [: Disminuir tamaño de pincel
        if (e.key === '[') {
          e.preventDefault();
          const currentSize = maskHandler.getBrushSize();
          const newSize = currentSize - 5;
          maskHandler.setBrushSize(newSize);
          setMaskBrushSize(maskHandler.getBrushSize());
          return;
        }
        
        // ]: Aumentar tamaño de pincel
        if (e.key === ']') {
          e.preventDefault();
          const currentSize = maskHandler.getBrushSize();
          const newSize = currentSize + 5;
          maskHandler.setBrushSize(newSize);
          setMaskBrushSize(maskHandler.getBrushSize());
          return;
        }
        
        // E: Toggle modo borrador
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          const newMode = maskHandler.toggleEraseMode();
          setMaskEraseMode(newMode);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentHandler, project?.type, maskHandler]);

  // Finish previous handler when tool changes or image changes
  useEffect(() => {
    if (!konvaImage) return;

    const prevTool = prevToolRef.current;
    const prevImageId = prevImageIdRef.current;
    const prevProjectId = prevProjectIdRef.current;
    const currentImageId = image?.id || null;
    const currentProjectId = project?.id || null;

    // Si cambió el proyecto, resetear TODO sin guardar y SALIR
    if (prevProjectId !== null && prevProjectId !== currentProjectId) {
      console.log('[AnnotationCanvas] Proyecto cambió, reseteando todos los handlers SIN guardar');
      
      // INVALIDAR contexto de guardado para prevenir guardados futuros
      invalidateSaveContext();
      
      // Marcar que acabamos de cambiar de proyecto
      justChangedProjectRef.current = true;
      
      // NO guardar, solo resetear
      if (maskHandler.isActive()) {
        maskHandler.cancel();
      }
      if (keypointsHandler.isActive()) {
        keypointsHandler.cancel();
      }
      bboxHandler.cancel();
      obbHandler.cancel();
      polygonHandler.cancel();
      landmarksHandler.cancel();
      
      // Limpiar estados de preview en React
      setBboxDrawingData(null);
      setObbDrawingData(null);
      setMaskImage(null);
      
      // Actualizar referencias y SALIR para no ejecutar lógica de cambio de imagen
      prevToolRef.current = activeTool;
      prevImageIdRef.current = currentImageId;
      prevProjectIdRef.current = currentProjectId;
      return;
    }

    // Si cambió la imagen (pero NO el proyecto), guardar cualquier handler activo y resetear TODOS
    if (prevImageId !== null && prevImageId !== currentImageId) {
      console.log('[AnnotationCanvas] Imagen cambió');
      
      // Si acabamos de cambiar de proyecto, NO guardar nada
      if (justChangedProjectRef.current) {
        console.log('[AnnotationCanvas] Acabamos de cambiar de proyecto, NO guardando');
        justChangedProjectRef.current = false; // Reset flag
      } else {
        console.log('[AnnotationCanvas] Guardando handlers activos antes de cambiar imagen');
        
        // Guardar handlers que necesitan finish
        if (maskHandler.isActive()) {
          console.log('[AnnotationCanvas] Guardando máscara antes de cambiar imagen');
          maskHandler.finish();
        }
        if (keypointsHandler.isActive()) {
          keypointsHandler.cancel();
        }
      }
      
      // Resetear TODOS los handlers para evitar dibujar en imagen incorrecta
      console.log('[AnnotationCanvas] Reseteando todos los handlers');
      bboxHandler.cancel();
      obbHandler.cancel();
      polygonHandler.cancel();
      landmarksHandler.cancel();
      if (!justChangedProjectRef.current) {
        // Solo resetear estos si no lo hicimos ya en el cambio de proyecto
        if (maskHandler.isActive()) maskHandler.cancel();
        if (keypointsHandler.isActive()) keypointsHandler.cancel();
      }
      
      // Limpiar estados de preview en React
      setBboxDrawingData(null);
      setObbDrawingData(null);
    }

    // Si cambió la herramienta, guardar el handler anterior
    if (prevTool !== null && prevTool !== activeTool) {
      console.log('[AnnotationCanvas] Tool cambió de', prevTool, 'a', activeTool);
      
      if (prevTool === 'mask' && maskHandler.isActive()) {
        console.log('[AnnotationCanvas] Cancelando máscara antes de cambiar tool (sin auto-guardar)');
        maskHandler.cancel();
        setMaskImage(null);
      } else if (prevTool === 'keypoints' && keypointsHandler.isActive()) {
        keypointsHandler.cancel();
      }
    }

    // Actualizar referencias
    prevToolRef.current = activeTool;
    prevImageIdRef.current = currentImageId;
    prevProjectIdRef.current = currentProjectId;
  }, [activeTool, konvaImage, image?.id, project?.id]);

  // Inicializar handler SOLO cuando cambia el tool activo (no cuando cambia imagen/proyecto)
  useEffect(() => {
    if (!konvaImage) return;

    console.log('[AnnotationCanvas] Tool cambió, inicializando handler si es necesario:', activeTool);
    
    if (activeTool === 'keypoints' && !keypointsHandler.isActive()) {
      console.log('[AnnotationCanvas] Inicializando keypointsHandler');
      keypointsHandler.initialize(konvaImage.width, konvaImage.height);
    } else if (activeTool === 'mask' && !maskHandler.isActive()) {
      console.log('[AnnotationCanvas] Inicializando maskHandler');
      initializeMaskHandler();
    }
  }, [activeTool, konvaImage, initializeMaskHandler]);

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

  useEffect(() => {
    if (!stageRef.current) return;

    const stageContainer = stageRef.current.container();
    if (!stageContainer) return;

    stageContainer.style.cursor = activeTool === 'mask' ? 'none' : 'default';

    return () => {
      stageContainer.style.cursor = 'default';
    };
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== 'mask') {
      setMaskCursor((prev) => ({ ...prev, visible: false }));
    }
  }, [activeTool]);

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
      <FloatingTools
        maskBrushSize={maskBrushSize}
        maskEraseMode={maskEraseMode}
        onMaskBrushSizeChange={(size) => {
          maskHandler.setBrushSize(size);
          setMaskBrushSize(maskHandler.getBrushSize());
        }}
        onMaskToggleErase={() => {
          const newMode = maskHandler.toggleEraseMode();
          setMaskEraseMode(newMode);
        }}
      />

      {/* Floating Zoom Controls (Right) */}
      <FloatingZoomControls
        zoom={stageScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleResetZoom}
      />

      {/* Image/Frame Info (Top Left) */}
      <div className="annotix-floating" style={{ top: '20px', left: '20px' }}>
        <div className="flex flex-col gap-1">
          {videoFrameInfo ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <i className="fas fa-film" style={{ color: 'var(--annotix-primary)' }}></i>
                <span className="font-medium text-[var(--annotix-dark)]">
                  {t('video.frame', 'Frame')} {videoFrameInfo.frameIndex + 1}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--annotix-gray)' }}>
                <i className="fas fa-clock"></i>
                <span>{formatFrameTime(videoFrameInfo.frameIndex, videoFrameInfo.fps)}</span>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
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
        onMouseLeave={() => {
          if (activeTool === 'mask') {
            setMaskCursor((prev) => ({ ...prev, visible: false }));
          }
        }}
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
            const isDisabled = overrideAnnotations?.disabledAnnotationIds?.has(ann.id) ?? false;
            const annColor = isDisabled ? '#999999' : classInfo.color;
            const commonProps = {
              scale,
              imageOffset,
              color: annColor,
              isSelected,
              listening: activeTool === 'select',
              onClick: () => {
                if (activeTool === 'select') {
                  selectAnnotation(ann.id);
                }
              },
            };

            switch (ann.type) {
              case 'bbox': {
                const bboxData = ann.data as BBoxData;
                const toggleFn = overrideAnnotations?.onToggleAnnotation;
                const btnX = bboxData.x * scale + imageOffset.x + bboxData.width * scale - 20;
                const btnY = bboxData.y * scale + imageOffset.y + 2;
                return (
                  <React.Fragment key={ann.id}>
                    <BBoxRenderer
                      id={'ann-' + ann.id}
                      data={bboxData}
                      {...commonProps}
                      draggable={activeTool === 'select' && isSelected && !isDisabled}
                      onDragEnd={(e) => handleAnnotationDragEnd(ann.id, e)}
                      onTransformEnd={(e) => handleAnnotationTransform(ann.id, e)}
                    />
                    {toggleFn && (
                      <Group
                        x={btnX}
                        y={btnY}
                        listening={true}
                        onClick={(e: any) => {
                          e.cancelBubble = true;
                          toggleFn(ann.id);
                        }}
                      >
                        <Rect
                          width={18}
                          height={18}
                          fill="rgba(0,0,0,0.55)"
                          cornerRadius={3}
                        />
                        <Circle
                          x={9}
                          y={9}
                          radius={4}
                          fill={isDisabled ? '#888' : 'white'}
                          stroke={isDisabled ? '#666' : annColor}
                          strokeWidth={1}
                        />
                        {isDisabled && (
                          <Line
                            points={[2, 2, 16, 16]}
                            stroke="#ff5555"
                            strokeWidth={2}
                          />
                        )}
                      </Group>
                    )}
                  </React.Fragment>
                );
              }

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
                if (activeTool === 'mask' && ann.classId === activeClassId) {
                  return null;
                }
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
                  if (!start || !end || !start.visible || !end.visible) return null;

                  return (
                    <Line
                      key={`temp-conn-${connIdx}`}
                      listening={false}
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
                  listening={false}
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

          {/* Mask drawing preview - show while drawing or when switching tools */}
          {maskImage && (
            <KonvaImage
              image={maskImage}
              x={imageOffset.x}
              y={imageOffset.y}
              scaleX={scale}
              scaleY={scale}
              opacity={0.6}
              listening={false}
            />
          )}

          {activeTool === 'mask' && maskCursor.visible && (
            <Circle
              x={maskCursor.x}
              y={maskCursor.y}
              radius={(maskBrushSize * scale) / 2}
              stroke={maskEraseMode ? '#ffffff' : classColor}
              strokeWidth={2}
              fill={maskEraseMode ? 'transparent' : `${classColor}55`}
              listening={false}
            />
          )}

          {activeTool === 'bbox' && bboxDrawingData && (
            <Rect
              x={bboxDrawingData.startX * scale + imageOffset.x}
              y={bboxDrawingData.startY * scale + imageOffset.y}
              width={bboxDrawingData.width * scale}
              height={bboxDrawingData.height * scale}
              stroke={classColor}
              strokeWidth={2}
              dash={[10, 5]}
            />
          )}

          {activeTool === 'obb' && obbDrawingData && (
            <Rect
              x={obbDrawingData.startX * scale + imageOffset.x}
              y={obbDrawingData.startY * scale + imageOffset.y}
              width={obbDrawingData.width * scale}
              height={obbDrawingData.height * scale}
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
