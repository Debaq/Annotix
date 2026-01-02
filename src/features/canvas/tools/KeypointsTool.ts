import { BaseTool, TransformContext } from './BaseTool';
import { Annotation, KeypointsData } from '@/lib/db';
import { SKELETON_PRESETS } from '../data/skeletonPresets';

export class KeypointsTool extends BaseTool {
  private skeletonType: string; // e.g., 'coco-17', 'mediapipe-hand-21'
  private points: { x: number; y: number; visible: boolean; name: string }[] = [];
  private currentKeypointIndex = 0;
  private instanceId = 1;

  constructor(skeletonType: string = 'coco-17') {
    super();
    this.skeletonType = skeletonType;
    this.initializePoints();
  }

  private initializePoints(): void {
    const preset = SKELETON_PRESETS[this.skeletonType];
    if (!preset) {
      console.error(`Skeleton preset not found: ${this.skeletonType}`);
      return;
    }

    // Initialize all points as not visible (not yet placed)
    this.points = preset.keypoints.map((name) => ({
      x: 0,
      y: 0,
      visible: false,
      name,
    }));
  }

  onMouseDown(x: number, y: number, context: TransformContext): void {
    const canvas = this.screenToCanvas(x, y, context);

    // Place current keypoint
    if (this.currentKeypointIndex < this.points.length) {
      this.points[this.currentKeypointIndex] = {
        x: canvas.x,
        y: canvas.y,
        visible: true,
        name: this.points[this.currentKeypointIndex].name,
      };

      this.currentKeypointIndex++;

      // If all keypoints are placed, create annotation
      if (this.currentKeypointIndex >= this.points.length) {
        this.completeAnnotation();
      }
    }
  }

  onMouseMove(_x: number, _y: number, _context: TransformContext): void {
    // Not used for keypoints tool
  }

  onMouseUp(_x: number, _y: number, _context: TransformContext): void {
    // Not used for keypoints tool
  }

  private completeAnnotation(): void {
    // Create annotation
    const annotation: Omit<Annotation, 'id' | 'classId'> = {
      type: 'keypoints',
      data: {
        points: [...this.points],
        skeletonType: this.skeletonType,
        instanceId: this.instanceId,
      } as KeypointsData,
    };

    window.dispatchEvent(
      new CustomEvent('annotix:annotation-created', { detail: annotation })
    );

    // Reset for next instance
    this.reset();
    this.instanceId++;
  }

  private reset(): void {
    this.initializePoints();
    this.currentKeypointIndex = 0;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const preset = SKELETON_PRESETS[this.skeletonType];
    if (!preset) return;

    ctx.save();

    // Draw placed keypoints
    for (let i = 0; i < this.currentKeypointIndex; i++) {
      const point = this.points[i];
      if (point.visible) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff00';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw keypoint name
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.fillText(point.name, point.x + 8, point.y - 8);
      }
    }

    // Draw connections between placed keypoints
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;

    for (const [idx1, idx2] of preset.connections) {
      if (idx1 < this.currentKeypointIndex && idx2 < this.currentKeypointIndex) {
        const p1 = this.points[idx1];
        const p2 = this.points[idx2];

        if (p1.visible && p2.visible) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    // Draw guide for next keypoint
    if (this.currentKeypointIndex < this.points.length) {
      const nextKeypoint = this.points[this.currentKeypointIndex];
      ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(
        `Place: ${nextKeypoint.name} (${this.currentKeypointIndex + 1}/${this.points.length})`,
        10,
        30
      );
    }

    ctx.restore();
  }

  // Public method to cancel current annotation
  public cancel(): void {
    this.reset();
  }

  // Public method to undo last keypoint
  public undoLastKeypoint(): void {
    if (this.currentKeypointIndex > 0) {
      this.currentKeypointIndex--;
      this.points[this.currentKeypointIndex] = {
        x: 0,
        y: 0,
        visible: false,
        name: this.points[this.currentKeypointIndex].name,
      };
    }
  }

  // Public method to change skeleton type
  public setSkeletonType(skeletonType: string): void {
    this.skeletonType = skeletonType;
    this.reset();
  }
}
