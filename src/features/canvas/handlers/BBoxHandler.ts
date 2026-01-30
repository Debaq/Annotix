import type { BaseHandler, MouseEventData, DrawingState } from '../types/handlers';
import type { Annotation, BBoxData } from '@/lib/db';

export class BBoxHandler implements BaseHandler {
  private drawingState: DrawingState = {
    isDrawing: false,
    data: null,
  };

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void
  ) {}

  onMouseDown(event: MouseEventData): void {
    if (this.activeClassId === null) return;

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

    this.drawingState.data = {
      ...this.drawingState.data,
      width: event.imageX - this.drawingState.data.startX,
      height: event.imageY - this.drawingState.data.startY,
    };
  }

  onMouseUp(event: MouseEventData): void {
    if (!this.drawingState.isDrawing || !this.drawingState.data || this.activeClassId === null) {
      this.drawingState.isDrawing = false;
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
    if (normalizedBbox.width > minSize && normalizedBbox.height > minSize) {
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'bbox',
        classId: this.activeClassId,
        data: normalizedBbox,
      };

      this.onAddAnnotation(annotation);
    }

    this.drawingState = { isDrawing: false, data: null };
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
