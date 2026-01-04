import JSZip from 'jszip';
import { BaseExporter } from './BaseExporter';
import { Project, AnnotixImage, Annotation, BBoxData, PolygonData, KeypointsData } from '@/lib/db';
import { skeletonPresets } from '@/features/canvas/data/skeletonPresets';

interface COCOInfo {
  description: string;
  version: string;
  year: number;
  contributor: string;
  date_created: string;
}

interface COCOImage {
  id: number;
  width: number;
  height: number;
  file_name: string;
  date_captured: string;
}

interface COCOAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox?: [number, number, number, number]; // [x, y, width, height]
  segmentation?: number[][]; // [[x1,y1,x2,y2,...]]
  area?: number;
  iscrowd: number;
  keypoints?: number[]; // [x1,y1,v1,x2,y2,v2,...]
  num_keypoints?: number;
}

interface COCOCategory {
  id: number;
  name: string;
  supercategory: string;
  keypoints?: string[];
  skeleton?: [number, number][];
}

interface COCODataset {
  info: COCOInfo;
  licenses: unknown[];
  images: COCOImage[];
  annotations: COCOAnnotation[];
  categories: COCOCategory[];
}

export class COCOExporter extends BaseExporter {
  async export(
    project: Project,
    images: AnnotixImage[],
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const zip = new JSZip();

    // Create folder structure
    const imagesFolder = zip.folder('images')!;

    // Build COCO dataset
    const cocoDataset: COCODataset = {
      info: this.generateInfo(project),
      licenses: [],
      images: [],
      annotations: [],
      categories: this.generateCategories(project),
    };

    let annotationId = 1;

    // Process each image
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imageId = i + 1;

      // Add image to COCO dataset
      cocoDataset.images.push({
        id: imageId,
        width: image.width,
        height: image.height,
        file_name: image.name,
        date_captured: new Date().toISOString(),
      });

      // Add image file to ZIP
      imagesFolder.file(image.name, image.image);

      // Process annotations
      for (const annotation of image.annotations) {
        const cocoAnnotation = this.convertAnnotation(
          annotation,
          imageId,
          annotationId,
          image.width,
          image.height
        );

        if (cocoAnnotation) {
          cocoDataset.annotations.push(cocoAnnotation);
          annotationId++;
        }
      }

      this.updateProgress(i + 1, images.length, onProgress);
    }

    // Add COCO JSON file
    const jsonContent = JSON.stringify(cocoDataset, null, 2);
    zip.file('annotations.json', jsonContent);

    // Generate ZIP blob
    return await zip.generateAsync({ type: 'blob' });
  }

  private generateInfo(project: Project): COCOInfo {
    return {
      description: `${project.name} - COCO format dataset`,
      version: '1.0',
      year: new Date().getFullYear(),
      contributor: 'Annotix - TecMedHub FabLab',
      date_created: new Date().toISOString(),
    };
  }

  private generateCategories(project: Project): COCOCategory[] {
    return project.classes.map((cls) => {
      const category: COCOCategory = {
        id: cls.id,
        name: cls.name,
        supercategory: 'none',
      };

      // Add keypoints info if project type is keypoints
      if (project.type === 'keypoints') {
        // Use COCO-17 as default skeleton
        const skeleton = skeletonPresets['coco-17'];
        if (skeleton) {
          category.keypoints = skeleton.points;
          category.skeleton = skeleton.connections;
        }
      }

      return category;
    });
  }

  private convertAnnotation(
    annotation: Annotation,
    imageId: number,
    annotationId: number,
    imageWidth: number,
    imageHeight: number
  ): COCOAnnotation | null {
    const baseAnnotation: COCOAnnotation = {
      id: annotationId,
      image_id: imageId,
      category_id: annotation.classId,
      iscrowd: 0,
    };

    switch (annotation.type) {
      case 'bbox':
        return this.convertBBox(annotation, baseAnnotation);

      case 'polygon':
        return this.convertPolygon(annotation, baseAnnotation);

      case 'keypoints':
        return this.convertKeypoints(annotation, baseAnnotation, imageWidth, imageHeight);

      case 'obb':
        // Convert OBB to regular bbox for COCO
        return this.convertOBBToBBox(annotation, baseAnnotation);

      default:
        // Unsupported annotation type for COCO
        return null;
    }
  }

  private convertBBox(annotation: Annotation, base: COCOAnnotation): COCOAnnotation {
    const data = annotation.data as BBoxData;

    // COCO bbox format: [x, y, width, height] (top-left corner)
    base.bbox = [data.x, data.y, data.width, data.height];
    base.area = data.width * data.height;

    return base;
  }

  private convertPolygon(annotation: Annotation, base: COCOAnnotation): COCOAnnotation {
    const data = annotation.data as PolygonData;

    // COCO segmentation format: [[x1,y1,x2,y2,x3,y3,...]]
    const flatPoints: number[] = [];
    for (const point of data.points) {
      flatPoints.push(point.x, point.y);
    }

    base.segmentation = [flatPoints];

    // Calculate bounding box from polygon
    const xs = data.points.map((p) => p.x);
    const ys = data.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    base.bbox = [minX, minY, maxX - minX, maxY - minY];
    base.area = this.calculatePolygonArea(data.points);

    return base;
  }

  private convertKeypoints(
    annotation: Annotation,
    base: COCOAnnotation,
    imageWidth: number,
    imageHeight: number
  ): COCOAnnotation {
    const data = annotation.data as KeypointsData;

    // COCO keypoints format: [x1,y1,v1,x2,y2,v2,...]
    // v (visibility): 0=not labeled, 1=labeled but occluded, 2=visible
    const flatKeypoints: number[] = [];
    let numKeypoints = 0;

    for (const point of data.points) {
      flatKeypoints.push(
        point.x,
        point.y,
        point.visible ? 2 : 0 // Assume all visible points are fully visible
      );

      if (point.visible) {
        numKeypoints++;
      }
    }

    base.keypoints = flatKeypoints;
    base.num_keypoints = numKeypoints;

    // Calculate bounding box from keypoints
    const visiblePoints = data.points.filter((p) => p.visible);
    if (visiblePoints.length > 0) {
      const xs = visiblePoints.map((p) => p.x);
      const ys = visiblePoints.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      base.bbox = [minX, minY, maxX - minX, maxY - minY];
      base.area = (maxX - minX) * (maxY - minY);
    }

    return base;
  }

  private convertOBBToBBox(annotation: Annotation, base: COCOAnnotation): COCOAnnotation {
    const data = annotation.data as { x: number; y: number; width: number; height: number; rotation: number };

    // For COCO, convert OBB to axis-aligned bounding box
    // This is a simplification - proper conversion would calculate rotated corners
    const halfWidth = data.width / 2;
    const halfHeight = data.height / 2;

    // Calculate rotated corners
    const rad = (data.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const corners = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ];

    const rotatedCorners = corners.map((corner) => ({
      x: data.x + corner.x * cos - corner.y * sin,
      y: data.y + corner.x * sin + corner.y * cos,
    }));

    const xs = rotatedCorners.map((p) => p.x);
    const ys = rotatedCorners.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    base.bbox = [minX, minY, maxX - minX, maxY - minY];
    base.area = (maxX - minX) * (maxY - minY);

    return base;
  }

  private calculatePolygonArea(points: { x: number; y: number }[]): number {
    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    return Math.abs(area / 2);
  }
}
