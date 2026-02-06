import type { BaseHandler, MouseEventData, DrawingState } from '../types/handlers';
import type { Annotation, BBoxData } from '@/lib/db';

export class BBoxHandler implements BaseHandler {
  private drawingState: DrawingState = {
    isDrawing: false,
    data: null,
  };
  private onDrawingDataUpdate: ((data: any) => void) | null = null;
  private isValid: boolean = true;

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void
  ) {
    console.log('[BBoxHandler] NUEVO HANDLER CREADO con classId:', activeClassId);
  }

  setDrawingDataUpdateCallback(callback: (data: any) => void): void {
    this.onDrawingDataUpdate = callback;
  }

  updateActiveClassId(classId: number | null): void {
    console.log('[BBoxHandler] Actualizando classId:', this.activeClassId, '->', classId);
    this.activeClassId = classId;
  }

  updateAddAnnotationCallback(callback: (annotation: Annotation) => void): void {
    this.onAddAnnotation = callback;
  }

  onMouseDown(event: MouseEventData): void {
    if (this.activeClassId === null) return;
    console.log('[BBoxHandler] onMouseDown en:', { x: event.imageX, y: event.imageY, classId: this.activeClassId });

    this.isValid = true; // Revalidar al empezar nuevo dibujo

    this.drawingState = {
      isDrawing: true,
      data: {
        startX: event.imageX,
        startY: event.imageY,
        x: event.imageX,
        y: event.imageY,
        width: 0,
        height: 0,
      },
    };
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.drawingState.isDrawing || !this.drawingState.data) return;
    if (!this.isValid) {
      console.log('[BBoxHandler] onMouseUp - handler invalidado, cancelando guardado');
      this.cancel();
      return;
    }
    this.drawingState.data = {
      ...this.drawingState.data,
      width: event.imageX - this.drawingState.data.startX,
      height: event.imageY - this.drawingState.data.startY,
    };

    // Notificar al componente React que los datos han cambiado
    if (this.onDrawingDataUpdate) {
      this.onDrawingDataUpdate(this.drawingState.data);
    }
  }

  onMouseUp(event: MouseEventData): void {
    if (!this.drawingState.isDrawing || !this.drawingState.data || this.activeClassId === null) {
      console.log('[BBoxHandler] onMouseUp - no hay dibujo o sin clase activa');
      this.drawingState.isDrawing = false;
      if (this.onDrawingDataUpdate) {
        this.onDrawingDataUpdate(null);
      }
      return;
    }

    const { startX, startY, width, height } = this.drawingState.data;

    // Normalize bbox
    const normalizedBbox: BBoxData = {
      x: width < 0 ? startX + width : startX,
      y: height < 0 ? startY + height : startY,
      width: Math.abs(width),
      height: Math.abs(height),
    };

    // Minimum size threshold
    const minSize = 5;
    console.log('[BBoxHandler] onMouseUp - normalizedBBox:', normalizedBbox, 'minSize:', minSize);
    if (normalizedBbox.width > minSize && normalizedBbox.height > minSize) {
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'bbox',
        classId: this.activeClassId,
        data: normalizedBbox,
      };

      console.log('[BBoxHandler] Guardando bbox:', annotation);
      this.onAddAnnotation(annotation);
    }

    this.drawingState = { isDrawing: false, data: null };
    if (this.onDrawingDataUpdate) {
      this.onDrawingDataUpdate(null);
    }
  }

  onAnnotationDragEnd(annotationId: string, data: { x: number; y: number; width: number; height: number }): void {
    // Handled by canvas
  }

  onAnnotationTransform(annotationId: string, data: { x: number; y: number; width: number; height: number }): void {
    // Handled by canvas
  }

  isActive(): boolean {
    return this.drawingState.isDrawing;
  }

  getDrawingData(): any {
    return this.drawingState.data;
  }

  reset(): void {
    this.drawingState = { isDrawing: false, data: null };
  }

  finish(): void {
    // BBox finishes on mouse up, no action needed
  }

  cancel(): void {
    this.reset();
  }
}
