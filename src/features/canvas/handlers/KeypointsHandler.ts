import type { BaseHandler, MouseEventData, Point } from '../types/handlers';
import type { Annotation, KeypointsData } from '@/lib/db';
import { skeletonPresets } from '../data/skeletonPresets';

interface KeypointData extends Point {
  visible: boolean;
  name?: string;
}

export class KeypointsHandler implements BaseHandler {
  private keypoints: KeypointData[] = [];
  private selectedKeypointIndex: number | null = null;
  private isDragging: boolean = false;
  private onPreviewUpdate: (() => void) | null = null;
  private readonly selectionRadius: number = 20;

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void,
    private skeletonType: string = 'coco-17'
  ) {}

  updateActiveClassId(classId: number | null): void {
    this.activeClassId = classId;
  }

  updateAddAnnotationCallback(callback: (annotation: Annotation) => void): void {
    this.onAddAnnotation = callback;
  }

  setPreviewUpdateCallback(callback: () => void): void {
    this.onPreviewUpdate = callback;
  }

  private notifyPreviewUpdate(): void {
    if (this.onPreviewUpdate) {
      this.onPreviewUpdate();
    }
  }

  initialize(_imageWidth: number, _imageHeight: number): void {
    const preset = skeletonPresets[this.skeletonType];
    if (!preset) return;

    // No auto-create keypoints. User places them with clicks.
    this.keypoints = [];
    this.selectedKeypointIndex = null;
    this.isDragging = false;
    this.notifyPreviewUpdate();
  }

  private findClosestKeypointIndex(x: number, y: number): { index: number; distance: number } | null {
    if (this.keypoints.length === 0) return null;

    let closestIdx = 0;
    let minDist = Infinity;

    this.keypoints.forEach((kp, idx) => {
      const dist = Math.hypot(kp.x - x, kp.y - y);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    return { index: closestIdx, distance: minDist };
  }

  onMouseDown(event: MouseEventData): void {
    if (this.activeClassId === null) return;

    const preset = skeletonPresets[this.skeletonType];
    if (!preset) return;

    const closest = this.findClosestKeypointIndex(event.imageX, event.imageY);

    if (closest && closest.distance <= this.selectionRadius) {
      this.selectedKeypointIndex = closest.index;
      this.isDragging = true;
      this.notifyPreviewUpdate();
      return;
    }

    if (this.keypoints.length < preset.points.length) {
      const nextIndex = this.keypoints.length;
      const nextName = preset.points[nextIndex];

      this.keypoints = [
        ...this.keypoints,
        {
          x: event.imageX,
          y: event.imageY,
          visible: true,
          name: nextName,
        },
      ];

      this.selectedKeypointIndex = nextIndex;
      this.isDragging = true;
      this.notifyPreviewUpdate();
    }
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.isDragging || this.selectedKeypointIndex === null) return;

    this.keypoints = this.keypoints.map((kp, idx) => {
      if (idx !== this.selectedKeypointIndex) return kp;
      return {
        ...kp,
        x: event.imageX,
        y: event.imageY,
      };
    });

    this.notifyPreviewUpdate();
  }

  onMouseUp(event: MouseEventData): void {
    this.isDragging = false;
  }

  async finish(): Promise<void> {
    if (this.keypoints.length > 0 && this.activeClassId !== null) {
      const keypointsAnnotation: KeypointsData = {
        points: this.keypoints,
        skeletonType: this.skeletonType,
      };

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'keypoints',
        classId: this.activeClassId,
        data: keypointsAnnotation,
      };

      this.onAddAnnotation(annotation);
      this.reset();
    }
  }

  cancel(): void {
    this.reset();
  }

  isActive(): boolean {
    return this.keypoints.length > 0;
  }

  getKeypoints(): KeypointData[] {
    return this.keypoints;
  }

  getSelectedIndex(): number | null {
    return this.selectedKeypointIndex;
  }

  getSkeletonType(): string {
    return this.skeletonType;
  }

  reset(): void {
    this.keypoints = [];
    this.selectedKeypointIndex = null;
    this.isDragging = false;
    this.notifyPreviewUpdate();
  }
}
