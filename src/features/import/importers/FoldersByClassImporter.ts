import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';
import { Annotation, ClassificationData } from '@/lib/db';

export class FoldersByClassImporter extends BaseImporter {
  async import(
    zip: JSZip,
    projectName: string,
    projectType: string
  ): Promise<ImportResult> {
    try {
      // Detect class folders
      const classFolders = this.detectClassFolders(zip);

      if (classFolders.length === 0) {
        throw new Error('No class folders detected');
      }

      // Create class definitions
      const classes = classFolders.map((name, idx) =>
        this.createClassDefinition(idx, name)
      );

      // Import images from each class folder
      const images = [];
      for (let classIdx = 0; classIdx < classFolders.length; classIdx++) {
        const className = classFolders[classIdx];
        const imageFiles = await this.getFilesList(zip, className);

        for (const imagePath of imageFiles) {
          const imageName = imagePath.split('/').pop() || '';

          if (!imageName) continue;

          try {
            const imageBlob = await this.extractFileAsBlob(zip, imagePath);
            const { width, height } = await this.getImageDimensions(imageBlob);

            // Create classification annotation
            const classData: ClassificationData = { labels: [classIdx] };
            const annotation = this.createAnnotation(classIdx, 'classification', classData);

            const annotixImage = this.createAnnotixImage(
              0, // projectId will be set later
              `${className}/${imageName}`,
              imageBlob,
              width,
              height,
              [annotation]
            );

            images.push(annotixImage);
          } catch (error) {
            console.warn(`Failed to import image ${imagePath}:`, error);
          }
        }
      }

      return { classes, images };
    } catch (error) {
      throw new Error(`Failed to import FoldersByClass format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private detectClassFolders(zip: JSZip): string[] {
    const folders = new Set<string>();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

    Object.keys(zip.files).forEach(filePath => {
      const parts = filePath.split('/');
      
      if (parts.length === 2 && !parts[1].includes('.') === false) {
        const folder = parts[0];
        const fileName = parts[1].toLowerCase();
        
        if (imageExtensions.some(ext => fileName.endsWith(ext))) {
          folders.add(parts[0]);
        }
      }
    });

    return Array.from(folders).sort();
  }
}
