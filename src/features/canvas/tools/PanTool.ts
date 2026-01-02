import { BaseTool, TransformContext } from './BaseTool';

export class PanTool extends BaseTool {
  private startX = 0;
  private startY = 0;
  private initialPanX = 0;
  private initialPanY = 0;

  constructor(
    private transform: {
      panX: number;
      panY: number;
      setPan: (x: number, y: number) => void;
    }
  ) {
    super();
  }

  onMouseDown(x: number, y: number, context: TransformContext): void {
    this.startX = x;
    this.startY = y;
    this.initialPanX = this.transform.panX;
    this.initialPanY = this.transform.panY;
    this.isDrawing = true;
  }

  onMouseMove(x: number, y: number, context: TransformContext): void {
    if (!this.isDrawing) return;

    const dx = x - this.startX;
    const dy = y - this.startY;

    this.transform.setPan(this.initialPanX + dx, this.initialPanY + dy);
  }

  onMouseUp(x: number, y: number, context: TransformContext): void {
    this.isDrawing = false;
  }
}
