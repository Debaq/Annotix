import JSZip from 'jszip';
import { Project, AnnotixImage } from '@/lib/db';
import { BaseExporter } from './BaseExporter';

export class TIXExporter extends BaseExporter {
  async export(project: Project, images: AnnotixImage[], onProgress?: (progress: number) => void): Promise<Blob> {
    const zip = new JSZip();

    // Build annotations.json following the required TIX structure
    const annotationsJson = {
      version: '1.0',
      project: {
        name: project.name,
        type: project.type,
        classes: project.classes.map((cls) => ({
          id: cls.id,
          name: cls.name,
          color: cls.color,
        })),
        preprocessingConfig: {
          enabled: false,
        },
        createdAt: project.metadata?.created || Date.now(),
        updatedAt: project.metadata?.updated || Date.now(),
        metadata: project.metadata || {},
      },
      images: images.map((img) => ({
        name: img.name,
        originalFileName: img.name,
        displayName: img.name,
        mimeType: this.getMimeType(img.name),
        annotations: img.annotations.map((ann) => ({
          type: ann.type,
          class: ann.classId,
          data: ann.data,
          metadata: {
            source: 'manual',
            confidence: null,
            customLabel: null,
          },
        })),
        width: img.width,
        height: img.height,
        timestamp: img.metadata?.uploaded || Date.now(),
        metadata: img.metadata || {},
      })),
    };

    zip.file('annotations.json', JSON.stringify(annotationsJson, null, 4));

    // Add images folder and files
    const imgFolder = zip.folder('images');

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      this.updateProgress((i / images.length) * 100, 100, onProgress);

      try {
        // If the image blob is available, add it; otherwise skip
        if (img.image) {
          imgFolder?.file(img.name, img.image as Blob);
        }
      } catch (e) {
        console.warn('Failed to add image to TIX export:', img.name, e);
      }
    }

    this.updateProgress(100, 100, onProgress);

    // Generate zip blob
    const blob = await zip.generateAsync({ type: 'blob' });

    return blob;
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
    };
    return mimeTypes[ext] || 'image/jpeg';
  }
}
