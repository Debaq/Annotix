import { BaseTool, TransformContext } from './BaseTool';
import { Annotation, PolygonData } from '@/lib/db';

const CLOSE_DISTANCE_THRESHOLD = 10; // pixels
const MIN_POINTS = 3; // Minimum points to form a polygon

export class PolygonTool extends BaseTool {
  private points: { x: number; y: number }[] = [];
  private currentMousePos: { x: number; y: number } | null = null;
  private lastClickTime = 0;
  private isCompleted = false;

  onMouseDown(x: number, y: number, context: TransformContext): void {
    if (this.isCompleted) {
      // Reset for new polygon
      this.reset();
    }

    const canvas = this.screenToCanvas(x, y, context);

    // Check for double-click (close polygon)
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    this.lastClickTime = now;

    if (timeSinceLastClick < 300 && this.points.length >= MIN_POINTS) {
      // Double-click detected - complete polygon
      this.completePolygon();
      return;
    }

    // Check if clicking near first point to auto-close
    if (this.points.length >= MIN_POINTS) {
      const firstPoint = this.points[0];
      const distance = Math.hypot(canvas.x - firstPoint.x, canvas.y - firstPoint.y);

      if (distance < CLOSE_DISTANCE_THRESHOLD / context.zoom) {
        // Close polygon
        this.completePolygon();
        return;
      }
    }

    // Add new point
    this.points.push({ x: canvas.x, y: canvas.y });
  }

  onMouseMove(x: number, y: number, context: TransformContext): void {
    if (this.isCompleted) return;

    const canvas = this.screenToCanvas(x, y, context);
    this.currentMousePos = { x: canvas.x, y: canvas.y };
  }

  onMouseUp(_x: number, _y: number, _context: TransformContext): void {
    // Not used for polygon tool
  }

  private completePolygon(): void {
    if (this.points.length < MIN_POINTS) return;

    // Create annotation
    const annotation: Omit<Annotation, 'id' | 'classId'> = {
      type: 'polygon',
      data: {
        points: [...this.points],
        closed: true,
      } as PolygonData,
    };

    window.dispatchEvent(
      new CustomEvent('annotix:annotation-created', { detail: annotation })
    );

    this.isCompleted = true;
    this.currentMousePos = null;

    // Reset after a short delay to allow for new polygon
    setTimeout(() => this.reset(), 100);
  }

  private reset(): void {
    this.points = [];
    this.currentMousePos = null;
    this.isCompleted = false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.points.length === 0) return;

    ctx.save();

    // Draw lines between points
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);

    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }

    // Draw line to current mouse position
    if (this.currentMousePos && !this.isCompleted) {
      ctx.lineTo(this.currentMousePos.x, this.currentMousePos.y);
    }

    // Close the path if completed or near first point
    if (this.isCompleted || (this.points.length >= MIN_POINTS && this.currentMousePos)) {
      const firstPoint = this.points[0];
      if (this.currentMousePos) {
        const distance = Math.hypot(
          this.currentMousePos.x - firstPoint.x,
          this.currentMousePos.y - firstPoint.y
        );
        if (distance < CLOSE_DISTANCE_THRESHOLD) {
          ctx.lineTo(firstPoint.x, firstPoint.y);
          ctx.fill();
        }
      }
    }

    ctx.stroke();

    // Draw points as circles
    ctx.fillStyle = '#00ff00';
    for (let i = 0; i < this.points.length; i++) {
      ctx.beginPath();
      ctx.arc(this.points[i].x, this.points[i].y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Highlight first point
      if (i === 0 && this.points.length >= MIN_POINTS) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.points[i].x, this.points[i].y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw current mouse position
    if (this.currentMousePos && !this.isCompleted) {
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(this.currentMousePos.x, this.currentMousePos.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Public method to cancel current polygon (e.g., on Esc key)
  public cancel(): void {
    this.reset();
  }
}
