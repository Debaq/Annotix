import type { BaseHandler, MouseEventData, Point } from '../types/handlers';
import type { Annotation, LandmarksData } from '@/lib/db';

interface LandmarkData extends Point {
  name: string;
}

export class LandmarksHandler implements BaseHandler {
  private landmarks: LandmarkData[] = [];

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void
  ) {}

  updateActiveClassId(classId: number | null): void {
    this.activeClassId = classId;
  }

  updateAddAnnotationCallback(callback: (annotation: Annotation) => void): void {
    this.onAddAnnotation = callback;
  }

  onMouseDown(event: MouseEventData): void {
    if (this.activeClassId === null) return;

    // Add new landmark with sequential name
    this.landmarks.push({
      x: event.imageX,
      y: event.imageY,
      name: `Point ${this.landmarks.length + 1}`,
    });
  }

  onMouseMove(_event: MouseEventData): void {
    // No dragging for landmarks during creation
  }

  onMouseUp(_event: MouseEventData): void {
    // Landmarks are added on mouse down
  }

  async finish(): Promise<void> {
    if (this.landmarks.length > 0 && this.activeClassId !== null) {
      const landmarksAnnotation: LandmarksData = {
        points: this.landmarks,
      };

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'landmarks',
        classId: this.activeClassId,
        data: landmarksAnnotation,
      };

      this.onAddAnnotation(annotation);
      this.landmarks = [];
    }
  }

  cancel(): void {
    this.landmarks = [];
  }

  isActive(): boolean {
    return this.landmarks.length > 0;
  }

  getLandmarks(): LandmarkData[] {
    return this.landmarks;
  }

  reset(): void {
    this.landmarks = [];
  }
}
