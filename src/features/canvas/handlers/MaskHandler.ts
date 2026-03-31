import type { BaseHandler, MouseEventData } from '../types/handlers';
import type { Annotation, MaskData } from '@/lib/db';

export type MaskPreviewImage = HTMLImageElement | ImageBitmap;

export type BrushShape = 'circle' | 'square';

export class MaskHandler implements BaseHandler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isDragging: boolean = false;
  private brushSize: number = 15;
  private brushShape: BrushShape = 'circle';
  private maxBrushSize: number = 100;
  private eraseMode: boolean = false;
  private maskImage: MaskPreviewImage | null = null;
  private onMaskImageUpdate: ((img: MaskPreviewImage | null) => void) | null = null;
  private onDirtyChange: ((dirty: boolean) => void) | null = null;
  private drawingClassId: number | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private hasDrawn: boolean = false;
  private isValid: boolean = true;
  private lastX: number = 0;
  private lastY: number = 0;
  private rafId: number = 0;
  private needsImageUpdate: boolean = false;
  private bitmapVersion: number = 0;
  private ready: boolean = false;
  private pendingMouseDown: MouseEventData | null = null;

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void,
    private classColor: string = '#FF6B6B'
  ) {}

  setMaskImageUpdateCallback(callback: (img: MaskPreviewImage | null) => void): void {
    this.onMaskImageUpdate = callback;
  }

  setDirtyChangeCallback(callback: (dirty: boolean) => void): void {
    this.onDirtyChange = callback;
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
    this.pendingMouseDown = null;
    this.maxBrushSize = Math.max(imageWidth, imageHeight);

    this.canvas = document.createElement('canvas');
    this.canvas.width = imageWidth;
    this.canvas.height = imageHeight;
    this.ctx = this.canvas.getContext('2d');

    if (this.ctx) {
      this.ctx.clearRect(0, 0, imageWidth, imageHeight);

      if (baseMaskDataUrl) {
        // No está listo hasta que la imagen base cargue
        this.ready = false;
        const baseImage = new window.Image();
        baseImage.onload = () => {
          if (!this.ctx || !this.canvas) return;
          // Forzar source-over para dibujar la imagen base correctamente
          // (el usuario podría haber cambiado globalCompositeOperation antes de que cargue)
          this.ctx.globalCompositeOperation = 'source-over';
          this.ctx.drawImage(baseImage, 0, 0, this.canvas.width, this.canvas.height);
          this.ready = true;
          this.flushImageUpdate();
          // Reproducir el evento de mouseDown pendiente
          if (this.pendingMouseDown) {
            const event = this.pendingMouseDown;
            this.pendingMouseDown = null;
            this.onMouseDown(event);
          }
        };
        baseImage.src = baseMaskDataUrl;
      } else {
        // Sin imagen base → listo inmediatamente
        this.ready = true;
        this.flushImageUpdate();
      }
    }
  }

  setBrushSize(size: number): void {
    this.brushSize = Math.max(1, Math.min(this.maxBrushSize, size));
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  getMaxBrushSize(): number {
    return this.maxBrushSize;
  }

  setBrushShape(shape: BrushShape): void {
    this.brushShape = shape;
  }

  getBrushShape(): BrushShape {
    return this.brushShape;
  }

  toggleBrushShape(): BrushShape {
    this.brushShape = this.brushShape === 'circle' ? 'square' : 'circle';
    return this.brushShape;
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
    // Si la imagen base aún no cargó, guardar el evento para después
    if (!this.ready) {
      this.pendingMouseDown = event;
      return;
    }
    this.isDragging = true;
    this.lastX = event.imageX;
    this.lastY = event.imageY;
    this.applyBrushStyle();
    this.stampBrush(event.imageX, event.imageY);
    this.hasDrawn = true;
    this.onDirtyChange?.(true);
    this.cancelAutoSaveTimer();
    this.scheduleImageUpdate();
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.isDragging || !this.ctx || !this.canvas) return;

    this.hasDrawn = true;
    this.cancelAutoSaveTimer();

    this.applyBrushStyle();

    if (this.brushShape === 'circle') {
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(event.imageX, event.imageY);
      this.ctx.stroke();
    } else {
      // Square brush: interpolar stamps entre lastXY y currentXY
      const dx = event.imageX - this.lastX;
      const dy = event.imageY - this.lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(dist / (this.brushSize * 0.3)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this.stampBrush(this.lastX + dx * t, this.lastY + dy * t);
      }
    }

    this.lastX = event.imageX;
    this.lastY = event.imageY;

    this.scheduleImageUpdate();
  }

  onMouseUp(_event: MouseEventData): void {
    if (!this.ready) {
      // Cancelar evento pendiente si el usuario soltó antes de que cargue
      this.pendingMouseDown = null;
      return;
    }
    this.isDragging = false;
    this.flushImageUpdate();
    if (this.hasDrawn) {
      this.startAutoSaveTimer();
    }
  }

  private stampBrush(x: number, y: number): void {
    if (!this.ctx) return;
    const half = this.brushSize / 2;
    if (this.brushShape === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(x, y, half, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      this.ctx.fillRect(x - half, y - half, this.brushSize, this.brushSize);
    }
  }

  private applyBrushStyle(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = this.eraseMode ? 'destination-out' : 'source-over';
    // Opacidad completa — Konva aplica opacity={0.6} al renderizar
    this.ctx.fillStyle = this.eraseMode ? 'rgba(0,0,0,1)' : this.classColor;
    this.ctx.strokeStyle = this.eraseMode ? 'rgba(0,0,0,1)' : this.classColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = this.brushShape === 'circle' ? 'round' : 'square';
    this.ctx.lineJoin = this.brushShape === 'circle' ? 'round' : 'miter';
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

    this.onDirtyChange?.(false);
    this.onAddAnnotation(annotation);
    this.reset();
  }

  cancel(): void {
    this.onDirtyChange?.(false);
    this.reset();
  }

  isActive(): boolean {
    return this.canvas !== null;
  }

  isReady(): boolean {
    return this.ready;
  }

  getDrawingClassId(): number | null {
    return this.drawingClassId;
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
    this.ready = false;
    this.pendingMouseDown = null;

    if (this.onMaskImageUpdate) {
      this.onMaskImageUpdate(null);
    }
  }
}
