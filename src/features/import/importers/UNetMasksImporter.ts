import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';
import { Annotation, MaskData, PolygonData } from '@/lib/db';

export class UNetMasksImporter extends BaseImporter {
  async import(
    zip: JSZip,
    projectName: string,
    projectType: string
  ): Promise<ImportResult> {
    try {
      // Get image and mask files
      const imageFiles = await this.getFilesList(zip, 'images');
      const maskFiles = await this.getFilesList(zip, 'masks');

      if (imageFiles.length === 0) {
        throw new Error('No images found in images/ folder');
      }

      if (maskFiles.length === 0) {
        throw new Error('No masks found in masks/ folder');
      }

      // Create class definitions
      const classes = [
        this.createClassDefinition(0, 'background'),
        this.createClassDefinition(1, 'object'),
      ];

      // Import images with masks
      const images = [];
      for (const imagePath of imageFiles) {
        const imageName = imagePath.split('/').pop() || '';

        if (!imageName) continue;

        try {
          const imageBlob = await this.extractFileAsBlob(zip, imagePath);
          const { width, height } = await this.getImageDimensions(imageBlob);

          // Find corresponding mask file
          const maskName = imageName.replace(/\.[^/.]+$/, '.png');
          const maskPath = `masks/${maskName}`;

          let annotations: Annotation[] = [];
          try {
            const maskBlob = await this.extractFileAsBlob(zip, maskPath);
            const annotation = await this.parseMask(maskBlob, width, height);
            if (annotation) {
              annotations.push(annotation);
            }
          } catch (e) {
            // No mask for this image
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
      throw new Error(`Failed to import U-Net Masks format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async parseMask(
    maskBlob: Blob,
    imageWidth: number,
    imageHeight: number
  ): Promise<Annotation | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();

          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);

            // Convert to base64 PNG
            canvas.toBlob((blob) => {
              if (!blob) {
                resolve(null);
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                const base64 = reader.result as string;
                const base64Data = base64.split(',')[1];

                const data: MaskData = {
                  base64png: base64Data,
                  instanceId: 1,
                };

                resolve(this.createAnnotation(1, 'mask', data));
              };
              reader.readAsDataURL(blob);
            }, 'image/png');
          };

          img.onerror = () => resolve(null);
          img.src = reader.result as string;
        } catch (error) {
          console.warn('Failed to parse mask:', error);
          resolve(null);
        }
      };

      reader.onerror = () => resolve(null);
      reader.readAsDataURL(maskBlob);
    });
  }
}
