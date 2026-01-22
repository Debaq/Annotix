import JSZip from 'jszip';
import { Project, AnnotixImage, Annotation, ClassDefinition } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export interface ImportResult {
  classes: ClassDefinition[];
  images: AnnotixImage[];
}

export abstract class BaseImporter {
  abstract import(
    zip: JSZip,
    projectName: string,
    projectType: string
  ): Promise<ImportResult>;

  protected createClassDefinition(id: number, name: string, color?: string): ClassDefinition {
    return {
      id,
      name,
      color: color || this.generateColor(id),
    };
  }

  protected generateColor(index: number): string {
    // Generate consistent colors based on index
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#82E0AA',
    ];
    return colors[index % colors.length];
  }

  protected createAnnotation(
    classId: number,
    type: string,
    data: any
  ): Annotation {
    return {
      id: uuidv4(),
      type: type as any,
      classId,
      data,
    };
  }

  protected createAnnotixImage(
    projectId: number,
    name: string,
    image: Blob,
    width: number,
    height: number,
    annotations: Annotation[] = []
  ): AnnotixImage {
    return {
      projectId,
      name,
      image,
      width,
      height,
      annotations,
      metadata: {
        uploaded: Date.now(),
        status: 'pending',
      },
    };
  }

  protected async extractFileAsText(zip: JSZip, path: string): Promise<string> {
    const file = zip.file(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return await file.async('text');
  }

  protected async extractFileAsBlob(zip: JSZip, path: string): Promise<Blob> {
    const file = zip.file(path);
    if (!file) throw new Error(`File not found: ${path}`);
    const data = await file.async('blob');
    return data;
  }

  protected async getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image dimensions'));
      };
      
      img.src = url;
    });
  }

  protected async getFilesList(zip: JSZip, folder: string): Promise<string[]> {
    const files: string[] = [];
    zip.folder(folder)?.forEach((relativePath) => {
      if (!relativePath.endsWith('/')) {
        files.push(`${folder}/${relativePath}`);
      }
    });
    return files;
  }

  protected normalizeCoordinate(value: number, imageSize: number, isNormalized: boolean = false): number {
    if (isNormalized) {
      return value * imageSize;
    }
    return value;
  }

  protected denormalizeCoordinate(value: number, imageSize: number): number {
    return value / imageSize;
  }
}
