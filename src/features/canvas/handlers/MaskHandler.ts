import type { BaseHandler, MouseEventData } from '../types/handlers';
import type { Annotation, MaskData } from '@/lib/db';

export type MaskPreviewImage = HTMLImageElement | ImageBitmap;

export class MaskHandler implements BaseHandler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isDragging: boolean = false;
  private brushSize: number = 15;
  private eraseMode: boolean = false;
  private maskImage: MaskPreviewImage | null = null;
  private onMaskImageUpdate: ((img: MaskPreviewImage | null) => void) | null = null;
  private drawingClassId: number | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private hasDrawn: boolean = false;
  private isValid: boolean = true;
  private lastX: number = 0;
  private lastY: number = 0;
  private rafId: number = 0;
  private needsImageUpdate: boolean = false;
  private bitmapVersion: number = 0;

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void,
    private classColor: string = '#FF6B6B'
  ) {}

  setMaskImageUpdateCallback(callback: (img: MaskPreviewImage | null) => void): void {
    this.onMaskImageUpdate = callback;
  }

  updateActiveClassId(classId: number | null): void {
    this.activeClassId = classId;
  }

  updateClassColor(color: string): void {
    this.classColor = color;
  }

  updateAddAnnotationCallback(callback: (annotation: Annotation) => void): void {
    this.onAddAnnotation = callback;
  }

  initialize(imageWidth: number, imageHeight: number, baseMaskDataUrl?: string): void {
    this.isValid = true;
    this.drawingClassId = this.activeClassId;
    this.hasDrawn = false;

    this.canvas = document.createElement('canvas');
    this.canvas.width = imageWidth;
    this.canvas.height = imageHeight;
    this.ctx = this.canvas.getContext('2d');

    if (this.ctx) {
      this.ctx.clearRect(0, 0, imageWidth, imageHeight);

      if (baseMaskDataUrl) {
        const baseImage = new window.Image();
        baseImage.onload = () => {
          if (!this.ctx || !this.canvas) return;
          this.ctx.drawImage(baseImage, 0, 0, this.canvas.width, this.canvas.height);
          this.flushImageUpdate();
        };
        baseImage.src = baseMaskDataUrl;
      } else {
        this.flushImageUpdate();
      }
    }
  }

  setBrushSize(size: number): void {
    this.brushSize = Math.max(5, Math.min(100, size));
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  setEraseMode(enabled: boolean): void {
    this.eraseMode = enabled;
  }

  getEraseMode(): boolean {
    return this.eraseMode;
  }

  toggleEraseMode(): boolean {
    this.eraseMode = !this.eraseMode;
    return this.eraseMode;
  }

  onMouseDown(event: MouseEventData): void {
    if (!this.ctx || !this.canvas || this.drawingClassId === null) return;
    this.isDragging = true;
    this.lastX = event.imageX;
    this.lastY = event.imageY;
    this.applyBrushStyle();
    this.ctx.beginPath();
    this.ctx.arc(event.imageX, event.imageY, this.brushSize / 2, 0, Math.PI * 2);
    this.ctx.fill();
    this.hasDrawn = true;
    this.cancelAutoSaveTimer();
    this.scheduleImageUpdate();
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.isDragging || !this.ctx || !this.canvas) return;

    this.hasDrawn = true;
    this.cancelAutoSaveTimer();

    this.applyBrushStyle();
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(event.imageX, event.imageY);
    this.ctx.stroke();

    this.lastX = event.imageX;
    this.lastY = event.imageY;

    this.scheduleImageUpdate();
  }

  onMouseUp(_event: MouseEventData): void {
    this.isDragging = false;
    this.flushImageUpdate();
    if (this.hasDrawn) {
      this.startAutoSaveTimer();
    }
  }

  private applyBrushStyle(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = this.eraseMode ? 'destination-out' : 'source-over';
    // Opacidad completa — Konva aplica opacity={0.6} al renderizar
    this.ctx.fillStyle = this.eraseMode ? 'rgba(0,0,0,1)' : this.classColor;
    this.ctx.strokeStyle = this.eraseMode ? 'rgba(0,0,0,1)' : this.classColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private scheduleImageUpdate(): void {
    this.needsImageUpdate = true;
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        if (this.needsImageUpdate) {
          this.needsImageUpdate = false;
          this.createBitmap();
        }
      });
    }
  }

  private flushImageUpdate(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.needsImageUpdate = false;
    this.createBitmap();
  }

  private createBitmap(): void {
    if (!this.canvas) return;
    const version = ++this.bitmapVersion;
    createImageBitmap(this.canvas).then(bitmap => {
      // Ignorar si llegó un bitmap más reciente o el handler fue reseteado
      if (version !== this.bitmapVersion) {
        bitmap.close();
        return;
      }
      this.maskImage = bitmap;
      if (this.onMaskImageUpdate) {
        this.onMaskImageUpdate(bitmap);
      }
    });
  }

  async finish(): Promise<void> {
    if (!this.isValid) return;
    if (!this.canvas || this.drawingClassId === null) return;
    if (!this.hasDrawn) {
      this.reset();
      return;
    }

    const base64png = this.canvas.toDataURL('image/png');
    const maskAnnotation: MaskData = { base64png };
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: 'mask',
      classId: this.drawingClassId,
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

  getMaskImage(): MaskPreviewImage | null {
    return this.maskImage;
  }

  private startAutoSaveTimer(): void {
    this.cancelAutoSaveTimer();
    this.autoSaveTimer = setTimeout(() => {
      this.finish();
    }, 1000);
  }

  private cancelAutoSaveTimer(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  reset(): void {
    this.isValid = false;
    this.cancelAutoSaveTimer();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.bitmapVersion++;
    this.canvas = null;
    this.ctx = null;
    this.isDragging = false;
    this.maskImage = null;
    this.drawingClassId = null;
    this.hasDrawn = false;
    this.needsImageUpdate = false;

    if (this.onMaskImageUpdate) {
      this.onMaskImageUpdate(null);
    }
  }
}
