import type { BaseHandler, MouseEventData } from '../types/handlers';
import type { Annotation, MaskData } from '@/lib/db';

export class MaskHandler implements BaseHandler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isDragging: boolean = false;
  private brushSize: number = 15;
  private maskImage: HTMLImageElement | null = null;
  private onMaskImageUpdate: ((img: HTMLImageElement | null) => void) | null = null;
  private drawingClassId: number | null = null; // Guarda el classId cuando se inicia el dibujo
  private autoSaveTimer: NodeJS.Timeout | null = null; // Timer para auto-guardar después de pintar
  private hasDrawn: boolean = false; // Indica si se ha dibujado algo
  private isValid: boolean = true; // Indica si el handler es válido (no ha sido cancelado)

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void,
    private classColor: string = '#FF6B6B'
  ) {
    console.log('[MaskHandler] NUEVO HANDLER CREADO con classId:', activeClassId);
  }

  setMaskImageUpdateCallback(callback: (img: HTMLImageElement | null) => void): void {
    this.onMaskImageUpdate = callback;
    console.log('[MaskHandler] Callback de actualización de imagen registrado');
  }

  // Método para actualizar el classId sin recrear el handler
  updateActiveClassId(classId: number | null): void {
    console.log('[MaskHandler] Actualizando classId:', this.activeClassId, '->', classId);
    this.activeClassId = classId;
  }

  // Método para actualizar el color de la clase
  updateClassColor(color: string): void {
    console.log('[MaskHandler] Actualizando color:', this.classColor, '->', color);
    this.classColor = color;
  }

  // Método para actualizar el callback de addAnnotation
  updateAddAnnotationCallback(callback: (annotation: Annotation) => void): void {
    console.log('[MaskHandler] Actualizando callback de addAnnotation');
    this.onAddAnnotation = callback;
  }

  initialize(imageWidth: number, imageHeight: number): void {
    // Siempre inicializar un nuevo canvas, incluso si ya existe uno
    // Esto permite crear una nueva máscara después de guardar la anterior
    console.log('[MaskHandler] initialize() - creando nuevo canvas y REVALIDANDO', { 
      hasExistingCanvas: !!this.canvas, 
      imageWidth, 
      imageHeight, 
      activeClassId: this.activeClassId 
    });

    // CRÍTICO: Revalidar el handler al inicializar
    this.isValid = true;
    
    // CRÍTICO: Guardar el classId actual para usarlo al guardar
    // Esto previene que se pierda si activeClassId cambia antes de finish()
    this.drawingClassId = this.activeClassId;
    this.hasDrawn = false; // Resetear flag de dibujo
    console.log('[MaskHandler] drawingClassId guardado:', this.drawingClassId);

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
    if (!this.ctx || !this.canvas || this.drawingClassId === null) {
      console.log('[MaskHandler] onMouseDown - cancelado, no hay drawingClassId');
      return;
    }
    console.log('[MaskHandler] onMouseDown - comenzando a dibujar en:', { 
      x: event.imageX, 
      y: event.imageY, 
      brushSize: this.brushSize,
      drawingClassId: this.drawingClassId
    });
    this.isDragging = true;
    this.paintAt(event.imageX, event.imageY);
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.isDragging || !this.ctx || !this.canvas) return;
    this.paintAt(event.imageX, event.imageY);
  }

  onMouseUp(event: MouseEventData): void {
    this.isDragging = false;
    
    // Si se dibujó algo, iniciar timer de auto-guardado
    if (this.hasDrawn) {
      console.log('[MaskHandler] onMouseUp - iniciando timer de auto-guardado (1s)');
      this.startAutoSaveTimer();
    }
  }

  private paintAt(x: number, y: number): void {
    if (!this.ctx || !this.canvas) return;

    console.log('[MaskHandler] pintando en:', { x, y, color: this.classColor });
    
    // Marcar que se ha dibujado y cancelar timer previo
    this.hasDrawn = true;
    this.cancelAutoSaveTimer();

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
      // Notificar al componente React que la imagen ha cambiado
      if (this.onMaskImageUpdate) {
        console.log('[MaskHandler] Notificando actualización de imagen al componente');
        this.onMaskImageUpdate(img);
      }
    };
  }

  async finish(): Promise<void> {
    if (!this.isValid) {
      console.log('[MaskHandler] finish() - CANCELADO, handler invalidado (fue cancelado previamente)');
      return;
    }
    
    if (!this.canvas || this.drawingClassId === null) {
      console.log('[MaskHandler] finish() - cancelado, no canvas o no classId', { 
        hasCanvas: !!this.canvas, 
        activeClassId: this.activeClassId,
        drawingClassId: this.drawingClassId
      });
      return;
    }

    console.log('[MaskHandler] finish() - guardando máscara', { 
      activeClassId: this.activeClassId,
      drawingClassId: this.drawingClassId 
    });

    const base64png = this.canvas.toDataURL('image/png');
    console.log('[MaskHandler] Base64 generado, primeros 100 chars:', base64png.substring(0, 100));
    
    const maskAnnotation: MaskData = {
      base64png,
    };

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: 'mask',
      classId: this.drawingClassId,
      data: maskAnnotation,
    };

    console.log('[MaskHandler] Llamando onAddAnnotation con:', { 
      annotationId: annotation.id, 
      canvasSize: `${this.canvas.width}x${this.canvas.height}`,
      base64Length: base64png.length
    });

    this.onAddAnnotation(annotation);
    console.log('[MaskHandler] onAddAnnotation ejecutado, reseteando handler completamente');
    
    // Resetear completamente para limpiar la preview
    // La máscara guardada se renderizará desde annotations
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

  private startAutoSaveTimer(): void {
    // Cancelar timer anterior si existe
    this.cancelAutoSaveTimer();
    
    // Iniciar nuevo timer de 1 segundo
    this.autoSaveTimer = setTimeout(() => {
      console.log('[MaskHandler] Timer de auto-guardado ejecutado');
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
    console.log('[MaskHandler] reseteando estado y INVALIDANDO handler');
    this.isValid = false; // Invalidar para prevenir finish() después de cancel
    this.cancelAutoSaveTimer();
    this.canvas = null;
    this.ctx = null;
    this.isDragging = false;
    this.maskImage = null;
    this.drawingClassId = null;
    this.hasDrawn = false;
    
    // Notificar a React que limpie la preview
    if (this.onMaskImageUpdate) {
      console.log('[MaskHandler] Notificando a React que limpie maskImage');
      this.onMaskImageUpdate(null);
    }
  }
}
