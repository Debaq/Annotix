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

  constructor(
    private activeClassId: number | null,
    private onAddAnnotation: (annotation: Annotation) => void,
    private skeletonType: string = 'coco-17'
  ) {}

  initialize(imageWidth: number, imageHeight: number): void {
    const preset = skeletonPresets[this.skeletonType];
    if (!preset) return;

    // Create initial keypoints at center with grid layout
    const centerX = imageWidth / 2;
    const centerY = imageHeight / 2;
    const gridCols = Math.ceil(Math.sqrt(preset.points.length));
    const spacing = 30;

    this.keypoints = preset.points.map((name, idx) => ({
      x: centerX + (idx % gridCols) * spacing - (gridCols * spacing) / 2,
      y: centerY + Math.floor(idx / gridCols) * spacing - (Math.floor(preset.points.length / gridCols) * spacing) / 2,
      visible: true,
      name,
    }));

    this.selectedKeypointIndex = 0;
  }

  onMouseDown(event: MouseEventData): void {
    if (this.keypoints.length === 0 || this.activeClassId === null) return;

    // Find closest keypoint
    let closestIdx = 0;
    let minDist = Infinity;

    this.keypoints.forEach((kp, idx) => {
      const dist = Math.sqrt((kp.x - event.imageX) ** 2 + (kp.y - event.imageY) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    // Select if close enough (within 20 pixels)
    if (minDist < 20) {
      this.selectedKeypointIndex = closestIdx;
      this.isDragging = true;
    }
  }

  onMouseMove(event: MouseEventData): void {
    if (!this.isDragging || this.selectedKeypointIndex === null) return;

    this.keypoints[this.selectedKeypointIndex] = {
      ...this.keypoints[this.selectedKeypointIndex],
      x: event.imageX,
      y: event.imageY,
    };
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
  }
}
