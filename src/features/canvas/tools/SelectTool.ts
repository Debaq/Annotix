import { BaseTool, TransformContext } from './BaseTool';

export class SelectTool extends BaseTool {
  onMouseDown(x: number, y: number, context: TransformContext): void {
    const canvas = this.screenToCanvas(x, y, context);

    // TODO: Implement selection logic
    // - Check if click is inside any annotation
    // - Select annotation for editing
    // - Show resize handles

    console.log('Select tool clicked at:', canvas);
  }

  onMouseMove(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    // TODO: Implement drag/resize logic
  }

  onMouseUp(x: number, y: number, context: TransformContext): void {
    this.isDrawing = false;

    // TODO: Finalize selection changes
  }
}
