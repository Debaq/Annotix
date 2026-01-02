import { Annotation, ClassDefinition } from '@/lib/db';

export function renderBBox(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  classInfo: ClassDefinition
): void {
  const { x, y, width, height } = annotation.data as {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Draw filled rectangle with opacity
  ctx.fillStyle = classInfo.color + '33'; // Add alpha
  ctx.fillRect(x, y, width, height);

  // Draw border
  ctx.strokeStyle = classInfo.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Draw label
  const label = classInfo.name;
  const padding = 4;
  const fontSize = 12;

  ctx.font = `${fontSize}px sans-serif`;
  const textMetrics = ctx.measureText(label);
  const textWidth = textMetrics.width;

  // Label background
  ctx.fillStyle = classInfo.color;
  ctx.fillRect(x, y - fontSize - padding * 2, textWidth + padding * 2, fontSize + padding * 2);

  // Label text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x + padding, y - padding);
}
