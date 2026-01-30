import JSZip from 'jszip';
import { ExportFormat } from '@/features/export/utils/formatMapping';
import { ProjectType } from '@/lib/db';

export interface DetectionResult {
  format: ExportFormat;
  projectType: ProjectType;
  confidence: number; // 0-1
  classCount?: number;
}

export async function detectFormat(zip: JSZip): Promise<DetectionResult> {
  const files = Object.keys(zip.files);
  
  // Detect YOLO format
  if (hasFile(files, 'classes.txt') && hasFile(files, 'data.yaml')) {
    const yoloResult = await detectYOLOFormat(zip, files);
    if (yoloResult) return yoloResult;
  }

  // Detect COCO format
  if (hasFile(files, 'annotations.json')) {
    const cocoResult = await detectCOCOFormat(zip, files);
    if (cocoResult) return cocoResult;
  }

  // Detect TIX (Annotix) format: annotations.json + images/ folder with our schema
  if (hasFile(files, 'annotations.json') && hasFolder(files, 'images')) {
    const tixResult = await detectTIXFormat(zip, files);
    if (tixResult) return tixResult;
  }

  // Detect Pascal VOC format
  if (hasFolder(files, 'Annotations') && hasFolder(files, 'images')) {
    const vocResult = await detectPascalVOCFormat(zip, files);
    if (vocResult) return vocResult;
  }

  // Detect CSV format
  if (hasFile(files, 'annotations.csv')) {
    const csvResult = await detectCSVFormat(zip, files);
    if (csvResult) return csvResult;
  }

  // Detect U-Net Masks format
  if (hasFolder(files, 'masks') && hasFolder(files, 'images')) {
    const unetResult = await detectUNetFormat(zip, files);
    if (unetResult) return unetResult;
  }

  // Detect Folders by Class format
  const folderResult = await detectFoldersByClassFormat(zip, files);
  if (folderResult) return folderResult;

  throw new Error('Unable to detect dataset format');
}

async function detectYOLOFormat(zip: JSZip, files: string[]): Promise<DetectionResult | null> {
  try {
    const classesFile = zip.file('classes.txt');
    if (!classesFile) return null;

    const classesContent = await classesFile.async('text');
    const classCount = classesContent.trim().split('\n').length;

    // Check if segmentation (has polygon format in .txt files)
    const txtFiles = files.filter(f => f.startsWith('labels/') && f.endsWith('.txt'));
    
    if (txtFiles.length === 0) return null;

    const firstTxtFile = zip.file(txtFiles[0]);
    if (!firstTxtFile) return null;

    const content = await firstTxtFile.async('text');
    const isSegmentation = detectSegmentationFormat(content);

    return {
      format: isSegmentation ? 'yolo-segmentation' : 'yolo-detection',
      projectType: isSegmentation ? 'polygon' : 'bbox',
      confidence: 0.95,
      classCount,
    };
  } catch {
    return null;
  }
}

async function detectCOCOFormat(zip: JSZip, files: string[]): Promise<DetectionResult | null> {
  try {
    const annotFile = zip.file('annotations.json');
    if (!annotFile) return null;

    const content = await annotFile.async('text');
    const data = JSON.parse(content);

    if (!data.annotations || !data.images || !data.categories) return null;

    // Determine if it's instance segmentation or bbox
    const hasSegmentation = data.annotations.some((a: any) => a.segmentation);
    const projectType = hasSegmentation ? 'instance-segmentation' : 'bbox';

    return {
      format: 'coco',
      projectType,
      confidence: 0.95,
      classCount: data.categories.length,
    };
  } catch {
    return null;
  }
}

async function detectPascalVOCFormat(zip: JSZip, files: string[]): Promise<DetectionResult | null> {
  try {
    const xmlFiles = files.filter(f => f.startsWith('Annotations/') && f.endsWith('.xml'));
    
    if (xmlFiles.length === 0) return null;

    const firstXmlFile = zip.file(xmlFiles[0]);
    if (!firstXmlFile) return null;

    const content = await firstXmlFile.async('text');
    
    // Basic validation - check for Pascal VOC XML structure
    if (!content.includes('<annotation>') || !content.includes('<object>')) {
      return null;
    }

    const classCount = extractPascalVOCClasses(zip, files).length;

    return {
      format: 'pascal-voc',
      projectType: 'bbox',
      confidence: 0.9,
      classCount,
    };
  } catch {
    return null;
  }
}

async function detectCSVFormat(zip: JSZip, files: string[]): Promise<DetectionResult | null> {
  try {
    const csvFile = zip.file('annotations.csv');
    if (!csvFile) return null;

    const content = await csvFile.async('text');
    const lines = content.trim().split('\n');
    
    if (lines.length < 2) return null;

    const header = lines[0].toLowerCase();
    const classesFile = zip.file('classes.csv');
    
    let classCount = 0;
    if (classesFile) {
      const classesContent = await classesFile.async('text');
      classCount = classesContent.trim().split('\n').length - 1; // -1 for header
    }

    // Detect CSV type
    if (header.includes('x,') && header.includes('y,') && header.includes('width,') && header.includes('height,')) {
      return {
        format: 'csv-detection',
        projectType: 'bbox',
        confidence: 0.9,
        classCount,
      };
    }

    if (header.includes('keypoint')) {
      return {
        format: 'csv-keypoints',
        projectType: 'keypoints',
        confidence: 0.9,
        classCount,
      };
    }

    if (header.includes('landmark')) {
      return {
        format: 'csv-landmarks',
        projectType: 'landmarks',
        confidence: 0.9,
        classCount,
      };
    }

    if (header.includes('label') || header.includes('class')) {
      return {
        format: 'csv-classification',
        projectType: 'classification',
        confidence: 0.85,
        classCount,
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function detectUNetFormat(zip: JSZip, files: string[]): Promise<DetectionResult | null> {
  try {
    const maskFiles = files.filter(f => f.startsWith('masks/') && f.endsWith('.png'));
    
    if (maskFiles.length === 0) return null;

    return {
      format: 'unet-masks',
      projectType: 'instance-segmentation',
      confidence: 0.9,
      classCount: 2, // Binary masks
    };
  } catch {
    return null;
  }
}

async function detectTIXFormat(zip: JSZip, files: string[]): Promise<DetectionResult | null> {
  try {
    const annotFile = zip.file('annotations.json');
    if (!annotFile) return null;

    const content = await annotFile.async('text');
    const data = JSON.parse(content);

    // Expecting a structure like { project, classes, images }
    if (!data.images || !Array.isArray(data.images)) return null;

    const classCount = Array.isArray(data.classes) ? data.classes.length : 0;

    // Determine project type roughly by presence of segmentation fields
    let projectType: ProjectType = 'bbox';
    for (const img of data.images) {
      if (img.annotations && img.annotations.some((a: any) => !!a.segmentation)) {
        projectType = 'instance-segmentation';
        break;
      }
    }

    return {
      format: 'tix',
      projectType,
      confidence: 0.95,
      classCount,
    };
  } catch {
    return null;
  }
}

async function detectFoldersByClassFormat(zip: JSZip, files: string[]): Promise<DetectionResult | null> {
  try {
    // Look for image extensions in first level folders
    const imageFolders = new Set<string>();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];

    files.forEach(file => {
      const parts = file.split('/');
      if (parts.length === 2) {
        const ext = parts[1].toLowerCase();
        if (imageExtensions.some(e => ext.endsWith(e))) {
          imageFolders.add(parts[0]);
        }
      }
    });

    if (imageFolders.size >= 2) {
      return {
        format: 'folders-by-class',
        projectType: 'classification',
        confidence: 0.85,
        classCount: imageFolders.size,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function hasFile(files: string[], filename: string): boolean {
  return files.some(f => f.endsWith(filename) && !f.includes('/') || f === `${filename}`);
}

function hasFolder(files: string[], folderName: string): boolean {
  return files.some(f => f.startsWith(folderName + '/'));
}

function detectSegmentationFormat(content: string): boolean {
  // YOLO segmentation format has multiple coordinate pairs per line
  const lines = content.trim().split('\n');
  
  for (const line of lines) {
    const parts = line.trim().split(' ');
    // Segmentation has format: class_id x1 y1 x2 y2 ... xn yn
    // Detection has format: class_id x_center y_center width height (5 parts)
    if (parts.length > 5) {
      // Check if it looks like polygon points (even number of coordinates after class_id)
      const coordCount = parts.length - 1;
      if (coordCount % 2 === 0 && coordCount >= 6) {
        return true;
      }
    }
  }
  
  return false;
}

function extractPascalVOCClasses(zip: JSZip, files: string[]): string[] {
  const classes = new Set<string>();
  // This will be populated during parsing - for now just estimate
  return Array.from(classes);
}
