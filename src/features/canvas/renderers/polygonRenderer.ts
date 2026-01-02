import { Annotation, ClassDefinition, PolygonData } from '@/lib/db';

export function renderPolygon(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  classInfo: ClassDefinition
): void {
  const data = annotation.data as PolygonData;

  if (!data.points || data.points.length < 2) return;

  ctx.save();

  // Draw filled polygon with opacity
  ctx.fillStyle = classInfo.color + '33'; // Add alpha
  ctx.strokeStyle = classInfo.color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(data.points[0].x, data.points[0].y);

  for (let i = 1; i < data.points.length; i++) {
    ctx.lineTo(data.points[i].x, data.points[i].y);
  }

  // Close polygon if specified
  if (data.closed !== false) {
    ctx.closePath();
    ctx.fill();
  }

  ctx.stroke();

  // Draw vertices as small circles
  ctx.fillStyle = classInfo.color;
  for (const point of data.points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw label at centroid
  if (data.points.length >= 3) {
    const centroid = calculateCentroid(data.points);
    const label = classInfo.name;
    const padding = 4;
    const fontSize = 12;

    ctx.font = `${fontSize}px sans-serif`;
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;

    // Label background
    ctx.fillStyle = classInfo.color;
    ctx.fillRect(
      centroid.x - textWidth / 2 - padding,
      centroid.y - fontSize / 2 - padding,
      textWidth + padding * 2,
      fontSize + padding * 2
    );

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, centroid.x, centroid.y);
  }

  ctx.restore();
}

function calculateCentroid(points: { x: number; y: number }[]): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;

  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }

  return {
    x: sumX / points.length,
    y: sumY / points.length,
  };
}
