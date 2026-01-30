import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';

interface TIXAnnotation {
  type: string;
  class: number;
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
  async import(zip: JSZip, projectName: string, projectType: string): Promise<ImportResult> {
    try {
      const content = await this.extractFileAsText(zip, 'annotations.json');
      const data: TIXFile = JSON.parse(content);

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
          const annotations = annotationsRaw
            .filter((ann) => ann && ann.type && ann.class !== undefined)
            .map((ann) => {
              const classId = ann.class;
              const type = ann.type;
              const dataField = ann.data ?? ann;
              return this.createAnnotation(classId, type, dataField);
            });

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
