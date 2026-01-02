import JSZip from 'jszip';
import { BaseExporter } from './BaseExporter';
import { Project, AnnotixImage, Annotation, MaskData, PolygonData } from '@/lib/db';

/**
 * U-Net Masks Exporter
 *
 * Exports segmentation masks as grayscale PNG images.
 * Each class is represented by a different grayscale value:
 * - Background: 0 (black)
 * - Class 1: 1, Class 2: 2, etc.
 * - Or scaled: Class 1: 85, Class 2: 170, Class 3: 255 for visibility
 */
export class UNetMasksExporter extends BaseExporter {
  constructor(private scaleValues: boolean = true) {
    super();
  }

  async export(
    project: Project,
    images: AnnotixImage[],
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const zip = new JSZip();

    // Create folder structure
    const imagesFolder = zip.folder('images')!;
    const masksFolder = zip.folder('masks')!;

    // Process each image
    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      // Add original image
      imagesFolder.file(image.name, image.image);

      // Generate mask
      const maskBlob = await this.generateMask(image, project);
      if (maskBlob) {
        const maskName = image.name.replace(/\.[^/.]+$/, '.png');
        masksFolder.file(maskName, maskBlob);
      }

      this.updateProgress(i + 1, images.length, onProgress);
    }

    // Add classes.txt
    const classesContent = project.classes.map((c, idx) => {
      const value = this.scaleValues ? this.getScaledValue(c.id, project.classes.length) : c.id;
      return `${value}: ${c.name}`;
    }).join('\n');
    zip.file('classes.txt', `0: background\n${classesContent}`);

    // Generate ZIP blob
    return await zip.generateAsync({ type: 'blob' });
  }

  private async generateMask(image: AnnotixImage, project: Project): Promise<Blob | null> {
    // Create canvas for mask
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    // Fill with background (0 = black)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw each annotation
    for (const annotation of image.annotations) {
      if (annotation.type === 'mask') {
        await this.drawMaskAnnotation(ctx, annotation, project);
      } else if (annotation.type === 'polygon') {
        this.drawPolygonAnnotation(ctx, annotation, project);
      }
    }

    // Convert canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }

  private async drawMaskAnnotation(
    ctx: CanvasRenderingContext2D,
    annotation: Annotation,
    project: Project
  ): Promise<void> {
    const data = annotation.data as MaskData;

    // Load mask from base64
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Create temp canvas to get mask pixels
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');

        if (!tempCtx) {
          resolve();
          return;
        }

        // Draw mask
        tempCtx.drawImage(img, 0, 0);

        // Get image data
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const pixels = imageData.data;

        // Get class value
        const classValue = this.getClassValue(annotation.classId, project);

        // Replace white pixels with class value
        for (let i = 0; i < pixels.length; i += 4) {
          const alpha = pixels[i + 3];
          if (alpha > 128) {
            // White/opaque pixel in mask -> set to class value
            pixels[i] = classValue;     // R
            pixels[i + 1] = classValue; // G
            pixels[i + 2] = classValue; // B
            pixels[i + 3] = 255;        // A
          }
        }

        // Put modified pixels on main canvas
        ctx.putImageData(imageData, 0, 0);
        resolve();
      };

      img.onerror = () => resolve();
      img.src = data.base64png;
    });
  }

  private drawPolygonAnnotation(
    ctx: CanvasRenderingContext2D,
    annotation: Annotation,
    project: Project
  ): void {
    const data = annotation.data as PolygonData;

    if (!data.points || data.points.length < 3) return;

    const classValue = this.getClassValue(annotation.classId, project);
    const grayColor = `rgb(${classValue}, ${classValue}, ${classValue})`;

    ctx.fillStyle = grayColor;
    ctx.beginPath();
    ctx.moveTo(data.points[0].x, data.points[0].y);

    for (let i = 1; i < data.points.length; i++) {
      ctx.lineTo(data.points[i].x, data.points[i].y);
    }

    if (data.closed !== false) {
      ctx.closePath();
    }

    ctx.fill();
  }

  private getClassValue(classId: number, project: Project): number {
    if (this.scaleValues) {
      return this.getScaledValue(classId, project.classes.length);
    }
    return classId;
  }

  private getScaledValue(classId: number, numClasses: number): number {
    // Scale class IDs to be more visible in grayscale
    // Distribute values across 1-255 range
    if (numClasses === 1) return 255;

    const step = 255 / numClasses;
    return Math.round(classId * step);
  }
}
