import type { BaseHandler, MouseEventData, Point } from '../types/handlers';
import type { Annotation, PolygonData } from '@/lib/db';

export class PolygonHandler implements BaseHandler {
  private points: Point[] = [];

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void
  ) {}

  onMouseDown(event: MouseEventData): void {
    if (this.activeClassId === null) return;

    // Add new point to polygon
    this.points.push({
      x: event.imageX,
      y: event.imageY,
    });
  }

  onMouseMove(event: MouseEventData): void {
    // No live preview during drawing
  }

  onMouseUp(event: MouseEventData): void {
    // Points are added on mouse down
  }

  async finish(): Promise<void> {
    if (this.points.length >= 3 && this.activeClassId !== null) {
      const polygonData: PolygonData = {
        points: this.points,
        closed: true,
      };

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'polygon',
        classId: this.activeClassId,
        data: polygonData,
      };

      this.onAddAnnotation(annotation);
      this.points = [];
    }
  }

  cancel(): void {
    this.points = [];
  }

  isActive(): boolean {
    return this.points.length > 0;
  }

  getPoints(): Point[] {
    return this.points;
  }

  reset(): void {
    this.points = [];
  }
}
