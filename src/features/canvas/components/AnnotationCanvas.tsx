import React, { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Line, Circle, Group, Text } from 'react-konva';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useAnnotations, useAnnotationStore, captureSaveContext, invalidateSaveContext } from '../hooks/useAnnotations';
import { useUIStore } from '../../core/store/uiStore';
import { FloatingTools } from './FloatingTools';
import { FloatingZoomControls } from './FloatingZoomControls';
import { ImageAdjustments, DEFAULT_ADJUSTMENTS } from './ImageAdjustments';
import type { ImageAdjustmentValues } from './ImageAdjustments';
import { buildCSSFilter } from '../utils/imageFilters';
import * as tauriDb from '@/lib/tauriDb';
import { ImageNavigation } from '../../gallery/components/ImageNavigation';
import { AnnotationsBar } from './AnnotationsBar';
import { useImagePresence } from '../../p2p/hooks/useImagePresence';
import { skeletonPresets } from '../data/skeletonPresets';
import { imageService } from '../../gallery/services/imageService';
import type { Annotation, BBoxData, OBBData, PolygonData, KeypointsData, LandmarksData, MaskData } from '@/lib/db';
import type { MouseEventData } from '../types/handlers';
import { BBoxHandler } from '../handlers/BBoxHandler';
import { OBBHandler } from '../handlers/OBBHandler';
import { PolygonHandler } from '../handlers/PolygonHandler';
import { KeypointsHandler } from '../handlers/KeypointsHandler';
import { LandmarksHandler } from '../handlers/LandmarksHandler';
import { MaskHandler, type MaskPreviewImage } from '../handlers/MaskHandler';
import { BBoxRenderer } from './renderers/BBoxRenderer';
import { OBBRenderer } from './renderers/OBBRenderer';
import { PolygonRenderer } from './renderers/PolygonRenderer';
import { KeypointsRenderer } from './renderers/KeypointsRenderer';
import { LandmarksRenderer } from './renderers/LandmarksRenderer';
import { MaskRenderer } from './renderers/MaskRenderer';
import { matchesShortcut } from '../../core/utils/matchShortcut';
import type { ToolId } from '../config/toolsConfig';
import { reclassifyIsland } from '../utils/maskReclassify';
import { useInferenceModels } from '../../inference/hooks/useInferenceModels';
import { useInferenceRunner } from '../../inference/hooks/useInferenceRunner';
import type { InferenceConfig, InferenceResultEvent, InferenceCompletedEvent, InferenceErrorEvent } from '../../inference/types';
import { useToast } from '@/components/hooks/use-toast';
import { useSamStore } from '../../sam/store/useSamStore';
import { SamOverlay, samHitTest } from '../../sam/components/SamOverlay';
import { SamFloatingPanel } from '../../sam/components/SamFloatingPanel';
import { SamRefineLayer } from '../../sam/components/SamRefineLayer';
import { useSamClassAccept } from '../../sam/hooks/useSamClassAccept';
import { useSamRefineKeyboard } from '../../sam/hooks/useSamRefineKeyboard';
import { useSamAutoGenerate } from '../../sam/hooks/useSamAutoGenerate';
import { samEncodeImage } from '@/lib/tauriDb';

const ZOOM_WHEEL_FACTOR = 1.05;
const MIN_ZOOM_SCALE = 1;
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
  selectedAnnotationIds: Set<string>;
  selectAnnotation: (id: string | null, addToSelection?: boolean) => void;
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
  const { annotations, selectedAnnotationId, selectedAnnotationIds, selectAnnotation, updateAnnotation, addAnnotation, deleteAnnotation } = overrideAnnotations ?? defaults;
  const { hiddenAnnotationIds } = defaults;
  const { replaceAnnotations } = defaults;
  const { activeTool, activeClassId, setActiveTool, annotationsVisible, galleryMode, showLabels } = useUIStore();

  // Auto-lock/unlock para presencia P2P
  useImagePresence(project?.id, image?.id);

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
  const [maskImage, setMaskImage] = useState<MaskPreviewImage | null>(null);
  const [bboxDrawingData, setBboxDrawingData] = useState<any>(null);
  const [obbDrawingData, setObbDrawingData] = useState<any>(null);
  const [maskBrushSize, setMaskBrushSize] = useState(15);
  const [maskEraseMode, setMaskEraseMode] = useState(false);
  const [maskBrushShape, setMaskBrushShape] = useState<'circle' | 'square'>('circle');
  const [maskMaxBrushSize, setMaskMaxBrushSize] = useState(100);
  const [maskDirty, setMaskDirty] = useState(false);
  const [maskCursor, setMaskCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [, forceKeypointsPreviewUpdate] = useReducer((v: number) => v + 1, 0);

  // Middle-button pan state
  const middlePanRef = useRef<{ active: boolean; startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean } | null>(null);

  // ─── Image adjustments (persisted per image) ───────────────────────────
  const adjustmentsMapRef = useRef<Map<string, ImageAdjustmentValues>>(new Map());
  const [imageAdjustments, setImageAdjustments] = useState<ImageAdjustmentValues>({ ...DEFAULT_ADJUSTMENTS });
  const imageLayerRef = useRef<any>(null);
  const [processedImage, setProcessedImage] = useState<HTMLImageElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  // Save adjustments to map when they change
  const handleSetImageAdjustments = useCallback((values: ImageAdjustmentValues) => {
    setImageAdjustments(values);
    const imgId = image?.id;
    if (imgId) {
      adjustmentsMapRef.current.set(imgId, values);
    }
  }, [image?.id]);

  // ─── Inference hooks ──────────────────────────────────────────────────────
  const projectId = project?.id || null;
  const currentImageId = image?.id || null;
  const { toast } = useToast();
  const { models: inferenceModels, selectedModel: inferenceModel } = useInferenceModels(projectId);

  const handleInferenceResult = useCallback((event: InferenceResultEvent) => {
    const count = event.predictionsCount;
    const time = Math.round(event.inferenceTimeMs);
    if (count > 0) {
      toast({ title: `Inferencia: ${count} detecciones (${time}ms)`, duration: 3000 });
    } else {
      toast({ title: `Inferencia: 0 detecciones (${time}ms). Revisa clases y umbral de confianza.`, variant: 'destructive', duration: 5000 });
    }
  }, [toast]);

  const handleInferenceError = useCallback((event: InferenceErrorEvent) => {
    toast({ title: `Error de inferencia: ${event.error}`, variant: 'destructive', duration: 6000 });
  }, [toast]);

  const {
    running: inferenceRunning,
    startSingle: startSingleInference,
  } = useInferenceRunner(handleInferenceResult, undefined, handleInferenceError);

  // Contar anotaciones AI para mostrar en el panel
  const aiAnnotationsCount = annotations.filter(a => a.source === 'ai').length;

  const handleRunInference = useCallback(async () => {
    if (!projectId || !inferenceModel || !currentImageId) return;
    const config: InferenceConfig = {
      confidenceThreshold: 0.25,
      inputSize: inferenceModel.inputSize || null,
      device: 'cpu',
      iouThreshold: 0.45,
    };
    await startSingleInference(projectId, inferenceModel.id, currentImageId, config);
  }, [projectId, inferenceModel, currentImageId, startSingleInference]);

  // Track previous tool to finish handlers when switching
  const prevToolRef = useRef<string | null>(null);
  const prevImageIdRef = useRef<string | null>(null);
  const prevProjectIdRef = useRef<string | null>(null);
  const justChangedProjectRef = useRef<boolean>(false);
  const prevActiveClassIdRef = useRef<number | null>(activeClassId);

  // Initialize handlers
  const classColor = useMemo(() => {
    const DEFAULT_COLOR = '#667eea'; // annotix-primary
    if (activeClassId === null) return DEFAULT_COLOR;
    const classInfo = project?.classes.find(c => c.id === activeClassId);
    return classInfo?.color || DEFAULT_COLOR;
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
    maskHandlerRef.current = new MaskHandler(null, addAnnotation, '#667eea');
  }
  const maskHandler = maskHandlerRef.current;

  // ─── SAM Assist hooks ──────────────────────────────────────────────────────
  const samAssistActive = useSamStore((s) => s.samAssistActive);
  const samPairId = useSamStore((s) => s.pairId);
  const setSamHover = useSamStore((s) => s.setHoverMaskId);
  const setSamEncoding = useSamStore((s) => s.setEncoding);
  const setSamCandidates = useSamStore((s) => s.setCandidates);

  // Encode automático al cambiar imagen mientras SAM Assist está activo.
  useEffect(() => {
    if (!samAssistActive || !samPairId || !projectId || !currentImageId) return;
    let cancelled = false;
    setSamEncoding(true);
    setSamCandidates([]);
    setSamHover(null);
    samEncodeImage(projectId, currentImageId)
      .catch((err) => {
        if (!cancelled) console.error('[SAM] encode_image falló:', err);
      })
      .finally(() => {
        if (!cancelled) setSamEncoding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [samAssistActive, samPairId, projectId, currentImageId, setSamEncoding, setSamCandidates, setSamHover]);

  useSamClassAccept({
    projectType: project?.type,
    classes: project?.classes,
    imageId: currentImageId,
    addAnnotation,
  });

  useSamRefineKeyboard({
    projectType: project?.type,
    classes: project?.classes,
    addAnnotation,
  });

  useSamAutoGenerate({
    projectId,
    imageId: currentImageId,
    annotations,
  });

  const getActiveClassMaskBase = useCallback((): string | undefined => {
    if (activeClassId === null) return undefined;
    // Leer del store directamente para tener datos frescos
    const currentAnns = useAnnotationStore.getState().annotations;
    const maskCandidates = currentAnns.filter(
      (annotation) => annotation.type === 'mask' && annotation.classId === activeClassId
    );
    if (maskCandidates.length === 0) return undefined;
    const latest = maskCandidates[maskCandidates.length - 1];
    return (latest.data as MaskData).base64png;
  }, [activeClassId]);

  const initializeMaskHandler = useCallback(() => {
    if (!konvaImage) return;
    const baseMask = getActiveClassMaskBase();
    maskHandler.initialize(konvaImage.width, konvaImage.height, baseMask);
    setMaskMaxBrushSize(maskHandler.getMaxBrushSize());
  }, [konvaImage, getActiveClassMaskBase, maskHandler]);

  const addAnnotationWithMaskReplace = useCallback(async (annotation: Annotation) => {
    if (annotation.type !== 'mask') {
      await addAnnotation(annotation);
      return;
    }

    // Leer SIEMPRE del store (no del closure) para evitar datos stale
    const currentAnns = useAnnotationStore.getState().annotations;
    const existingIdx = currentAnns.findIndex(
      (item) => item.type === 'mask' && item.classId === annotation.classId
    );
    if (existingIdx >= 0) {
      // Reemplazar in-place para mantener el orden de creación
      const updated = [...currentAnns];
      updated[existingIdx] = annotation;
      await replaceAnnotations(updated);
    } else {
      await replaceAnnotations([...currentAnns, annotation]);
    }
  }, [addAnnotation, replaceAnnotations]);

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
  // Si cambió la clase mientras el handler está activo, guardar y reinicializar
  useEffect(() => {
    console.log('[AnnotationCanvas] Actualizando MaskHandler con activeClassId:', activeClassId, 'y color:', classColor);

    // Si el handler está activo con otra clase, guardar primero y reinicializar
    if (maskHandler.isActive() && maskHandler.getDrawingClassId() !== activeClassId) {
      maskHandler.finish().then(() => {
        maskHandler.updateActiveClassId(activeClassId);
        maskHandler.updateClassColor(classColor);
        if (activeTool === 'mask' && konvaImage) {
          initializeMaskHandler();
        }
      });
    } else {
      maskHandler.updateActiveClassId(activeClassId);
      maskHandler.updateClassColor(classColor);
    }

    setMaskBrushSize(maskHandler.getBrushSize());
    setMaskEraseMode(maskHandler.getEraseMode());
    setMaskBrushShape(maskHandler.getBrushShape());
    setMaskMaxBrushSize(maskHandler.getMaxBrushSize());
    // Registrar callbacks
    maskHandler.setMaskImageUpdateCallback(setMaskImage);
    maskHandler.setDirtyChangeCallback(setMaskDirty);
  }, [activeClassId, classColor]);

  useEffect(() => {
    if (selectedAnnotationIds.size === 0 || activeClassId === null) {
      prevActiveClassIdRef.current = activeClassId;
      return;
    }

    const previousClassId = prevActiveClassIdRef.current;
    prevActiveClassIdRef.current = activeClassId;

    if (previousClassId === activeClassId) {
      return;
    }

    for (const id of selectedAnnotationIds) {
      const ann = annotations.find((a) => a.id === id);
      if (ann && ann.classId !== activeClassId) {
        updateAnnotation(id, { classId: activeClassId });
      }
    }
  }, [activeClassId, selectedAnnotationIds, annotations, updateAnnotation]);

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

    const applyImage = (img: HTMLImageElement) => {
      if (cancelled) return;
      setKonvaImage(img);
      imageElementRef.current = img;
      originalImageRef.current = img;
      setProcessedImage(null);
      const saved = image.id ? adjustmentsMapRef.current.get(image.id) : undefined;
      setImageAdjustments(saved ? { ...saved } : { ...DEFAULT_ADJUSTMENTS });

      const tryFit = (attempt: number) => {
        if (cancelled) return;
        const el = containerRef.current;
        const containerWidth = el?.clientWidth ?? 0;
        const containerHeight = el?.clientHeight ?? 0;
        if (!el || containerWidth === 0 || containerHeight === 0) {
          if (attempt < 30) requestAnimationFrame(() => tryFit(attempt + 1));
          return;
        }
        const scaleX = containerWidth / img.width;
        const scaleY = containerHeight / img.height;
        const newScale = Math.min(scaleX, scaleY);
        const scaledWidth = img.width * newScale;
        const scaledHeight = img.height * newScale;
        const offsetX = (containerWidth - scaledWidth) / 2;
        const offsetY = (containerHeight - scaledHeight) / 2;
        setScale(newScale);
        setImageOffset({ x: offsetX, y: offsetY });
        setStageSize({ width: containerWidth, height: containerHeight });
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
      };
      tryFit(0);
    };

    const loadViaAssetProtocol = () => {
      imageService.getFilePath(image.projectId, image.id!).then((filePath) => {
        if (cancelled) return;
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => applyImage(img);
        // Fallback: si asset protocol falla (paths con espacios en Windows, scope, etc.)
        img.onerror = () => {
          if (cancelled) return;
          loadViaBytes();
        };
        img.src = convertFileSrc(filePath);
      });
    };

    const loadViaBytes = () => {
      imageService.getImageData(image.projectId, image.id!).then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes as unknown as BlobPart]);
        const url = URL.createObjectURL(blob);
        const img = new window.Image();
        img.onload = () => {
          applyImage(img);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }).catch(err => console.error('Failed to load image bytes:', err));
    };

    loadViaAssetProtocol();

    return () => {
      cancelled = true;
    };
  }, [image?.id]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    let lastW = 0;
    let lastH = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 600;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      const base = originalImageRef.current;
      if (base && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight || 600;

        const scaleX = containerWidth / base.width;
        const scaleY = containerHeight / base.height;
        const newScale = Math.min(scaleX, scaleY);

        const scaledWidth = base.width * newScale;
        const scaledHeight = base.height * newScale;
        const offsetX = (containerWidth - scaledWidth) / 2;
        const offsetY = (containerHeight - scaledHeight) / 2;

        setScale(newScale);
        setImageOffset({ x: offsetX, y: offsetY });
        setStageSize({ width: containerWidth, height: containerHeight });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [image?.id]);

  // Recentrar al cambiar modo de galería (el layout cambia sin cambiar la imagen)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const base = originalImageRef.current;
      if (!base || !containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight || 600;
      if (containerWidth === 0 || containerHeight === 0) return;
      const scaleX = containerWidth / base.width;
      const scaleY = containerHeight / base.height;
      const newScale = Math.min(scaleX, scaleY);
      const scaledWidth = base.width * newScale;
      const scaledHeight = base.height * newScale;
      const offsetX = (containerWidth - scaledWidth) / 2;
      const offsetY = (containerHeight - scaledHeight) / 2;
      setScale(newScale);
      setImageOffset({ x: offsetX, y: offsetY });
      setStageSize({ width: containerWidth, height: containerHeight });
    });
    return () => cancelAnimationFrame(id);
  }, [galleryMode]);

  // Update transformer when selection changes
  useEffect(() => {
    if (selectedAnnotationIds.size > 0 && trRef.current && stageRef.current) {
      const stage = stageRef.current;
      const nodes = [...selectedAnnotationIds]
        .map(id => stage.findOne('#ann-' + id))
        .filter(Boolean);
      if (nodes.length > 0) {
        trRef.current.nodes(nodes);
        trRef.current.getLayer().batchDraw();
      } else {
        trRef.current.nodes([]);
      }
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selectedAnnotationIds, annotations]);

  // Handle zoom with mouse wheel
  const handleWheel = (e: any) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    // Shift+scroll: ignorar (evita zoom accidental por scroll horizontal)
    if (e.evt.shiftKey) return;

    // Si es proyecto mask y se presiona Ctrl, ajustar tamaño de pincel
    if (project?.type === 'mask' && e.evt.ctrlKey && maskHandler) {
      const delta = e.evt.deltaY > 0 ? -2 : 2; // Invertir para que scroll up = más grande
      const currentSize = maskHandler.getBrushSize();
      const maxSize = maskHandler.getMaxBrushSize();
      const newSize = Math.max(1, Math.min(maxSize, currentSize + delta));
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
    if (clampedScale <= MIN_ZOOM_SCALE) {
      setStagePos({ x: 0, y: 0 });
    } else {
      setStagePos({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    }
  };

  // Handle stage drag
  const handleDragEnd = (e: any) => {
    if (e.target === e.target.getStage()) {
      if (stageScale <= MIN_ZOOM_SCALE) {
        e.target.position({ x: 0, y: 0 });
        setStagePos({ x: 0, y: 0 });
      } else {
        setStagePos({
          x: e.target.x(),
          y: e.target.y(),
        });
      }
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

  // Middle-click: reclasificar isla de píxeles a la clase activa
  const handleMiddleClickReclassify = useCallback(async (e: any) => {
    if (!konvaImage || !stageRef.current || activeClassId === null) return;
    const coords = getImageCoordinates(stageRef.current);
    if (!coords) return;

    // Guardar máscara en edición antes de reclasificar
    if (maskHandler.isActive() && maskHandler.getDrawingClassId() !== null) {
      await maskHandler.finish();
    }

    const currentAnns = useAnnotationStore.getState().annotations;
    const result = await reclassifyIsland(
      coords.imageX,
      coords.imageY,
      konvaImage.width,
      konvaImage.height,
      activeClassId,
      classColor,
      currentAnns,
    );

    if (result.changed) {
      captureSaveContext(image?.id || null, project?.id || null);
      await replaceAnnotations(result.updatedAnnotations);
      // Reinicializar el mask handler con la máscara actualizada
      if (activeTool === 'mask') {
        initializeMaskHandler();
      }
    }
  }, [konvaImage, activeClassId, classColor, image?.id, project?.id, maskHandler, activeTool,
      getImageCoordinates, replaceAnnotations, initializeMaskHandler]);

  // Handle mouse down for drawing
  const handleMouseDown = (e: any) => {
    // Middle button → start panning
    if (e.evt.button === 1) {
      e.evt.preventDefault();
      middlePanRef.current = {
        active: true,
        startX: e.evt.clientX,
        startY: e.evt.clientY,
        startPosX: stagePos.x,
        startPosY: stagePos.y,
        moved: false,
      };
      return;
    }

    const clickedOnEmpty = e.target === e.target.getStage();
    const clickedOnImage = e.target.getClassName() === 'Image';

    if (clickedOnEmpty || clickedOnImage) {
      // SAM Assist: si el click cae sobre una máscara candidata, no iniciar dibujo;
      // el usuario debe presionar una clase para confirmar (lo gestiona useSamClassAccept).
      if (samAssistActive && useSamStore.getState().hoverMaskId) {
        return;
      }
      // SAM Refine: el SamRefineLayer captura los eventos. No disparar handler de tool.
      if (samAssistActive && useSamStore.getState().refineMode) {
        return;
      }

      selectAnnotation(null, false);

      if (activeTool === 'mask' && konvaImage) {
        // Reinicializar si no está activo O si la clase cambió
        if (!maskHandler.isActive() || maskHandler.getDrawingClassId() !== activeClassId) {
          if (maskHandler.isActive()) {
            maskHandler.finish();
          }
          initializeMaskHandler();
        }
      }

      if (currentHandler && stageRef.current) {
        // CRÍTICO: Capturar contexto ANTES de empezar a dibujar
        captureSaveContext(image?.id || null, project?.id || null);

        const coords = getImageCoordinates(stageRef.current);
        if (coords) {
          currentHandler.onMouseDown(coords);
        }
      }
    }
  };

  // Handle mouse move for drawing
  const handleMouseMove = (e: any) => {
    // Middle-button pan
    if (middlePanRef.current?.active) {
      const dx = e.evt.clientX - middlePanRef.current.startX;
      const dy = e.evt.clientY - middlePanRef.current.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        middlePanRef.current.moved = true;
      }
      setStagePos({
        x: middlePanRef.current.startPosX + dx,
        y: middlePanRef.current.startPosY + dy,
      });
      return;
    }

    if (!stageRef.current) return;

    const coords = getImageCoordinates(stageRef.current);
    if (coords) {
      // SAM Assist: actualizar hover (no interfiere con tool actual).
      if (samAssistActive && image) {
        const hit = samHitTest(coords.imageX, coords.imageY, image.width, image.height);
        setSamHover(hit);
      }

      if (currentHandler) {
        currentHandler.onMouseMove(coords);
      }

      // Crosshair para herramientas de dibujo de cajas
      if ((activeTool === 'bbox' || activeTool === 'obb') && image) {
        const insideImage =
          coords.imageX >= 0 &&
          coords.imageY >= 0 &&
          coords.imageX <= image.width &&
          coords.imageY <= image.height;
        setCrosshairPos({ x: coords.canvasX, y: coords.canvasY, visible: insideImage });
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
  const handleMouseUp = (e: any) => {
    // Middle-button pan end
    if (middlePanRef.current?.active) {
      const wasDrag = middlePanRef.current.moved;
      middlePanRef.current = null;
      if (stageScale <= MIN_ZOOM_SCALE) {
        setStagePos({ x: 0, y: 0 });
      }
      // If it was a click (no drag) on a mask project, reclassify
      if (!wasDrag && project?.type === 'mask') {
        handleMiddleClickReclassify(e);
      }
      return;
    }

    if (!currentHandler || !stageRef.current) return;

    const coords = getImageCoordinates(stageRef.current);
    if (coords) {
      currentHandler.onMouseUp(coords);
    }
  };

  // Handle annotation drag (si es AI, pasa a ser del usuario)
  const handleAnnotationDragEnd = (id: string, e: any) => {
    const node = e.target;
    const x = (node.x() - imageOffset.x) / scale;
    const y = (node.y() - imageOffset.y) / scale;
    const width = node.width() / scale;
    const height = node.height() / scale;

    const ann = annotations.find(a => a.id === id);
    updateAnnotation(id, {
      data: { x, y, width, height },
      ...(ann?.source === 'ai' ? { source: 'user' as const, confidence: undefined } : {}),
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

    const ann = annotations.find(a => a.id === id);
    updateAnnotation(id, {
      data: { x, y, width, height },
      ...(ann?.source === 'ai' ? { source: 'user' as const, confidence: undefined } : {}),
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

  // Refs para modificadores temporales (Shift=borrador, Alt=pan)
  const modifierStateRef = useRef<{
    shiftHeld: boolean;
    altHeld: boolean;
    prevEraseMode: boolean | null;
    prevTool: ToolId | null;
  }>({ shiftHeld: false, altHeld: false, prevEraseMode: null, prevTool: null });

  // Keyboard shortcuts for handlers
  useEffect(() => {
    const mod = modifierStateRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handler specific shortcuts (Enter/Escape)
      if (currentHandler && currentHandler.isActive()) {
        if (matchesShortcut(e, 'confirm-drawing') && currentHandler.finish) {
          currentHandler.finish();
        } else if (matchesShortcut(e, 'cancel-drawing') && currentHandler.cancel) {
          currentHandler.cancel();
        }
      }

      // Mask-specific shortcuts (solo en proyectos con mask)
      if (project?.type === 'mask' && maskHandler) {
        // [ / ]: Ajustar tamaño de pincel
        if (e.key === '[') {
          e.preventDefault();
          const currentSize = maskHandler.getBrushSize();
          maskHandler.setBrushSize(currentSize - 5);
          setMaskBrushSize(maskHandler.getBrushSize());
          return;
        }
        if (e.key === ']') {
          e.preventDefault();
          const currentSize = maskHandler.getBrushSize();
          maskHandler.setBrushSize(currentSize + 5);
          setMaskBrushSize(maskHandler.getBrushSize());
          return;
        }

        // E: Toggle modo borrador
        if (matchesShortcut(e, 'mask-erase-toggle')) {
          e.preventDefault();
          const newMode = maskHandler.toggleEraseMode();
          setMaskEraseMode(newMode);
          return;
        }

        // Shift mantenido: borrador temporal
        if (e.key === 'Shift' && !mod.shiftHeld && activeTool === 'mask') {
          mod.shiftHeld = true;
          mod.prevEraseMode = maskHandler.getEraseMode();
          if (!mod.prevEraseMode) {
            maskHandler.setEraseMode(true);
            setMaskEraseMode(true);
          }
          return;
        }

        // Alt mantenido: pan temporal
        if (e.key === 'Alt' && !mod.altHeld) {
          e.preventDefault();
          mod.altHeld = true;
          mod.prevTool = activeTool as ToolId;
          setActiveTool('pan');
          return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (project?.type !== 'mask' || !maskHandler) return;

      // Soltar Shift: restaurar modo anterior
      if (e.key === 'Shift' && mod.shiftHeld) {
        mod.shiftHeld = false;
        if (mod.prevEraseMode !== null) {
          maskHandler.setEraseMode(mod.prevEraseMode);
          setMaskEraseMode(mod.prevEraseMode);
          mod.prevEraseMode = null;
        }
        return;
      }

      // Soltar Alt: restaurar herramienta anterior
      if (e.key === 'Alt' && mod.altHeld) {
        e.preventDefault();
        mod.altHeld = false;
        if (mod.prevTool) {
          setActiveTool(mod.prevTool);
          mod.prevTool = null;
        }
        return;
      }
    };

    // Limpiar modificadores si la ventana pierde foco
    const handleBlur = () => {
      if (mod.shiftHeld && maskHandler) {
        mod.shiftHeld = false;
        if (mod.prevEraseMode !== null) {
          maskHandler.setEraseMode(mod.prevEraseMode);
          setMaskEraseMode(mod.prevEraseMode);
          mod.prevEraseMode = null;
        }
      }
      if (mod.altHeld) {
        mod.altHeld = false;
        if (mod.prevTool) {
          setActiveTool(mod.prevTool);
          mod.prevTool = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [currentHandler, project?.type, maskHandler, activeTool]);

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
    setStageScale(prev => {
      const next = Math.max(MIN_ZOOM_SCALE, prev / 1.2);
      if (next <= MIN_ZOOM_SCALE) setStagePos({ x: 0, y: 0 });
      return next;
    });
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

  // ─── Apply CSS filters (brightness, contrast, temperature) to image layer ──
  useEffect(() => {
    if (!imageLayerRef.current) return;
    const canvas = imageLayerRef.current.getCanvas()?._canvas as HTMLCanvasElement | undefined;
    if (!canvas) return;
    canvas.style.filter = buildCSSFilter(imageAdjustments);
  }, [imageAdjustments.brightness, imageAdjustments.contrast, imageAdjustments.temperature]);

  // ─── Process CLAHE / Sharpness (pixel-level, debounced) ──────────────────
  useEffect(() => {
    if (!originalImageRef.current) return;
    const orig = originalImageRef.current;

    if (imageAdjustments.clahe === 0 && imageAdjustments.sharpness === 0) {
      if (processedImage) {
        setProcessedImage(null);
        setKonvaImage(orig);
      }
      return;
    }

    if (!project?.id || !image?.id) return;
    const projId = project.id;
    const imgId = image.id;

    let cancelled = false;
    const timer = setTimeout(() => {
      tauriDb.processImageFilters(
        projId,
        imgId,
        imageAdjustments.clahe,
        imageAdjustments.sharpness,
      ).then((dataUrl) => {
        if (cancelled) return;
        const img = new window.Image();
        img.onload = () => {
          if (cancelled) return;
          setProcessedImage(img);
          setKonvaImage(img);
        };
        img.src = dataUrl;
      }).catch((err) => {
        console.error('processImageFilters failed:', err);
      });
    }, 150); // debounce

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [imageAdjustments.clahe, imageAdjustments.sharpness, project?.id, image?.id]);

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
      className="annotix-canvas-container"
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
    >
      <div ref={containerRef} className="annotix-canvas-stage-area">
      {/* Floating Tools (Left) */}
      <FloatingTools
        maskBrushSize={maskBrushSize}
        maskEraseMode={maskEraseMode}
        maskBrushShape={maskBrushShape}
        maskMaxBrushSize={maskMaxBrushSize}
        maskDirty={maskDirty}
        onMaskBrushSizeChange={(size) => {
          maskHandler.setBrushSize(size);
          setMaskBrushSize(maskHandler.getBrushSize());
        }}
        onMaskSetEraseMode={(erase) => {
          maskHandler.setEraseMode(erase);
          setMaskEraseMode(erase);
        }}
        onMaskToggleBrushShape={() => {
          const newShape = maskHandler.toggleBrushShape();
          setMaskBrushShape(newShape);
        }}
        inferenceAvailable={inferenceModels.length > 0 && !!inferenceModel}
        inferenceRunning={inferenceRunning}
        inferenceModelName={inferenceModel?.name}
        onRunInference={handleRunInference}
      />

      {/* Floating Zoom Controls (Right) */}
      <FloatingZoomControls
        zoom={stageScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleResetZoom}
      />

      {/* Image Adjustments (Below Zoom Controls) */}
      <ImageAdjustments
        values={imageAdjustments}
        onChange={handleSetImageAdjustments}
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
                <span className="font-medium text-[var(--annotix-dark)]" title={image.name}>
                  {image.name.length > 14 ? image.name.slice(0, 10) + '...' + image.name.slice(image.name.lastIndexOf('.')) : image.name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--annotix-gray)' }}>
                <i className="fas fa-expand-arrows-alt"></i>
                <span>{image.width} × {image.height}</span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--annotix-gray)' }}>
                <i className="fas fa-layer-group"></i>
                <span>{annotations.length} {t('annotations.title')}</span>
              </div>
              {aiAnnotationsCount > 0 && (
                <div className="flex items-center gap-2 text-xs" style={{ color: '#a855f7' }}>
                  <i className="fas fa-robot"></i>
                  <span>{aiAnnotationsCount} AI</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Image Navigation (Circular buttons) - hidden during video playback (timeline handles navigation) */}
      {!videoFrameInfo && (
        <div style={{ position: 'absolute', top: '50%', left: '0', right: '0', transform: 'translateY(-50%)', zIndex: 50, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
            <ImageNavigation />
          </div>
        </div>
      )}

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
        draggable={activeTool === 'pan'}
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
          middlePanRef.current = null;
          if (activeTool === 'mask') {
            setMaskCursor((prev) => ({ ...prev, visible: false }));
          }
          if (activeTool === 'bbox' || activeTool === 'obb') {
            setCrosshairPos((prev) => ({ ...prev, visible: false }));
          }
        }}
      >
        {/* Image Layer */}
        <Layer ref={imageLayerRef}>
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
        <Layer visible={annotationsVisible}>
          {annotations.map((ann) => {
            if (hiddenAnnotationIds.has(ann.id)) return null;
            const classInfo = project.classes.find(c => c.id === ann.classId);
            if (!classInfo) return null;

            const isSelected = selectedAnnotationIds.has(ann.id);
            const isDisabled = overrideAnnotations?.disabledAnnotationIds?.has(ann.id) ?? false;
            const annColor = isDisabled ? '#999999' : classInfo.color;

            const renderLabel = (x: number, y: number) => {
              if (!showLabels) return null;
              const padX = 4;
              const padY = 2;
              const fontSize = 12;
              const text = classInfo.name;
              const textWidth = text.length * (fontSize * 0.6);
              return (
                <Group x={x} y={y - (fontSize + padY * 2) - 2} listening={false}>
                  <Rect
                    width={textWidth + padX * 2}
                    height={fontSize + padY * 2}
                    fill={annColor}
                    cornerRadius={3}
                    opacity={0.9}
                  />
                  <Text
                    x={padX}
                    y={padY}
                    text={text}
                    fontSize={fontSize}
                    fill="white"
                    fontStyle="bold"
                  />
                </Group>
              );
            };
            const commonProps = {
              scale,
              imageOffset,
              color: annColor,
              isSelected,
              listening: activeTool !== 'mask',
              onClick: (e: any) => {
                const shiftKey = e?.evt?.shiftKey ?? false;
                selectAnnotation(ann.id, shiftKey);
              },
            };

            switch (ann.type) {
              case 'bbox': {
                const rawData = ann.data as BBoxData;
                const isAI = ann.source === 'ai';

                // Todas las anotaciones (AI y manuales) usan píxeles absolutos
                const bboxData: BBoxData = rawData;

                const toggleFn = overrideAnnotations?.onToggleAnnotation;
                const btnX = bboxData.x * scale + imageOffset.x + bboxData.width * scale - 20;
                const btnY = bboxData.y * scale + imageOffset.y + 2;

                return (
                  <React.Fragment key={ann.id}>
                    <BBoxRenderer
                      id={'ann-' + ann.id}
                      data={bboxData}
                      {...commonProps}
                      draggable={activeTool !== 'pan' && isSelected && !isDisabled}
                      onDragEnd={(e) => handleAnnotationDragEnd(ann.id, e)}
                      onTransformEnd={(e) => handleAnnotationTransform(ann.id, e)}
                    />
                    {/* Borde punteado para AI */}
                    {isAI && (
                      <Rect
                        x={bboxData.x * scale + imageOffset.x}
                        y={bboxData.y * scale + imageOffset.y}
                        width={bboxData.width * scale}
                        height={bboxData.height * scale}
                        stroke={annColor}
                        strokeWidth={1}
                        dash={[5, 3]}
                        listening={false}
                      />
                    )}
                    {renderLabel(bboxData.x * scale + imageOffset.x, bboxData.y * scale + imageOffset.y)}
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

              case 'obb': {
                const obbData = ann.data as OBBData;
                return (
                  <React.Fragment key={ann.id}>
                    <OBBRenderer
                      id={'ann-' + ann.id}
                      data={obbData}
                      {...commonProps}
                      draggable={activeTool !== 'pan' && isSelected}
                      onDragEnd={(e) => handleOBBDragEnd(ann.id, e)}
                      onTransformEnd={(e) => handleOBBTransform(ann.id, e)}
                    />
                    {renderLabel(
                      (obbData.x - obbData.width / 2) * scale + imageOffset.x,
                      (obbData.y - obbData.height / 2) * scale + imageOffset.y
                    )}
                  </React.Fragment>
                );
              }

              case 'polygon': {
                const polyData = ann.data as PolygonData;
                const minX = polyData.points.length ? Math.min(...polyData.points.map(p => p.x)) : 0;
                const minY = polyData.points.length ? Math.min(...polyData.points.map(p => p.y)) : 0;
                return (
                  <React.Fragment key={ann.id}>
                    <PolygonRenderer
                      id={'ann-' + ann.id}
                      data={polyData}
                      {...commonProps}
                      draggable={activeTool !== 'pan' && isSelected}
                      onDragEnd={(e) => {
                        const group = e.target;
                        const dx = group.x() / scale;
                        const dy = group.y() / scale;
                        const updatedPoints = polyData.points.map(p => ({
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
                    {renderLabel(minX * scale + imageOffset.x, minY * scale + imageOffset.y)}
                  </React.Fragment>
                );
              }

              case 'keypoints': {
                const kpData = ann.data as KeypointsData;
                const anchor = kpData.points.find(p => p.visible) ?? kpData.points[0];
                return (
                  <React.Fragment key={ann.id}>
                    <KeypointsRenderer
                      data={kpData}
                      {...commonProps}
                    />
                    {anchor && renderLabel(anchor.x * scale + imageOffset.x, anchor.y * scale + imageOffset.y)}
                  </React.Fragment>
                );
              }

              case 'landmarks': {
                const lmData = ann.data as LandmarksData;
                const anchor = lmData.points[0];
                return (
                  <React.Fragment key={ann.id}>
                    <LandmarksRenderer
                      data={lmData}
                      {...commonProps}
                    />
                    {anchor && renderLabel(anchor.x * scale + imageOffset.x, anchor.y * scale + imageOffset.y)}
                  </React.Fragment>
                );
              }

              case 'mask':
                if (activeTool === 'mask' && ann.classId === activeClassId && maskHandler.isActive()) {
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
                  fill={classColor}
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
            maskBrushShape === 'circle' ? (
              <Circle
                x={maskCursor.x}
                y={maskCursor.y}
                radius={(maskBrushSize * scale) / 2}
                stroke={classColor}
                strokeWidth={maskEraseMode ? 2.5 : 2}
                dash={maskEraseMode ? [6, 4] : undefined}
                fill={maskEraseMode ? 'transparent' : `${classColor}55`}
                listening={false}
              />
            ) : (
              <Rect
                x={maskCursor.x - (maskBrushSize * scale) / 2}
                y={maskCursor.y - (maskBrushSize * scale) / 2}
                width={maskBrushSize * scale}
                height={maskBrushSize * scale}
                stroke={classColor}
                strokeWidth={maskEraseMode ? 2.5 : 2}
                dash={maskEraseMode ? [6, 4] : undefined}
                fill={maskEraseMode ? 'transparent' : `${classColor}55`}
                listening={false}
              />
            )
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

          {/* Crosshair para herramientas de dibujo de cajas */}
          {(activeTool === 'bbox' || activeTool === 'obb') && crosshairPos.visible && (
            <>
              <Line
                points={[crosshairPos.x, -10000, crosshairPos.x, 10000]}
                stroke={classColor}
                strokeWidth={0.5}
                opacity={0.5}
                dash={[6, 4]}
                listening={false}
              />
              <Line
                points={[-10000, crosshairPos.y, 10000, crosshairPos.y]}
                stroke={classColor}
                strokeWidth={0.5}
                opacity={0.5}
                dash={[6, 4]}
                listening={false}
              />
            </>
          )}
        </Layer>

        {/* SAM overlay (debajo del Transformer, encima de anotaciones) */}
        <SamOverlay
          imageWidth={konvaImage.width}
          imageHeight={konvaImage.height}
          imageOffsetX={imageOffset.x}
          imageOffsetY={imageOffset.y}
          scale={scale}
        />

        {/* SAM refine layer (PR7): captura mouse para puntos+bbox+preview */}
        <SamRefineLayer
          imageWidth={konvaImage.width}
          imageHeight={konvaImage.height}
          imageOffsetX={imageOffset.x}
          imageOffsetY={imageOffset.y}
          scale={scale}
        />

        {/* Transformer Layer */}
        <Layer>
          <Transformer
            ref={trRef}
            rotateEnabled={selectedAnnotationIds.size === 1 && annotations.find(a => a.id === [...selectedAnnotationIds][0])?.type === 'obb'}
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

      <SamFloatingPanel
        projectId={projectId}
        imageId={currentImageId}
        annotations={annotations}
      />

      </div>

      {/* Annotations Bar (Bottom) */}
      <AnnotationsBar image={konvaImage} />
    </div>
  );
}
