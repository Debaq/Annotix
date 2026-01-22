import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';
import { Annotation, BBoxData } from '@/lib/db';

interface VOCObject {
  name: string;
  bndbox: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

interface VOCAnnotation {
  size: {
    width: number;
    height: number;
  };
  object: VOCObject[];
}

export class PascalVOCImporter extends BaseImporter {
  async import(
    zip: JSZip,
    projectName: string,
    projectType: string
  ): Promise<ImportResult> {
    try {
      // Get XML files
      const xmlFiles = await this.getFilesList(zip, 'Annotations');

      if (xmlFiles.length === 0) {
        throw new Error('No XML files found in Annotations/ folder');
      }

      // Extract classes
      const classes = new Map<string, number>();
      let nextClassId = 0;

      // Get image files
      const imageFiles = await this.getFilesList(zip, 'images');

      if (imageFiles.length === 0) {
        throw new Error('No images found in images/ folder');
      }

      // Import images
      const images = [];
      for (const imagePath of imageFiles) {
        const imageName = imagePath.split('/').pop() || '';

        if (!imageName) continue;

        try {
          const imageBlob = await this.extractFileAsBlob(zip, imagePath);
          const { width, height } = await this.getImageDimensions(imageBlob);

          // Find corresponding XML file
          const xmlName = imageName.replace(/\.[^/.]+$/, '.xml');
          const xmlPath = `Annotations/${xmlName}`;

          let annotations: Annotation[] = [];
          try {
            const xmlContent = await this.extractFileAsText(zip, xmlPath);
            const vocData = this.parseXML(xmlContent);
            
            annotations = this.parseAnnotations(
              vocData,
              vocData.size.width,
              vocData.size.height,
              classes,
              nextClassId
            );

            // Update nextClassId
            nextClassId = Math.max(...Array.from(classes.values())) + 1;
          } catch (e) {
            // No annotation file for this image
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

      // Create class definitions
      const classArray = Array.from(classes.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([name, id]) => this.createClassDefinition(id, name));

      return { classes: classArray, images };
    } catch (error) {
      throw new Error(`Failed to import Pascal VOC format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseXML(xmlContent: string): VOCAnnotation {
    // Simple XML parser for VOC format
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Failed to parse XML');
    }

    // Get size
    const sizeElement = xmlDoc.querySelector('size');
    if (!sizeElement) throw new Error('Missing size element');

    const width = parseInt(sizeElement.querySelector('width')?.textContent || '0', 10);
    const height = parseInt(sizeElement.querySelector('height')?.textContent || '0', 10);

    // Get objects
    const objects: VOCObject[] = [];
    const objectElements = xmlDoc.querySelectorAll('object');

    objectElements.forEach(objElement => {
      const name = objElement.querySelector('name')?.textContent || '';
      const bndbox = objElement.querySelector('bndbox');

      if (bndbox) {
        objects.push({
          name,
          bndbox: {
            xmin: parseInt(bndbox.querySelector('xmin')?.textContent || '0', 10),
            ymin: parseInt(bndbox.querySelector('ymin')?.textContent || '0', 10),
            xmax: parseInt(bndbox.querySelector('xmax')?.textContent || '0', 10),
            ymax: parseInt(bndbox.querySelector('ymax')?.textContent || '0', 10),
          },
        });
      }
    });

    return {
      size: { width, height },
      object: objects,
    };
  }

  private parseAnnotations(
    vocData: VOCAnnotation,
    imageWidth: number,
    imageHeight: number,
    classes: Map<string, number>,
    nextClassId: number
  ): Annotation[] {
    const annotations: Annotation[] = [];

    for (const obj of vocData.object) {
      try {
        // Get or create class
        let classId = classes.get(obj.name);
        if (classId === undefined) {
          classId = nextClassId + (classes.size);
          classes.set(obj.name, classId);
        }

        const { xmin, ymin, xmax, ymax } = obj.bndbox;
        const data: BBoxData = {
          x: xmin,
          y: ymin,
          width: xmax - xmin,
          height: ymax - ymin,
        };

        annotations.push(
          this.createAnnotation(classId, 'bbox', data)
        );
      } catch (e) {
        console.warn(`Failed to parse VOC object:`, e);
      }
    }

    return annotations;
  }
}
