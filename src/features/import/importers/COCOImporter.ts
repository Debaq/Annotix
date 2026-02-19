import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';
import { Annotation, BBoxData, KeypointsData, PolygonData } from '@/lib/db';

interface COCOAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox?: [number, number, number, number];
  area?: number;
  iscrowd?: number;
  segmentation?: any[];
  keypoints?: number[];
  num_keypoints?: number;
}

interface COCOImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
}

interface COCOCategory {
  id: number;
  name: string;
  supercategory?: string;
}

interface COCODataset {
  info?: any;
  images: COCOImage[];
  annotations: COCOAnnotation[];
  categories: COCOCategory[];
}

export class COCOImporter extends BaseImporter {
  async import(
    zip: JSZip,
    projectName: string,
    projectType: string
  ): Promise<ImportResult> {
    try {
      // Read annotations.json
      const annotContent = await this.extractFileAsText(zip, 'annotations.json');
      const cocoData: COCODataset = JSON.parse(annotContent);

      if (!cocoData.images || !cocoData.annotations || !cocoData.categories) {
        throw new Error('Invalid COCO format: missing required fields');
      }

      // Create class definitions
      const classes = cocoData.categories.map(cat =>
        this.createClassDefinition(cat.id - 1, cat.name)
      );

      // Group annotations by image
      const annotationsByImage = new Map<number, COCOAnnotation[]>();
      for (const annotation of cocoData.annotations) {
        if (!annotationsByImage.has(annotation.image_id)) {
          annotationsByImage.set(annotation.image_id, []);
        }
        annotationsByImage.get(annotation.image_id)!.push(annotation);
      }

      // Import images
      const images = [];
      for (const cocoImage of cocoData.images) {
        const imageName = cocoImage.file_name;
        const imagePath = `images/${imageName}`;

        try {
          const imageBlob = await this.extractFileAsBlob(zip, imagePath);

          // Get annotations for this image
          const imageAnnotations = annotationsByImage.get(cocoImage.id) || [];
          const annotations = this.parseAnnotations(
            imageAnnotations,
            cocoImage.width,
            cocoImage.height,
            projectType
          );

          const annotixImage = this.createAnnotixImage(
            0, // projectId will be set later
            imageName,
            imageBlob,
            cocoImage.width,
            cocoImage.height,
            annotations
          );

          images.push(annotixImage);
        } catch (error) {
          console.warn(`Failed to import image ${imageName}:`, error);
        }
      }

      return { classes, images };
    } catch (error) {
      throw new Error(`Failed to import COCO format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseAnnotations(
    cocoAnnotations: COCOAnnotation[],
    imageWidth: number,
    imageHeight: number,
    projectType: string
  ): Annotation[] {
    const annotations: Annotation[] = [];

    for (const cocoAnn of cocoAnnotations) {
      try {
        if (cocoAnn.keypoints && cocoAnn.num_keypoints) {
          // Keypoints format
          const keypoints = cocoAnn.keypoints;
          const points = [];
          
          for (let i = 0; i < keypoints.length; i += 3) {
            const x = keypoints[i];
            const y = keypoints[i + 1];
            const visible = keypoints[i + 2];
            
            // COCO format: 0 = not labeled, 1 = labeled but occluded, 2 = visible
            points.push({
              x,
              y,
              visible: visible > 0,
              name: `keypoint_${i / 3}`,
            });
          }

          const data: KeypointsData = {
            points,
            skeletonType: 'coco-17',
          };

          annotations.push(
            this.createAnnotation(cocoAnn.category_id - 1, 'keypoints', data)
          );
        } else if (Array.isArray(cocoAnn.segmentation) && cocoAnn.segmentation.length > 0) {
          const firstSeg = cocoAnn.segmentation[0];
          if (Array.isArray(firstSeg) && firstSeg.length >= 6) {
            const points: { x: number; y: number }[] = [];
            for (let i = 0; i < firstSeg.length; i += 2) {
              points.push({
                x: firstSeg[i],
                y: firstSeg[i + 1],
              });
            }

            const data: PolygonData = {
              points,
              closed: true,
            };

            annotations.push(
              this.createAnnotation(cocoAnn.category_id - 1, 'polygon', data)
            );
          }
        } else if (cocoAnn.bbox) {
          // BBox format [x, y, width, height]
          const data: BBoxData = {
            x: cocoAnn.bbox[0],
            y: cocoAnn.bbox[1],
            width: cocoAnn.bbox[2],
            height: cocoAnn.bbox[3],
          };

          const annotationType = 'bbox';
          annotations.push(
            this.createAnnotation(cocoAnn.category_id - 1, annotationType, data)
          );
        }
      } catch (e) {
        console.warn(`Failed to parse COCO annotation:`, e);
      }
    }

    return annotations;
  }
}
