import { db } from '@/lib/db';
import { ExportFormat } from '../utils/formatMapping';
import { YOLOExporter } from '../exporters/YOLOExporter';
import { COCOExporter } from '../exporters/COCOExporter';
import { PascalVOCExporter } from '../exporters/PascalVOCExporter';
import { CSVExporter } from '../exporters/CSVExporter';
import { FoldersByClassExporter } from '../exporters/FoldersByClassExporter';
import { UNetMasksExporter } from '../exporters/UNetMasksExporter';
import { TIXExporter } from '../exporters/TIXExporter';

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

    // Clean up annotations: remove ones with invalid class IDs
    // But keep ALL images (even those without annotations)
    const annotatedImages = images.map((img) => ({
      ...img,
      annotations: img.annotations.filter((ann) => {
        // Skip annotations with invalid class IDs
        const classExists = project.classes.some((c) => c.id === ann.classId);
        if (!classExists) {
          console.warn(`Skipping annotation with invalid class ID ${ann.classId} in image ${img.id}`);
          return false;
        }
        return true;
      }),
    }));

    if (annotatedImages.length === 0) {
      throw new Error('No images found in project');
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
      case 'coco':
        exporter = new COCOExporter();
        break;
      case 'pascal-voc':
        exporter = new PascalVOCExporter();
        break;
      case 'csv-detection':
        exporter = new CSVExporter('detection');
        break;
      case 'csv-classification':
        exporter = new CSVExporter('classification');
        break;
      case 'csv-keypoints':
        exporter = new CSVExporter('keypoints');
        break;
      case 'csv-landmarks':
        exporter = new CSVExporter('landmarks');
        break;
      case 'folders-by-class':
        exporter = new FoldersByClassExporter();
        break;
      case 'unet-masks':
        exporter = new UNetMasksExporter();
        break;
      case 'tix':
        exporter = new TIXExporter();
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Execute export
    return await exporter.export(project, annotatedImages, onProgress);
  },
};
