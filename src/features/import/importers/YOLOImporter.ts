import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';
import { Annotation, BBoxData, PolygonData } from '@/lib/db';

export class YOLOImporter extends BaseImporter {
  async import(
    zip: JSZip,
    projectName: string,
    projectType: string
  ): Promise<ImportResult> {
    try {
      // Read classes
      const classesContent = await this.extractFileAsText(zip, 'classes.txt');
      const classNames = classesContent
        .trim()
        .split('\n')
        .filter(name => name.trim());

      const classes = classNames.map((name, idx) =>
        this.createClassDefinition(idx, name.trim())
      );

      // Get image files
      const imageFiles = await this.getFilesList(zip, 'images');

      if (imageFiles.length === 0) {
        throw new Error('No images found in images/ folder');
      }

      // Import images with annotations
      const images = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = imageFiles[i];
        const imageName = imagePath.split('/').pop() || '';

        if (!imageName) continue;

        try {
          const imageBlob = await this.extractFileAsBlob(zip, imagePath);
          const { width, height } = await this.getImageDimensions(imageBlob);

          // Get corresponding label file
          const labelName = imageName.replace(/\.[^/.]+$/, '.txt');
          const labelPath = `labels/${labelName}`;

          let annotations: Annotation[] = [];
          try {
            const labelContent = await this.extractFileAsText(zip, labelPath);
            annotations = this.parseLabelFile(
              labelContent,
              width,
              height,
              projectType === 'polygon'
            );
          } catch (e) {
            // No label file for this image - that's ok
          }

          const annotixImage = this.createAnnotixImage(
            0, // projectId will be set later
            imageName,
            imageBlob,
            width,
            height,
            annotations
          );

          images.push(annotixImage);
        } catch (error) {
          console.warn(`Failed to import image ${imageName}:`, error);
        }
      }

      return { classes, images };
    } catch (error) {
      throw new Error(`Failed to import YOLO format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseLabelFile(
    content: string,
    imageWidth: number,
    imageHeight: number,
    isSegmentation: boolean
  ): Annotation[] {
    const lines = content.trim().split('\n').filter(line => line.trim());
    const annotations: Annotation[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      
      if (parts.length < 5) continue;

      const classId = parseInt(parts[0], 10);

      try {
        if (isSegmentation && parts.length > 5) {
          // Polygon format
          const points = [];
          for (let i = 1; i < parts.length; i += 2) {
            const x = parseFloat(parts[i]) * imageWidth;
            const y = parseFloat(parts[i + 1]) * imageHeight;
            points.push({ x, y });
          }

          if (points.length >= 3) {
            const data: PolygonData = { points, closed: true };
            annotations.push(
              this.createAnnotation(classId, 'polygon', data)
            );
          }
        } else {
          // BBox format: class_id x_center y_center width height
          const xCenter = parseFloat(parts[1]);
          const yCenter = parseFloat(parts[2]);
          const width = parseFloat(parts[3]);
          const height = parseFloat(parts[4]);

          // Convert from normalized center to top-left
          const x = (xCenter - width / 2) * imageWidth;
          const y = (yCenter - height / 2) * imageHeight;
          const w = width * imageWidth;
          const h = height * imageHeight;

          const data: BBoxData = {
            x: Math.max(0, x),
            y: Math.max(0, y),
            width: w,
            height: h,
          };

          annotations.push(
            this.createAnnotation(classId, 'bbox', data)
          );
        }
      } catch (e) {
        console.warn(`Failed to parse line: ${line}`, e);
      }
    }

    return annotations;
  }
}
