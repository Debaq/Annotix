import { Annotation, ClassDefinition } from '@/lib/db';

const maskImageCache = new Map<string, HTMLImageElement>();

export function renderMask(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  classInfo: ClassDefinition
): void {
  const maskData = (annotation.data as any)?.base64png || (annotation.data as any) as string;

  // Check cache
  let img = maskImageCache.get(annotation.id);

  if (!img) {
    // Create new image
    img = new Image();
    img.src = maskData;
    maskImageCache.set(annotation.id, img);

    // Image might not be loaded yet on first render
    if (!img.complete) {
      img.onload = () => {
        // Trigger re-render when image loads
        // This is handled by the animation loop in useCanvas
      };
      return;
    }
  }

  // Draw mask with color overlay
  ctx.save();

  // Draw mask
  ctx.globalAlpha = 0.5;
  ctx.drawImage(img, 0, 0);

  // Apply color tint
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = classInfo.color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.restore();
}
