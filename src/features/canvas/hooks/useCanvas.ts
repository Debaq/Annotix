import { RefObject, useCallback, useRef, useEffect } from 'react';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useAnnotations } from './useAnnotations';
import { useCanvasTransform } from './useCanvasTransform';
import { useDrawingTool } from './useDrawingTool';
import { BBoxTool } from '../tools/BBoxTool';
import { MaskTool } from '../tools/MaskTool';
import { PolygonTool } from '../tools/PolygonTool';
import { KeypointsTool } from '../tools/KeypointsTool';
import { LandmarksTool } from '../tools/LandmarksTool';
import { OBBTool } from '../tools/OBBTool';
import { SelectTool } from '../tools/SelectTool';
import { PanTool } from '../tools/PanTool';
import { BaseTool } from '../tools/BaseTool';
import { renderBBox } from '../renderers/bboxRenderer';
import { renderMask } from '../renderers/maskRenderer';
import { renderPolygon } from '../renderers/polygonRenderer';
import { renderKeypoints } from '../renderers/keypointsRenderer';
import { renderLandmarks } from '../renderers/landmarksRenderer';
import { renderOBB } from '../renderers/obbRenderer';

export function useCanvas(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const { activeTool } = useUIStore();
  const { project } = useCurrentProject();
  const { annotations } = useAnnotations();
  const { zoom, panX, panY, transform } = useCanvasTransform();
  const { brushSize, eraseMode } = useDrawingTool();

  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentToolRef = useRef<BaseTool | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    if (!canvas || !ctx || !img || !project) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply transform
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw image
    ctx.drawImage(img, 0, 0);

    // Draw annotations
    annotations.forEach((annotation) => {
      const classInfo = project.classes.find((c) => c.id === annotation.classId);
      if (!classInfo) return;

      if (annotation.type === 'bbox') {
        renderBBox(ctx, annotation, classInfo);
      } else if (annotation.type === 'mask') {
        renderMask(ctx, annotation, classInfo);
      } else if (annotation.type === 'polygon') {
        renderPolygon(ctx, annotation, classInfo);
      } else if (annotation.type === 'keypoints') {
        renderKeypoints(ctx, annotation, classInfo);
      } else if (annotation.type === 'landmarks') {
        renderLandmarks(ctx, annotation, classInfo);
      } else if (annotation.type === 'obb') {
        renderOBB(ctx, annotation, classInfo);
      }
    });

    // Let tool render its overlay
    currentToolRef.current?.render(ctx);

    ctx.restore();
  }, [canvasRef, project, annotations, zoom, panX, panY]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      render();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);

  // Tool management
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;

    // Create tool instance
    let tool: BaseTool;

    switch (activeTool) {
      case 'bbox':
        tool = new BBoxTool();
        break;
      case 'mask':
        tool = new MaskTool(brushSize, eraseMode);
        break;
      case 'polygon':
        tool = new PolygonTool();
        break;
      case 'keypoints':
        tool = new KeypointsTool('coco-17'); // Default skeleton
        break;
      case 'landmarks':
        tool = new LandmarksTool(['Point 1', 'Point 2', 'Point 3']); // Default landmarks
        break;
      case 'obb':
        tool = new OBBTool();
        break;
      case 'select':
        tool = new SelectTool();
        break;
      case 'pan':
        tool = new PanTool(transform);
        break;
      default:
        return;
    }

    currentToolRef.current = tool;

    // Mouse event handlers
    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      tool.onMouseDown(x, y, { zoom, panX, panY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      tool.onMouseMove(x, y, { zoom, panX, panY });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      tool.onMouseUp(x, y, { zoom, panX, panY });
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        // Zoom handled by useCanvasTransform
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      currentToolRef.current = null;
    };
  }, [canvasRef, activeTool, project, zoom, panX, panY, brushSize, eraseMode, transform]);

  const setupCanvas = useCallback(
    (image: AnnotixImage) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Set canvas size with device pixel ratio
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      // Load image
      const img = new Image();
      const url = URL.createObjectURL(image.image);

      img.onload = () => {
        imageRef.current = img;
        URL.revokeObjectURL(url);
      };

      img.src = url;
    },
    [canvasRef]
  );

  const cleanup = useCallback(() => {
    imageRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  return { setupCanvas, cleanup, currentTool: currentToolRef.current };
}
