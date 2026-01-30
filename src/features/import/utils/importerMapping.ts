import { ExportFormat } from '@/features/export/utils/formatMapping';
import { BaseImporter } from '../importers/BaseImporter';
import { YOLOImporter } from '../importers/YOLOImporter';
import { COCOImporter } from '../importers/COCOImporter';
import { PascalVOCImporter } from '../importers/PascalVOCImporter';
import { CSVImporter } from '../importers/CSVImporter';
import { FoldersByClassImporter } from '../importers/FoldersByClassImporter';
import { UNetMasksImporter } from '../importers/UNetMasksImporter';
import { TIXImporter } from '../importers/TIXImporter';

export function getImporterForFormat(format: ExportFormat): BaseImporter {
  switch (format) {
    case 'yolo-detection':
      return new YOLOImporter();
    case 'yolo-segmentation':
      return new YOLOImporter();
    case 'coco':
      return new COCOImporter();
    case 'pascal-voc':
      return new PascalVOCImporter();
    case 'csv-detection':
      return new CSVImporter('detection');
    case 'csv-classification':
      return new CSVImporter('classification');
    case 'csv-keypoints':
      return new CSVImporter('keypoints');
    case 'csv-landmarks':
      return new CSVImporter('landmarks');
    case 'folders-by-class':
      return new FoldersByClassImporter();
    case 'unet-masks':
      return new UNetMasksImporter();
    case 'tix':
      return new TIXImporter();
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
