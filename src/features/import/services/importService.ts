import JSZip from 'jszip';
import { db, Project, AnnotixImage, ClassDefinition } from '@/lib/db';
import { DetectionResult, detectFormat } from '../utils/formatDetector';
import { getImporterForFormat } from '../utils/importerMapping';

export interface ImportServiceResult {
  project: Project;
  images: AnnotixImage[];
  stats: {
    imagesCount: number;
    classesCount: number;
    annotationsCount: number;
  };
}

function reportProgress(callback?: (progress: number) => void, value?: number): void {
  if (callback && value !== undefined) {
    callback(value);
  }
}

function validateData(classes: ClassDefinition[], images: AnnotixImage[]): void {
  // Check if classes have valid IDs
  for (const cls of classes) {
    if (cls.id === undefined || cls.name === undefined) {
      throw new Error('Invalid class definition');
    }
  }

  // Build set of valid class IDs for faster lookup
  const validClassIds = new Set(classes.map(cls => cls.id));
  const maxClassId = Math.max(...Array.from(validClassIds));
  
  // Collect errors for reporting
  const errors: string[] = [];
  const warnings: string[] = [];
  let invalidAnnotationCount = 0;

  // Check if images have valid data
  for (const image of images) {
    if (!image.name || image.width <= 0 || image.height <= 0) {
      errors.push(`Invalid image: ${image.name}`);
      continue;
    }

    // Check annotations
    let imageInvalidCount = 0;
    image.annotations = image.annotations.filter((annotation) => {
      // Verify classId exists in the classes array
      if (!validClassIds.has(annotation.classId)) {
        imageInvalidCount++;
        invalidAnnotationCount++;
        return false; // Filter out invalid annotations
      }

      if (!annotation.data) {
        imageInvalidCount++;
        invalidAnnotationCount++;
        return false;
      }

      return true;
    });

    if (imageInvalidCount > 0) {
      warnings.push(
        `Image "${image.name}": Removed ${imageInvalidCount} annotations with invalid class IDs. ` +
        `Valid IDs: ${Array.from(validClassIds).sort((a, b) => a - b).join(', ')}`
      );
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('Import validation warnings:\n' + warnings.join('\n'));
  }

  // Only throw if we have critical errors
  if (errors.length > 0) {
    throw new Error(`Data validation failed:\n${errors.slice(0, 5).join('\n')}`);
  }

  if (invalidAnnotationCount > 0) {
    console.info(`Import complete: Filtered out ${invalidAnnotationCount} annotations with invalid class IDs`);
  }
}

async function createProject(
  name: string,
  type: string,
  classes: ClassDefinition[]
): Promise<number> {
  const project: Project = {
    name,
    type: type as any,
    classes,
    metadata: {
      created: Date.now(),
      updated: Date.now(),
      version: '1.0.0',
    },
  };

  const projectId = await db.projects.add(project);
  return projectId;
}

async function storeImages(images: AnnotixImage[]): Promise<void> {
  for (const image of images) {
    const dbImage = {
      projectId: image.projectId,
      name: image.name,
      blob: image.image,
      annotations: image.annotations,
      dimensions: {
        width: image.width,
        height: image.height,
      },
      metadata: image.metadata,
    };

    await db.images.add(dbImage);
  }
}

export const importService = {
  async detectFormat(zipFile: File): Promise<DetectionResult> {
    try {
      const zip = new JSZip();
      await zip.loadAsync(zipFile);
      return await detectFormat(zip);
    } catch (error) {
      throw new Error(`Failed to detect format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async importProject(
    zipFile: File,
    projectName: string,
    onProgress?: (progress: number) => void
  ): Promise<ImportServiceResult> {
    try {
      // Validate project name
      if (!projectName || projectName.trim().length === 0) {
        throw new Error('Project name is required');
      }

      if (!/^[a-zA-Z0-9\-_.]+$/.test(projectName)) {
        throw new Error('Project name contains invalid characters');
      }

      // Load ZIP
      reportProgress(onProgress, 5);
      const zip = new JSZip();
      await zip.loadAsync(zipFile);

      // Detect format
      reportProgress(onProgress, 15);
      const detection = await detectFormat(zip);

      // Get appropriate importer
      reportProgress(onProgress, 25);
      const importer = getImporterForFormat(detection.format);

      // Import data
      reportProgress(onProgress, 35);
      const { classes, images } = await importer.import(
        zip,
        projectName,
        detection.projectType
      );

      if (classes.length === 0) {
        throw new Error('No classes found in dataset');
      }

      if (images.length === 0) {
        throw new Error('No images found in dataset');
      }

      // Fix missing classes: detect any class IDs in annotations that aren't in the class list
      reportProgress(onProgress, 37);
      const classIdSet = new Set(classes.map(c => c.id));
      const usedClassIds = new Set<number>();
      
      for (const image of images) {
        for (const annotation of image.annotations) {
          usedClassIds.add(annotation.classId);
        }
      }

      // Add missing classes
      for (const classId of usedClassIds) {
        if (!classIdSet.has(classId)) {
          console.warn(`Adding missing class with ID ${classId}`);
          classes.push({
            id: classId,
            name: `Class ${classId}`,
            color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
          });
          classIdSet.add(classId);
        }
      }

      // Validate data
      reportProgress(onProgress, 40);
      validateData(classes, images);

      // Create project
      reportProgress(onProgress, 50);
      const projectId = await createProject(projectName, detection.projectType, classes);

      // Update images with projectId
      images.forEach(img => img.projectId = projectId);

      // Store images
      reportProgress(onProgress, 75);
      await storeImages(images);

      reportProgress(onProgress, 100);

      // Calculate statistics
      const totalAnnotations = images.reduce(
        (sum, img) => sum + img.annotations.length,
        0
      );

      // Fetch project from database
      const project = await db.projects.get(projectId);
      if (!project) {
        throw new Error('Failed to retrieve created project');
      }

      return {
        project,
        images,
        stats: {
          imagesCount: images.length,
          classesCount: classes.length,
          annotationsCount: totalAnnotations,
        },
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown import error');
    }
  },
};
