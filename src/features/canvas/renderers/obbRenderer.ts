import { Annotation, ClassDefinition, OBBData } from '@/lib/db';

export function renderOBB(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  classInfo: ClassDefinition
): void {
  const data = annotation.data as OBBData;

  ctx.save();

  // Translate to center
  ctx.translate(data.x, data.y);
  // Apply rotation
  ctx.rotate((data.rotation * Math.PI) / 180);

  // Draw filled rectangle with opacity
  ctx.fillStyle = classInfo.color + '33'; // Add alpha
  ctx.fillRect(-data.width / 2, -data.height / 2, data.width, data.height);

  // Draw border
  ctx.strokeStyle = classInfo.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-data.width / 2, -data.height / 2, data.width, data.height);

  // Draw rotation handle (small circle at top center)
  ctx.fillStyle = classInfo.color;
  ctx.beginPath();
  ctx.arc(0, -data.height / 2 - 10, 4, 0, Math.PI * 2);
  ctx.fill();

  // Draw line from top center to handle
  ctx.strokeStyle = classInfo.color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, -data.height / 2);
  ctx.lineTo(0, -data.height / 2 - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  // Draw label (not rotated)
  const label = `${classInfo.name} (${data.rotation.toFixed(0)}°)`;
  const padding = 4;
  const fontSize = 12;

  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  const textMetrics = ctx.measureText(label);
  const textWidth = textMetrics.width;

  // Label background
  ctx.fillStyle = classInfo.color;
  ctx.fillRect(
    data.x - textWidth / 2 - padding,
    data.y - data.height / 2 - fontSize - padding * 2 - 20,
    textWidth + padding * 2,
    fontSize + padding * 2
  );

  // Label text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, data.x, data.y - data.height / 2 - fontSize / 2 - padding - 20);

  ctx.restore();
}
