import { Annotation, ClassDefinition, LandmarksData } from '@/lib/db';

export function renderLandmarks(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  classInfo: ClassDefinition
): void {
  const data = annotation.data as LandmarksData;

  if (!data.points || data.points.length === 0) return;

  ctx.save();

  // Draw landmarks as circles
  for (const point of data.points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = classInfo.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw landmark name
    ctx.fillStyle = classInfo.color;
    ctx.font = 'bold 11px sans-serif';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(point.name, point.x + 8, point.y - 8);
    ctx.fillText(point.name, point.x + 8, point.y - 8);
  }

  // Draw label at first landmark
  if (data.points[0]) {
    const firstPoint = data.points[0];
    const label = classInfo.name;
    const padding = 4;
    const fontSize = 12;

    ctx.font = `${fontSize}px sans-serif`;
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;

    // Label background
    ctx.fillStyle = classInfo.color;
    ctx.fillRect(
      firstPoint.x - textWidth / 2 - padding,
      firstPoint.y - 25 - fontSize - padding,
      textWidth + padding * 2,
      fontSize + padding * 2
    );

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, firstPoint.x, firstPoint.y - 25 - fontSize / 2);
  }

  ctx.restore();
}
