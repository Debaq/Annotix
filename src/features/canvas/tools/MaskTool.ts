import { BaseTool, TransformContext } from './BaseTool';
import { Annotation } from '@/lib/db';

export class MaskTool extends BaseTool {
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private brushSize: number,
    private eraseMode: boolean
  ) {
    super();

    // Create temporary mask canvas
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 2048;
    this.maskCanvas.height = 2048;
    this.maskCtx = this.maskCanvas.getContext('2d')!;
  }

  onMouseDown(x: number, y: number, context: TransformContext): void {
    const canvas = this.screenToCanvas(x, y, context);
    this.lastX = canvas.x;
    this.lastY = canvas.y;
    this.isDrawing = true;

    // Draw initial point
    this.drawBrush(canvas.x, canvas.y);
  }

  onMouseMove(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    const canvas = this.screenToCanvas(x, y, context);

    // Draw line from last point to current (for smooth strokes)
    this.drawLine(this.lastX, this.lastY, canvas.x, canvas.y);

    this.lastX = canvas.x;
    this.lastY = canvas.y;
  }

  onMouseUp(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    this.isDrawing = false;

    // Convert mask canvas to base64
    const maskData = this.maskCanvas.toDataURL('image/png');

    // Check if mask has any content
    const imageData = this.maskCtx.getImageData(
      0,
      0,
      this.maskCanvas.width,
      this.maskCanvas.height
    );
    const hasContent = imageData.data.some((value, index) => {
      // Check alpha channel (every 4th value)
      return index % 4 === 3 && value > 0;
    });

    if (hasContent) {
      // Dispatch event with annotation data
      const annotation: Omit<Annotation, 'id' | 'classId'> = {
        type: 'mask',
        data: { base64png: maskData } as any,
      };

      window.dispatchEvent(
        new CustomEvent('annotix:annotation-created', { detail: annotation })
      );

      // Clear mask canvas for next annotation
      this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    }
  }

  private drawBrush(x: number, y: number): void {
    this.maskCtx.globalCompositeOperation = this.eraseMode
      ? 'destination-out'
      : 'source-over';

    this.maskCtx.fillStyle = '#ffffff';
    this.maskCtx.beginPath();
    this.maskCtx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
    this.maskCtx.fill();
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number): void {
    // Interpolate points for smooth line
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(Math.floor(dist / 2), 1);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      this.drawBrush(x, y);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.isDrawing) return;

    // Draw mask canvas overlay
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.maskCanvas, 0, 0);
    ctx.globalAlpha = 1;

    // Draw brush cursor
    ctx.strokeStyle = this.eraseMode ? '#ff0000' : '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.lastX, this.lastY, this.brushSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}
