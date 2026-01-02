import { db } from '@/lib/db';
import { ExportFormat } from '../components/ExportDialog';
import { YOLOExporter } from '../exporters/YOLOExporter';

export const exportService = {
  async export(
    projectId: number,
    format: ExportFormat,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    // Load project and images
    const project = await db.projects.get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const dbImages = await db.images.where('projectId').equals(projectId).toArray();

    // Transform to AnnotixImage format
    const images = dbImages.map((img) => ({
      ...img,
      image: img.blob,
      width: img.dimensions.width,
      height: img.dimensions.height,
    }));

    // Filter images with annotations
    const annotatedImages = images.filter((img) => img.annotations.length > 0);

    if (annotatedImages.length === 0) {
      throw new Error('No annotated images found');
    }

    // Select exporter based on format
    let exporter;
    switch (format) {
      case 'yolo-detection':
        exporter = new YOLOExporter(false);
        break;
      case 'yolo-segmentation':
        exporter = new YOLOExporter(true);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Execute export
    return await exporter.export(project, annotatedImages, onProgress);
  },
};
