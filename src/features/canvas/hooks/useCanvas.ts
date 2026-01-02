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
  const { zoom, panX, panY, transform, setZoom, setPan } = useCanvasTransform();
  const { brushSize, eraseMode } = useDrawingTool();

  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentToolRef = useRef<BaseTool | null>(null);

  // Keep reference to latest render function to avoid dependency cycles in setupCanvas
  const renderRef = useRef<() => void>(() => {});

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    if (!canvas || !ctx || !img || !project) return;

    const dpr = window.devicePixelRatio || 1;

    // Reset transform to identity and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply DPR scale
    ctx.scale(dpr, dpr);

    // Apply user transform
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

  // Update render ref
  useEffect(() => {
    renderRef.current = render;
  }, [render]);

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

      // Initial size setup is now handled by the ResizeObserver effect below
      // but we still need to load the image
      
      const img = new Image();
      const url = URL.createObjectURL(image.image);

      img.onload = () => {
        imageRef.current = img;
        URL.revokeObjectURL(url);
        
        // Fit image to screen
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const scaleX = rect.width / img.width;
          const scaleY = rect.height / img.height;
          const scale = Math.min(scaleX, scaleY) * 0.9; // 90% fit
          
          const centerX = (rect.width - img.width * scale) / 2;
          const centerY = (rect.height - img.height * scale) / 2;
          
          setZoom(scale);
          setPan(centerX, centerY);
        }

        // Force render after image load
        renderRef.current();
      };

      img.src = url;
    },
    [canvasRef, setZoom, setPan]
  );

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    
    if (!canvas || !parent) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      
      // Update canvas buffer size to match display size (use Math.round to avoid float loops)
      const newWidth = Math.round(rect.width * dpr);
      const newHeight = Math.round(rect.height * dpr);

      let sizeChanged = false;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        sizeChanged = true;
      }

      // Re-fit image on resize if image is loaded
      const img = imageRef.current;
      if (img && rect.width > 0 && rect.height > 0) {
        const scaleX = rect.width / img.width;
        const scaleY = rect.height / img.height;
        const scale = Math.min(scaleX, scaleY) * 0.9; // 90% fit
        
        const centerX = (rect.width - img.width * scale) / 2;
        const centerY = (rect.height - img.height * scale) / 2;
        
        setZoom(scale);
        setPan(centerX, centerY);
      }
      
      if (sizeChanged || img) {
         render();
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(parent);
    
    // Initial sizing
    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasRef, render, setZoom, setPan]);

  const cleanup = useCallback(() => {
    imageRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  return { setupCanvas, cleanup, currentTool: currentToolRef.current };
}
