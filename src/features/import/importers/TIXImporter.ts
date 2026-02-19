import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';
import type { Annotation, ClassificationData, KeypointsData, LandmarksData, MaskData, OBBData, PolygonData } from '@/lib/db';

interface TIXAnnotation {
  type: string;
  class?: number;
  classId?: number;
  data: any;
  metadata?: any;
}

interface TIXImageEntry {
  name: string;
  originalFileName?: string;
  displayName?: string;
  mimeType?: string;
  annotations?: TIXAnnotation[];
  width?: number;
  height?: number;
  timestamp?: number;
  metadata?: any;
  classification?: any;
}

interface TIXFile {
  version?: string;
  project?: {
    name?: string;
    type?: string;
    classes?: Array<{ id?: number; name: string; color?: string }>;
    preprocessingConfig?: any;
    createdAt?: number;
    updatedAt?: number;
    metadata?: any;
  };
  images?: TIXImageEntry[];
}

export class TIXImporter extends BaseImporter {
  private mapLegacyType(type: string): string {
    const normalized = (type || '').toLowerCase();
    const map: Record<string, string> = {
      bbox: 'bbox',
      box: 'bbox',
      rect: 'bbox',
      rectangle: 'bbox',
      mask: 'mask',
      segmentation: 'mask',
      polygon: 'polygon',
      keypoint: 'keypoints',
      keypoints: 'keypoints',
      landmark: 'landmarks',
      landmarks: 'landmarks',
      obb: 'obb',
      classification: 'classification',
      'multi-label-classification': 'classification',
      multilabel: 'classification',
      multilabelclassification: 'classification',
    };

    return map[normalized] || type;
  }

  private normalizeProjectType(type?: string): string {
    const normalized = (type || '').toLowerCase();
    const map: Record<string, string> = {
      detection: 'bbox',
      segmentation: 'mask',
      instanceseg: 'instance-segmentation',
      instancesegmentation: 'instance-segmentation',
      multilabel: 'multi-label-classification',
      keypoint: 'keypoints',
      landmark: 'landmarks',
    };

    return map[normalized] || (type || 'bbox');
  }

  private getClassId(annotation: TIXAnnotation): number | null {
    if (typeof annotation.classId === 'number') return annotation.classId;
    if (typeof annotation.class === 'number') return annotation.class;
    if (typeof annotation.classId === 'string' && annotation.classId.trim() !== '') return Number(annotation.classId);
    if (typeof annotation.class === 'string' && annotation.class.trim() !== '') return Number(annotation.class);
    return null;
  }

  private async convertLegacyMaskToBase64Png(maskData: any, imageWidth: number, imageHeight: number): Promise<string | null> {
    if (!maskData) return null;

    if (typeof maskData.base64png === 'string' && maskData.base64png.length > 0) {
      return maskData.base64png;
    }

    if (!maskData.imageData || maskData.x === undefined || maskData.y === undefined) {
      return null;
    }

    return new Promise((resolve) => {
      const source = new window.Image();
      source.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.clearRect(0, 0, imageWidth, imageHeight);
        ctx.drawImage(source, Number(maskData.x) || 0, Number(maskData.y) || 0);
        resolve(canvas.toDataURL('image/png'));
      };

      source.onerror = () => resolve(null);
      source.src = maskData.imageData;
    });
  }

  private normalizePolygonData(raw: any): PolygonData | null {
    if (!raw) return null;

    const inputPoints = Array.isArray(raw.points) ? raw.points : [];
    const points = inputPoints
      .map((point: any) => {
        if (Array.isArray(point) && point.length >= 2) {
          return { x: Number(point[0]), y: Number(point[1]) };
        }
        if (point && point.x !== undefined && point.y !== undefined) {
          return { x: Number(point.x), y: Number(point.y) };
        }
        return null;
      })
      .filter((point: { x: number; y: number } | null): point is { x: number; y: number } => point !== null);

    if (points.length < 3) return null;
    return { points, closed: raw.closed ?? true };
  }

  private normalizeKeypointsData(raw: any): KeypointsData | null {
    if (!raw) return null;

    const sourcePoints = Array.isArray(raw.points)
      ? raw.points
      : Array.isArray(raw.keypoints)
        ? raw.keypoints
        : [];

    if (sourcePoints.length === 0) return null;

    const points = sourcePoints.map((point: any, index: number) => {
      const visibleValue = point?.visible ?? point?.visibility ?? 0;
      const isVisible = typeof visibleValue === 'boolean' ? visibleValue : Number(visibleValue) > 0;

      return {
        x: Number(point?.x ?? 0),
        y: Number(point?.y ?? 0),
        visible: isVisible,
        name: point?.name ?? `point_${index}`,
      };
    });

    return {
      points,
      skeletonType: raw.skeletonType || raw.skeleton || 'coco-17',
      instanceId: raw.instanceId,
    };
  }

  private normalizeLandmarksData(raw: any): LandmarksData | null {
    if (!raw) return null;

    const sourcePoints = Array.isArray(raw.points)
      ? raw.points
      : (raw.x !== undefined && raw.y !== undefined)
        ? [raw]
        : [];

    if (sourcePoints.length === 0) return null;

    const points = sourcePoints.map((point: any, index: number) => ({
      x: Number(point?.x ?? 0),
      y: Number(point?.y ?? 0),
      name: point?.name || `Point ${index + 1}`,
    }));

    return { points };
  }

  private normalizeOBBData(raw: any): OBBData | null {
    if (!raw) return null;

    const x = Number(raw.x ?? raw.cx);
    const y = Number(raw.y ?? raw.cy);
    const width = Number(raw.width);
    const height = Number(raw.height);
    const rotation = Number(raw.rotation ?? raw.angle ?? 0);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }

    return { x, y, width, height, rotation };
  }

  private normalizeClassificationData(raw: any, classId: number): ClassificationData {
    if (raw?.labels && Array.isArray(raw.labels)) {
      return { labels: raw.labels.map((label: any) => Number(label)).filter((label: number) => Number.isFinite(label)) };
    }

    if (raw?.classId !== undefined && Number.isFinite(Number(raw.classId))) {
      return { labels: [Number(raw.classId)] };
    }

    return { labels: [classId] };
  }

  private async normalizeAnnotation(
    annotation: TIXAnnotation,
    imageWidth: number,
    imageHeight: number
  ): Promise<Annotation | null> {
    const classId = this.getClassId(annotation);
    if (classId === null || !Number.isFinite(classId)) return null;

    const normalizedType = this.mapLegacyType(annotation.type);
    const raw = annotation.data ?? annotation;

    if (normalizedType === 'bbox') {
      if (raw?.x === undefined || raw?.y === undefined || raw?.width === undefined || raw?.height === undefined) {
        return null;
      }
      return this.createAnnotation(classId, 'bbox', {
        x: Number(raw.x),
        y: Number(raw.y),
        width: Number(raw.width),
        height: Number(raw.height),
      });
    }

    if (normalizedType === 'mask') {
      const base64png = await this.convertLegacyMaskToBase64Png(raw, imageWidth, imageHeight);
      if (!base64png) return null;
      const data: MaskData = { base64png, instanceId: raw?.instanceId };
      return this.createAnnotation(classId, 'mask', data);
    }

    if (normalizedType === 'polygon') {
      const data = this.normalizePolygonData(raw);
      if (!data) return null;
      return this.createAnnotation(classId, 'polygon', data);
    }

    if (normalizedType === 'keypoints') {
      const data = this.normalizeKeypointsData(raw);
      if (!data) return null;
      return this.createAnnotation(classId, 'keypoints', data);
    }

    if (normalizedType === 'landmarks') {
      const data = this.normalizeLandmarksData(raw);
      if (!data) return null;
      return this.createAnnotation(classId, 'landmarks', data);
    }

    if (normalizedType === 'obb') {
      const data = this.normalizeOBBData(raw);
      if (!data) return null;
      return this.createAnnotation(classId, 'obb', data);
    }

    if (normalizedType === 'classification') {
      const data = this.normalizeClassificationData(raw, classId);
      return this.createAnnotation(classId, 'classification', data);
    }

    return this.createAnnotation(classId, normalizedType, raw);
  }

  async import(zip: JSZip, projectName: string, projectType: string): Promise<ImportResult> {
    try {
      const content = await this.extractFileAsText(zip, 'annotations.json');
      const data: TIXFile = JSON.parse(content);

      const resolvedProjectType = this.normalizeProjectType(data.project?.type || projectType);

      // Extract classes from project.classes or use a fallback
      const projectClasses = data.project?.classes || [];
      const classes = projectClasses.map((c, idx) =>
        this.createClassDefinition(c.id ?? idx, c.name, c.color)
      );

      // If no classes, create a default one
      if (classes.length === 0) {
        classes.push(this.createClassDefinition(0, 'Default', '#FF0000'));
      }

      const images: any[] = [];
      const imageEntries = data.images || [];

      for (const entry of imageEntries) {
        const imagePath = `images/${entry.name}`;
        try {
          const blob = await this.extractFileAsBlob(zip, imagePath);

          let width = entry.width;
          let height = entry.height;

          if (!width || !height) {
            const dims = await this.getImageDimensions(blob);
            width = dims.width;
            height = dims.height;
          }

          // Parse annotations using the correct field names
          const annotationsRaw = entry.annotations || [];
          const annotations: Annotation[] = [];

          for (const ann of annotationsRaw) {
            if (!ann || !ann.type) continue;
            const normalized = await this.normalizeAnnotation(ann, width, height);
            if (normalized) {
              annotations.push(normalized);
            }
          }

          // Legacy/classification compatibility: some exports store class in a dedicated field
          if (annotations.length === 0 && entry.classification !== undefined && resolvedProjectType.includes('classification')) {
            const classValue = Number(entry.classification?.classId ?? entry.classification?.class ?? entry.classification);
            if (Number.isFinite(classValue)) {
              annotations.push(this.createAnnotation(classValue, 'classification', { labels: [classValue] }));
            }
          }

          const ai = this.createAnnotixImage(0, entry.name, blob, width, height, annotations);
          images.push(ai);
        } catch (e) {
          console.warn('Skipping image during TIX import:', entry.name, e);
        }
      }

      // Ensure we have at least one class
      if (classes.length === 0) {
        classes.push(this.createClassDefinition(0, 'Default', '#FF0000'));
      }

      return { classes, images };
    } catch (e) {
      throw new Error(`Failed to import TIX: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
