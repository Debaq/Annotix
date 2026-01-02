import JSZip from 'jszip';
import { BaseExporter } from './BaseExporter';
import { Project, AnnotixImage, Annotation, BBoxData, LandmarksData, KeypointsData } from '@/lib/db';

export type CSVFormat = 'detection' | 'landmarks' | 'keypoints' | 'classification';

export class CSVExporter extends BaseExporter {
  constructor(private format: CSVFormat = 'detection') {
    super();
  }

  async export(
    project: Project,
    images: AnnotixImage[],
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const zip = new JSZip();

    // Add images
    const imagesFolder = zip.folder('images')!;
    for (const image of images) {
      imagesFolder.file(image.name, image.image);
    }

    // Generate CSV content based on format
    let csvContent = '';

    switch (this.format) {
      case 'detection':
        csvContent = this.generateDetectionCSV(images, project);
        break;
      case 'landmarks':
        csvContent = this.generateLandmarksCSV(images, project);
        break;
      case 'keypoints':
        csvContent = this.generateKeypointsCSV(images, project);
        break;
      case 'classification':
        csvContent = this.generateClassificationCSV(images, project);
        break;
    }

    // Add CSV file
    zip.file('annotations.csv', csvContent);

    // Add classes file
    const classesContent = project.classes.map((c) => `${c.id},${c.name}`).join('\n');
    zip.file('classes.csv', `id,name\n${classesContent}`);

    this.updateProgress(100, 100, onProgress);

    // Generate ZIP blob
    return await zip.generateAsync({ type: 'blob' });
  }

  private generateDetectionCSV(images: AnnotixImage[], project: Project): string {
    const rows: string[] = [];

    // Header
    rows.push('filename,width,height,class,xmin,ymin,xmax,ymax');

    // Data rows
    for (const image of images) {
      const bboxAnnotations = image.annotations.filter((a) => a.type === 'bbox' || a.type === 'obb');

      if (bboxAnnotations.length === 0) {
        // Empty row for images without annotations
        rows.push(`${image.name},${image.width},${image.height},,,,`);
      } else {
        for (const annotation of bboxAnnotations) {
          const className = project.classes.find((c) => c.id === annotation.classId)?.name || 'unknown';
          const bbox = this.getBBox(annotation, image.width, image.height);

          if (bbox) {
            rows.push(
              `${image.name},${image.width},${image.height},${className},${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}`
            );
          }
        }
      }
    }

    return rows.join('\n');
  }

  private generateLandmarksCSV(images: AnnotixImage[], project: Project): string {
    const rows: string[] = [];

    // Collect all unique landmark names
    const landmarkNames = new Set<string>();
    for (const image of images) {
      for (const annotation of image.annotations) {
        if (annotation.type === 'landmarks') {
          const data = annotation.data as LandmarksData;
          for (const point of data.points) {
            landmarkNames.add(point.name);
          }
        }
      }
    }

    const sortedLandmarkNames = Array.from(landmarkNames).sort();

    // Header
    const headerCols = ['filename', 'width', 'height', 'class'];
    for (const name of sortedLandmarkNames) {
      headerCols.push(`${name}_x`, `${name}_y`);
    }
    rows.push(headerCols.join(','));

    // Data rows
    for (const image of images) {
      const landmarkAnnotations = image.annotations.filter((a) => a.type === 'landmarks');

      if (landmarkAnnotations.length === 0) {
        // Empty row
        const emptyCols = [image.name, image.width.toString(), image.height.toString(), ''];
        for (let i = 0; i < sortedLandmarkNames.length * 2; i++) {
          emptyCols.push('');
        }
        rows.push(emptyCols.join(','));
      } else {
        for (const annotation of landmarkAnnotations) {
          const className = project.classes.find((c) => c.id === annotation.classId)?.name || 'unknown';
          const data = annotation.data as LandmarksData;

          const cols = [image.name, image.width.toString(), image.height.toString(), className];

          // Add landmark coordinates
          for (const name of sortedLandmarkNames) {
            const point = data.points.find((p) => p.name === name);
            if (point) {
              cols.push(point.x.toFixed(2), point.y.toFixed(2));
            } else {
              cols.push('', '');
            }
          }

          rows.push(cols.join(','));
        }
      }
    }

    return rows.join('\n');
  }

  private generateKeypointsCSV(images: AnnotixImage[], project: Project): string {
    const rows: string[] = [];

    // Collect all unique keypoint names
    const keypointNames = new Set<string>();
    for (const image of images) {
      for (const annotation of image.annotations) {
        if (annotation.type === 'keypoints') {
          const data = annotation.data as KeypointsData;
          for (const point of data.points) {
            if (point.name) {
              keypointNames.add(point.name);
            }
          }
        }
      }
    }

    const sortedKeypointNames = Array.from(keypointNames).sort();

    // Header
    const headerCols = ['filename', 'width', 'height', 'class', 'instance_id'];
    for (const name of sortedKeypointNames) {
      headerCols.push(`${name}_x`, `${name}_y`, `${name}_visible`);
    }
    rows.push(headerCols.join(','));

    // Data rows
    for (const image of images) {
      const keypointAnnotations = image.annotations.filter((a) => a.type === 'keypoints');

      if (keypointAnnotations.length === 0) {
        // Empty row
        const emptyCols = [image.name, image.width.toString(), image.height.toString(), '', ''];
        for (let i = 0; i < sortedKeypointNames.length * 3; i++) {
          emptyCols.push('');
        }
        rows.push(emptyCols.join(','));
      } else {
        for (const annotation of keypointAnnotations) {
          const className = project.classes.find((c) => c.id === annotation.classId)?.name || 'unknown';
          const data = annotation.data as KeypointsData;

          const cols = [
            image.name,
            image.width.toString(),
            image.height.toString(),
            className,
            (data.instanceId || 1).toString(),
          ];

          // Add keypoint coordinates
          for (const name of sortedKeypointNames) {
            const point = data.points.find((p) => p.name === name);
            if (point && point.visible) {
              cols.push(point.x.toFixed(2), point.y.toFixed(2), '1');
            } else {
              cols.push('', '', '0');
            }
          }

          rows.push(cols.join(','));
        }
      }
    }

    return rows.join('\n');
  }

  private generateClassificationCSV(images: AnnotixImage[], project: Project): string {
    const rows: string[] = [];

    // Header
    rows.push('filename,class');

    // Data rows
    for (const image of images) {
      // For classification, we assume there's one main class per image
      const classAnnotations = image.annotations.filter(
        (a) => a.type === 'classification' || a.type === 'multi-label-classification'
      );

      if (classAnnotations.length > 0) {
        const classIds = classAnnotations.map((a) => a.classId);
        const classNames = classIds
          .map((id) => project.classes.find((c) => c.id === id)?.name)
          .filter((name) => name)
          .join(';');

        rows.push(`${image.name},${classNames}`);
      } else {
        // Check if there's any annotation - use its class
        if (image.annotations.length > 0) {
          const firstAnnotation = image.annotations[0];
          const className = project.classes.find((c) => c.id === firstAnnotation.classId)?.name || 'unknown';
          rows.push(`${image.name},${className}`);
        } else {
          rows.push(`${image.name},`);
        }
      }
    }

    return rows.join('\n');
  }

  private getBBox(
    annotation: Annotation,
    imageWidth: number,
    imageHeight: number
  ): { xmin: number; ymin: number; xmax: number; ymax: number } | null {
    if (annotation.type === 'bbox') {
      const data = annotation.data as BBoxData;
      return {
        xmin: Math.round(data.x),
        ymin: Math.round(data.y),
        xmax: Math.round(data.x + data.width),
        ymax: Math.round(data.y + data.height),
      };
    } else if (annotation.type === 'obb') {
      // Convert OBB to axis-aligned bbox
      const data = annotation.data as { x: number; y: number; width: number; height: number; rotation: number };

      const halfWidth = data.width / 2;
      const halfHeight = data.height / 2;
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

      return {
        xmin: Math.round(Math.min(...xs)),
        ymin: Math.round(Math.min(...ys)),
        xmax: Math.round(Math.max(...xs)),
        ymax: Math.round(Math.max(...ys)),
      };
    }

    return null;
  }
}
