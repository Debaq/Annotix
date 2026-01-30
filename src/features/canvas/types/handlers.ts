import type { Annotation } from '@/lib/db';

export interface Point {
  x: number;
  y: number;
}

export interface MouseEventData {
  imageX: number;
  imageY: number;
  canvasX: number;
  canvasY: number;
}

export interface CanvasTransform {
  scale: number;
  imageOffset: Point;
  stageScale: number;
  stagePos: Point;
}

export interface BaseHandler {
  // Mouse events
  onMouseDown(event: MouseEventData): void;
  onMouseMove(event: MouseEventData): void;
  onMouseUp(event: MouseEventData): void;

  // Annotation events
  onAnnotationDragEnd?(annotationId: string, newPosition: Point): void;
  onAnnotationTransform?(annotationId: string, newData: any): void;

  // State
  isActive(): boolean;
  reset(): void;

  // Actions
  finish?(): Promise<void> | void;
  cancel?(): void;
}

export interface DrawingState {
  isDrawing: boolean;
  data: any;
}
