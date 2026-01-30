import type { BaseHandler, MouseEventData } from '../types/handlers';
import type { Annotation, MaskData } from '@/lib/db';

export class MaskHandler implements BaseHandler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isDragging: boolean = false;
  private brushSize: number = 15;
  private maskImage: HTMLImageElement | null = null;

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void,
    private classColor: string = '#FF6B6B'
  ) {}

  initialize(imageWidth: number, imageHeight: number): void {
    if (this.canvas) return;

    this.canvas = document.createElement('canvas');
    this.canvas.width = imageWidth;
    this.canvas.height = imageHeight;
    this.ctx = this.canvas.getContext('2d');

    if (this.ctx) {
      this.ctx.clearRect(0, 0, imageWidth, imageHeight);
      this.ctx.fillStyle = 'transparent';
      this.ctx.fillRect(0, 0, imageWidth, imageHeight);
      this.updateMaskImage();
    }
  }

  setBrushSize(size: number): void {
    this.brushSize = size;
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  onMouseDown(event: MouseEventData): void {
    if (!this.ctx || !this.canvas || this.activeClassId === null) return;
    this.isDragging = true;
    this.paintAt(event.imageX, event.imageY);
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.isDragging || !this.ctx || !this.canvas) return;
    this.paintAt(event.imageX, event.imageY);
  }

  onMouseUp(event: MouseEventData): void {
    this.isDragging = false;
  }

  private paintAt(x: number, y: number): void {
    if (!this.ctx || !this.canvas) return;

    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = this.classColor + 'AA';
    this.ctx.strokeStyle = this.classColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
    this.ctx.fill();

    this.updateMaskImage();
  }

  private updateMaskImage(): void {
    if (!this.canvas) return;

    const img = new window.Image();
    img.src = this.canvas.toDataURL();
    img.onload = () => {
      this.maskImage = img;
    };
  }

  async finish(): Promise<void> {
    if (!this.canvas || this.activeClassId === null) return;

    const base64png = this.canvas.toDataURL('image/png');
    const maskAnnotation: MaskData = {
      base64png,
    };

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: 'mask',
      classId: this.activeClassId,
      data: maskAnnotation,
    };

    this.onAddAnnotation(annotation);
    this.reset();
  }

  cancel(): void {
    this.reset();
  }

  isActive(): boolean {
    return this.canvas !== null;
  }

  getMaskImage(): HTMLImageElement | null {
    return this.maskImage;
  }

  reset(): void {
    this.canvas = null;
    this.ctx = null;
    this.isDragging = false;
    this.maskImage = null;
  }
}
