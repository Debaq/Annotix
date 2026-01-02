import { Annotation, ClassDefinition, KeypointsData } from '@/lib/db';
import { SKELETON_PRESETS } from '../data/skeletonPresets';

export function renderKeypoints(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  classInfo: ClassDefinition
): void {
  const data = annotation.data as KeypointsData;

  if (!data.points || data.points.length === 0) return;

  const preset = SKELETON_PRESETS[data.skeletonType];
  if (!preset) {
    console.error(`Skeleton preset not found: ${data.skeletonType}`);
    return;
  }

  ctx.save();

  // Draw connections (skeleton lines)
  ctx.strokeStyle = classInfo.color;
  ctx.lineWidth = 2;

  for (const [idx1, idx2] of preset.connections) {
    if (idx1 < data.points.length && idx2 < data.points.length) {
      const p1 = data.points[idx1];
      const p2 = data.points[idx2];

      // Only draw if both points are visible
      if (p1.visible && p2.visible) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  // Draw keypoints as circles
  for (const point of data.points) {
    if (!point.visible) continue;

    // Draw point
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = classInfo.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw label at first keypoint
  if (data.points[0] && data.points[0].visible) {
    const firstPoint = data.points[0];
    const label = `${classInfo.name}${data.instanceId ? ` #${data.instanceId}` : ''}`;
    const padding = 4;
    const fontSize = 12;

    ctx.font = `${fontSize}px sans-serif`;
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;

    // Label background
    ctx.fillStyle = classInfo.color;
    ctx.fillRect(
      firstPoint.x - textWidth / 2 - padding,
      firstPoint.y - 20 - fontSize - padding,
      textWidth + padding * 2,
      fontSize + padding * 2
    );

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, firstPoint.x, firstPoint.y - 20 - fontSize / 2);
  }

  ctx.restore();
}
