import { BaseTool, TransformContext } from './BaseTool';
import { Annotation } from '@/lib/db';

export class BBoxTool extends BaseTool {
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private tempBBox: { x: number; y: number; width: number; height: number } | null = null;

  onMouseDown(x: number, y: number, context: TransformContext): void {
    const canvas = this.screenToCanvas(x, y, context);
    this.startX = canvas.x;
    this.startY = canvas.y;
    this.currentX = canvas.x;
    this.currentY = canvas.y;
    this.isDrawing = true;
  }

  onMouseMove(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    const canvas = this.screenToCanvas(x, y, context);
    this.currentX = canvas.x;
    this.currentY = canvas.y;

    // Update temp bbox for rendering
    const minX = Math.min(this.startX, this.currentX);
    const minY = Math.min(this.startY, this.currentY);
    const maxX = Math.max(this.startX, this.currentX);
    const maxY = Math.max(this.startY, this.currentY);

    this.tempBBox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  onMouseUp(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    const canvas = this.screenToCanvas(x, y, context);
    this.currentX = canvas.x;
    this.currentY = canvas.y;

    // Calculate final bbox
    const minX = Math.min(this.startX, this.currentX);
    const minY = Math.min(this.startY, this.currentY);
    const maxX = Math.max(this.startX, this.currentX);
    const maxY = Math.max(this.startY, this.currentY);

    const width = maxX - minX;
    const height = maxY - minY;

    // Only create annotation if bbox has meaningful size
    if (width > 5 && height > 5) {
      // Dispatch event with annotation data
      const annotation: Omit<Annotation, 'id' | 'classId'> = {
        type: 'bbox',
        data: { x: minX, y: minY, width, height },
      };

      window.dispatchEvent(
        new CustomEvent('annotix:annotation-created', { detail: annotation })
      );
    }

    this.isDrawing = false;
    this.tempBBox = null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.tempBBox) return;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      this.tempBBox.x,
      this.tempBBox.y,
      this.tempBBox.width,
      this.tempBBox.height
    );
  }
}
