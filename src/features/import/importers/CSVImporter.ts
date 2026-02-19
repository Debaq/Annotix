import JSZip from 'jszip';
import { BaseImporter, ImportResult } from './BaseImporter';
import { Annotation, BBoxData, KeypointsData, ClassificationData, AnnotixImage, LandmarksData } from '@/lib/db';

export class CSVImporter extends BaseImporter {
  constructor(private csvType: 'detection' | 'classification' | 'keypoints' | 'landmarks') {
    super();
  }

  async import(
    zip: JSZip,
    projectName: string,
    projectType: string
  ): Promise<ImportResult> {
    try {
      // Read classes.csv
      const classesContent = await this.extractFileAsText(zip, 'classes.csv');
      const classLines = classesContent.trim().split('\n');
      
      // Parse classes (assume format: id,name or just name)
      const classes = this.parseClasses(classLines);

      // Read annotations.csv
      const annotContent = await this.extractFileAsText(zip, 'annotations.csv');
      const annotLines = annotContent.trim().split('\n');

      if (annotLines.length < 2) {
        throw new Error('No annotations found in annotations.csv');
      }

      // Parse header
      const header = annotLines[0].split(',').map(h => h.trim());

      // Get image files
      const imageFiles = await this.getFilesList(zip, 'images');

      // Map image names to their paths
      const imageMap = new Map<string, string>();
      for (const imagePath of imageFiles) {
        const imageName = imagePath.split('/').pop() || '';
        imageMap.set(imageName, imagePath);
      }

      // Parse annotations
      const images = [];
      for (let i = 1; i < annotLines.length; i++) {
        const line = annotLines[i].trim();
        if (!line) continue;

        try {
          const data = this.parseCSVLine(line);
          const imageName = data[header[0]];

          if (!imageMap.has(imageName)) {
            console.warn(`Image not found: ${imageName}`);
            continue;
          }

          const imagePath = imageMap.get(imageName)!;
          const imageBlob = await this.extractFileAsBlob(zip, imagePath);
          const { width, height } = await this.getImageDimensions(imageBlob);

          // Parse annotation
          const annotation = this.parseAnnotation(
            data,
            header,
            width,
            height,
            classes
          );

          // Check if image already exists in array
          let annotixImage: AnnotixImage | undefined = images.find(img => img.name === imageName);
          if (!annotixImage) {
            annotixImage = this.createAnnotixImage(
              0, // projectId will be set later
              imageName,
              imageBlob,
              width,
              height,
              annotation ? [annotation] : []
            );
            images.push(annotixImage);
          } else if (annotation) {
            annotixImage.annotations.push(annotation);
          }
        } catch (error) {
          console.warn(`Failed to parse CSV line ${i}:`, error);
        }
      }

      return { classes, images };
    } catch (error) {
      throw new Error(`Failed to import CSV format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseClasses(lines: string[]): any[] {
    const classes: any[] = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const data = this.parseCSVLine(line);
      const id = classes.length;
      const name = data.name || data[Object.keys(data)[0]];

      classes.push(this.createClassDefinition(id, name));
    }

    return classes;
  }

  private parseCSVLine(line: string): Record<string, string> {
    const result: Record<string, string> = {};
    let current = '';
    let inQuotes = false;
    let colonIndex = 0;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result[colonIndex] = current.replace(/^"|"$/g, '').trim();
        current = '';
        colonIndex++;
      } else {
        current += char;
      }
    }

    if (current) {
      result[colonIndex] = current.replace(/^"|"$/g, '').trim();
    }

    return result;
  }

  private parseAnnotation(
    data: Record<string, string>,
    header: string[],
    imageWidth: number,
    imageHeight: number,
    classes: any[]
  ): Annotation | null {
    try {
      switch (this.csvType) {
        case 'detection': {
          const xIndex = header.findIndex(h => h.toLowerCase() === 'x' || h.toLowerCase().includes('x'));
          const yIndex = header.findIndex(h => h.toLowerCase() === 'y' || h.toLowerCase().includes('y'));
          const wIndex = header.findIndex(h => h.toLowerCase().includes('width') || h.toLowerCase().includes('w'));
          const hIndex = header.findIndex(h => h.toLowerCase().includes('height') || h.toLowerCase().includes('h'));
          const classIndex = header.findIndex(h => h.toLowerCase() === 'class' || h.toLowerCase() === 'label');

          if (xIndex < 0 || yIndex < 0 || wIndex < 0 || hIndex < 0 || classIndex < 0) {
            return null;
          }

          const x = parseFloat(Object.values(data)[xIndex] || '0');
          const y = parseFloat(Object.values(data)[yIndex] || '0');
          const w = parseFloat(Object.values(data)[wIndex] || '0');
          const h = parseFloat(Object.values(data)[hIndex] || '0');
          const className = Object.values(data)[classIndex];

          const foundClass = classes.find((c: any) => c.name === className);
          if (!foundClass) {
            console.warn(`Class "${className}" not found in class list`);
            return null;
          }

          const classId = foundClass.id;

          const bboxData: BBoxData = { x, y, width: w, height: h };
          return this.createAnnotation(classId, 'bbox', bboxData);
        }

        case 'classification': {
          const classIndex = header.findIndex(h => h.toLowerCase() === 'class' || h.toLowerCase() === 'label');
          
          if (classIndex < 0) return null;

          const className = Object.values(data)[classIndex];
          const foundClass = classes.find((c: any) => c.name === className);
          if (!foundClass) {
            console.warn(`Class "${className}" not found in class list`);
            return null;
          }

          const classId = foundClass.id;

          const classData: ClassificationData = { labels: [classId] };
          return this.createAnnotation(classId, 'classification', classData);
        }

        case 'keypoints': {
          const keypointIndex = header.findIndex(h => h.toLowerCase().includes('keypoint'));
          
          if (keypointIndex < 0) return null;

          // Parse keypoint data (assuming JSON format or x,y,v format)
          const keypointStr = Object.values(data)[keypointIndex];
          const points = this.parseKeypointString(keypointStr);

          const classIndex = header.findIndex(h => h.toLowerCase() === 'class' || h.toLowerCase() === 'label');
          const className = classIndex >= 0 ? Object.values(data)[classIndex] : undefined;
          const foundClass = className ? classes.find((c: any) => c.name === className) : undefined;
          const classId = foundClass?.id ?? 0;

          const kpData: KeypointsData = {
            points,
            skeletonType: 'coco-17',
          };

          return this.createAnnotation(classId, 'keypoints', kpData);
        }

        case 'landmarks': {
          const landmarkIndex = header.findIndex(h => h.toLowerCase().includes('landmark'));
          
          if (landmarkIndex < 0) return null;

          const landmarkStr = Object.values(data)[landmarkIndex];
          const classIndex = header.findIndex(h => h.toLowerCase() === 'class' || h.toLowerCase() === 'label');
          const className = classIndex >= 0 ? Object.values(data)[classIndex] : undefined;
          const foundClass = className ? classes.find((c: any) => c.name === className) : undefined;
          const classId = foundClass?.id ?? 0;

          const points = this.parseKeypointString(landmarkStr).map((point, idx) => ({
            x: point.x,
            y: point.y,
            name: point.name || `Point ${idx + 1}`,
          }));

          const lmData: LandmarksData = { points };

          return this.createAnnotation(classId, 'landmarks', lmData);
        }

        default:
          return null;
      }
    } catch (error) {
      console.warn(`Failed to parse annotation:`, error);
      return null;
    }
  }

  private parseKeypointString(
    str: string
  ): Array<{ x: number; y: number; visible: boolean; name?: string }> {
    const points = [];

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map((p: any, idx: number) => ({
          x: p.x || p[0] || 0,
          y: p.y || p[1] || 0,
          visible: p.visible !== false,
          name: p.name || `point_${idx}`,
        }));
      }
    } catch {
      // Try parsing as delimited values
      const parts = str.split(/[;|]/);
      for (let i = 0; i < parts.length; i += 3) {
        const x = parseFloat(parts[i]);
        const y = parseFloat(parts[i + 1]);
        const visible = parts[i + 2] ? parseFloat(parts[i + 2]) > 0 : true;

        if (!isNaN(x) && !isNaN(y)) {
          points.push({
            x,
            y,
            visible,
            name: `point_${points.length}`,
          });
        }
      }
    }

    return points;
  }
}
