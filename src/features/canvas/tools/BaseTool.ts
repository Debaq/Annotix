export interface TransformContext {
  zoom: number;
  panX: number;
  panY: number;
}

export abstract class BaseTool {
  protected isDrawing = false;

  abstract onMouseDown(x: number, y: number, context: TransformContext): void;
  abstract onMouseMove(x: number, y: number, context: TransformContext): void;
  abstract onMouseUp(x: number, y: number, context: TransformContext): void;

  // Optional render method for tool-specific overlays
  render(ctx: CanvasRenderingContext2D): void {
    // Override in subclasses if needed
  }

  protected screenToCanvas(
    screenX: number,
    screenY: number,
    context: TransformContext
  ): { x: number; y: number } {
    return {
      x: (screenX - context.panX) / context.zoom,
      y: (screenY - context.panY) / context.zoom,
    };
  }
}
