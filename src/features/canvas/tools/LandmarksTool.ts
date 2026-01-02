import { BaseTool, TransformContext } from './BaseTool';
import { Annotation, LandmarksData } from '@/lib/db';

export class LandmarksTool extends BaseTool {
  private points: { x: number; y: number; name: string }[] = [];
  private currentMousePos: { x: number; y: number } | null = null;
  private landmarkNames: string[] = []; // List of landmark names to place

  constructor(landmarkNames: string[] = ['Point 1', 'Point 2', 'Point 3']) {
    super();
    this.landmarkNames = landmarkNames;
  }

  onMouseDown(x: number, y: number, context: TransformContext): void {
    const canvas = this.screenToCanvas(x, y, context);

    // Add new landmark
    const landmarkName =
      this.landmarkNames[this.points.length] || `Point ${this.points.length + 1}`;
    this.points.push({ x: canvas.x, y: canvas.y, name: landmarkName });

    // If all landmarks are placed, create annotation
    if (this.points.length >= this.landmarkNames.length) {
      this.completeAnnotation();
    }
  }

  onMouseMove(x: number, y: number, context: TransformContext): void {
    const canvas = this.screenToCanvas(x, y, context);
    this.currentMousePos = { x: canvas.x, y: canvas.y };
  }

  onMouseUp(_x: number, _y: number, _context: TransformContext): void {
    // Not used for landmarks tool
  }

  private completeAnnotation(): void {
    // Create annotation
    const annotation: Omit<Annotation, 'id' | 'classId'> = {
      type: 'landmarks',
      data: {
        points: [...this.points],
      } as LandmarksData,
    };

    window.dispatchEvent(
      new CustomEvent('annotix:annotation-created', { detail: annotation })
    );

    this.reset();
  }

  private reset(): void {
    this.points = [];
    this.currentMousePos = null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Draw placed landmarks
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];

      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff00ff'; // Magenta for landmarks
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw landmark name
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.fillText(point.name, point.x + 8, point.y - 8);
    }

    // Draw guide for next landmark
    if (this.points.length < this.landmarkNames.length) {
      const nextLandmarkName = this.landmarkNames[this.points.length];
      ctx.fillStyle = 'rgba(255, 0, 255, 0.8)';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(
        `Place: ${nextLandmarkName} (${this.points.length + 1}/${this.landmarkNames.length})`,
        10,
        30
      );

      // Draw cursor preview
      if (this.currentMousePos) {
        ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(this.currentMousePos.x, this.currentMousePos.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Public method to cancel current annotation
  public cancel(): void {
    this.reset();
  }

  // Public method to set landmark names
  public setLandmarkNames(names: string[]): void {
    this.landmarkNames = names;
    this.reset();
  }
}
