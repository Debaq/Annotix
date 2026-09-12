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
  onAnnotationTransform?(annotationId: string, newData: TransformedBox): void;

  // State
  isActive(): boolean;
  reset(): void;

  // Actions
  finish?(): Promise<void> | void;
  cancel?(): void;
}

/**
 * Rectángulo en curso de dibujo, en coordenadas de imagen. `width` y `height`
 * pueden ser negativos mientras se arrastra hacia arriba o hacia la izquierda;
 * se normalizan al cerrar la anotación.
 */
export interface RectDrawingData {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

/** Caja resultante de arrastrar el transformer, en coordenadas de imagen. */
export interface TransformedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface DrawingState<T = unknown> {
  isDrawing: boolean;
  data: T | null;
}
