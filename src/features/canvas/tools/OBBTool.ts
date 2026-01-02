import { BaseTool, TransformContext } from './BaseTool';
import { Annotation, OBBData } from '@/lib/db';

export class OBBTool extends BaseTool {
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private rotation = 0; // In degrees
  private tempOBB: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null = null;

  onMouseDown(x: number, y: number, context: TransformContext): void {
    const canvas = this.screenToCanvas(x, y, context);
    this.startX = canvas.x;
    this.startY = canvas.y;
    this.currentX = canvas.x;
    this.currentY = canvas.y;
    this.isDrawing = true;
    this.rotation = 0; // Reset rotation
  }

  onMouseMove(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    const canvas = this.screenToCanvas(x, y, context);
    this.currentX = canvas.x;
    this.currentY = canvas.y;

    // Calculate center and dimensions
    const centerX = (this.startX + this.currentX) / 2;
    const centerY = (this.startY + this.currentY) / 2;
    const width = Math.abs(this.currentX - this.startX);
    const height = Math.abs(this.currentY - this.startY);

    this.tempOBB = {
      x: centerX,
      y: centerY,
      width,
      height,
      rotation: this.rotation,
    };
  }

  onMouseUp(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    const canvas = this.screenToCanvas(x, y, context);
    this.currentX = canvas.x;
    this.currentY = canvas.y;

    // Calculate final OBB
    const centerX = (this.startX + this.currentX) / 2;
    const centerY = (this.startY + this.currentY) / 2;
    const width = Math.abs(this.currentX - this.startX);
    const height = Math.abs(this.currentY - this.startY);

    // Only create annotation if OBB has meaningful size
    if (width > 5 && height > 5) {
      // Dispatch event with annotation data
      const annotation: Omit<Annotation, 'id' | 'classId'> = {
        type: 'obb',
        data: {
          x: centerX,
          y: centerY,
          width,
          height,
          rotation: this.rotation,
        } as OBBData,
      };

      window.dispatchEvent(
        new CustomEvent('annotix:annotation-created', { detail: annotation })
      );
    }

    this.isDrawing = false;
    this.tempOBB = null;
    this.rotation = 0;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.tempOBB) return;

    ctx.save();

    // Translate to center
    ctx.translate(this.tempOBB.x, this.tempOBB.y);
    // Apply rotation
    ctx.rotate((this.tempOBB.rotation * Math.PI) / 180);

    // Draw rotated rectangle
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      -this.tempOBB.width / 2,
      -this.tempOBB.height / 2,
      this.tempOBB.width,
      this.tempOBB.height
    );

    // Draw rotation handle (small circle at top center)
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(0, -this.tempOBB.height / 2 - 15, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw rotation angle text
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.rotation.toFixed(0)}°`, 0, -this.tempOBB.height / 2 - 25);

    ctx.restore();

    // Draw instructions
    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Press R to rotate (+15°) | Shift+R to rotate (-15°)', 10, 30);
    ctx.restore();
  }

  // Public method to rotate the OBB
  public rotate(degrees: number): void {
    this.rotation = (this.rotation + degrees) % 360;
    if (this.rotation < 0) this.rotation += 360;

    // Update temp OBB if drawing
    if (this.tempOBB) {
      this.tempOBB.rotation = this.rotation;
    }
  }
}
