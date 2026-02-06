import type { BaseHandler, MouseEventData, DrawingState } from '../types/handlers';
import type { Annotation, OBBData } from '@/lib/db';

export class OBBHandler implements BaseHandler {
  private drawingState: DrawingState = {
    isDrawing: false,
    data: null,
  };
  private onDrawingDataUpdate: ((data: any) => void) | null = null;
  private isValid: boolean = true;

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void
  ) {}

  setDrawingDataUpdateCallback(callback: (data: any) => void): void {
    this.onDrawingDataUpdate = callback;
  }

  updateActiveClassId(classId: number | null): void {
    this.activeClassId = classId;
  }

  updateAddAnnotationCallback(callback: (annotation: Annotation) => void): void {
    this.onAddAnnotation = callback;
  }

  onMouseDown(event: MouseEventData): void {
    if (this.activeClassId === null) return;

    this.isValid = true; // Revalidar al empezar nuevo dibujo

    this.drawingState = {
      isDrawing: true,
      data: {
        startX: event.imageX,
        startY: event.imageY,
        width: 0,
        height: 0,
      },
    };
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.drawingState.isDrawing || !this.drawingState.data) return;

    this.drawingState.data = {
      ...this.drawingState.data,
      width: event.imageX - this.drawingState.data.startX,
      height: event.imageY - this.drawingState.data.startY,
    };

    if (this.onDrawingDataUpdate) {
      this.onDrawingDataUpdate(this.drawingState.data);
    }
  }

  onMouseUp(event: MouseEventData): void {
    if (!this.drawingState.isDrawing || !this.drawingState.data || this.activeClassId === null) {
      this.drawingState.isDrawing = false;
      if (this.onDrawingDataUpdate) {
        this.onDrawingDataUpdate(null);
      }
      return;
    }

    const { startX, startY, width, height } = this.drawingState.data;

    if (Math.abs(width) > 5 && Math.abs(height) > 5) {
      const centerX = startX + width / 2;
      const centerY = startY + height / 2;

      const obbData: OBBData = {
        x: centerX,
        y: centerY,
        width: Math.abs(width),
        height: Math.abs(height),
        rotation: 0,
      };

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'obb',
        classId: this.activeClassId,
        data: obbData,
      };

      this.onAddAnnotation(annotation);
    }

    this.drawingState = { isDrawing: false, data: null };
    if (this.onDrawingDataUpdate) {
      this.onDrawingDataUpdate(null);
    }
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
    // OBB finishes on mouse up, no action needed
  }

  cancel(): void {
    this.reset();
  }
}
