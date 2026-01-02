import JSZip from 'jszip';
import { BaseExporter } from './BaseExporter';
import { Project, AnnotixImage, Annotation, BBoxData } from '@/lib/db';

export class PascalVOCExporter extends BaseExporter {
  async export(
    project: Project,
    images: AnnotixImage[],
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const zip = new JSZip();

    // Create folder structure
    const imagesFolder = zip.folder('JPEGImages')!;
    const annotationsFolder = zip.folder('Annotations')!;

    // Process each image
    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      // Add image file
      imagesFolder.file(image.name, image.image);

      // Generate XML annotation file
      const xmlContent = this.generateXML(image, project);
      const xmlName = image.name.replace(/\.[^/.]+$/, '.xml');
      annotationsFolder.file(xmlName, xmlContent);

      this.updateProgress(i + 1, images.length, onProgress);
    }

    // Generate ZIP blob
    return await zip.generateAsync({ type: 'blob' });
  }

  private generateXML(image: AnnotixImage, project: Project): string {
    const lines: string[] = [];

    // XML header
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<annotation>');

    // Folder
    lines.push(`\t<folder>${project.name}</folder>`);

    // Filename
    lines.push(`\t<filename>${image.name}</filename>`);

    // Source
    lines.push('\t<source>');
    lines.push('\t\t<database>Annotix</database>');
    lines.push('\t\t<annotation>Annotix Dataset</annotation>');
    lines.push('\t</source>');

    // Size
    lines.push('\t<size>');
    lines.push(`\t\t<width>${image.width}</width>`);
    lines.push(`\t\t<height>${image.height}</height>`);
    lines.push('\t\t<depth>3</depth>');
    lines.push('\t</size>');

    // Segmented
    lines.push('\t<segmented>0</segmented>');

    // Objects (only bbox annotations are supported in Pascal VOC)
    const bboxAnnotations = image.annotations.filter((a) => a.type === 'bbox' || a.type === 'obb');

    for (const annotation of bboxAnnotations) {
      const className = project.classes.find((c) => c.id === annotation.classId)?.name || 'unknown';
      const bbox = this.getBBox(annotation);

      if (bbox) {
        lines.push('\t<object>');
        lines.push(`\t\t<name>${this.escapeXML(className)}</name>`);
        lines.push('\t\t<pose>Unspecified</pose>');
        lines.push('\t\t<truncated>0</truncated>');
        lines.push('\t\t<difficult>0</difficult>');
        lines.push('\t\t<bndbox>');
        lines.push(`\t\t\t<xmin>${Math.round(bbox.xmin)}</xmin>`);
        lines.push(`\t\t\t<ymin>${Math.round(bbox.ymin)}</ymin>`);
        lines.push(`\t\t\t<xmax>${Math.round(bbox.xmax)}</xmax>`);
        lines.push(`\t\t\t<ymax>${Math.round(bbox.ymax)}</ymax>`);
        lines.push('\t\t</bndbox>');
        lines.push('\t</object>');
      }
    }

    // Close annotation
    lines.push('</annotation>');

    return lines.join('\n');
  }

  private getBBox(annotation: Annotation): { xmin: number; ymin: number; xmax: number; ymax: number } | null {
    if (annotation.type === 'bbox') {
      const data = annotation.data as BBoxData;
      return {
        xmin: data.x,
        ymin: data.y,
        xmax: data.x + data.width,
        ymax: data.y + data.height,
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
        xmin: Math.min(...xs),
        ymin: Math.min(...ys),
        xmax: Math.max(...xs),
        ymax: Math.max(...ys),
      };
    }

    return null;
  }

  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
