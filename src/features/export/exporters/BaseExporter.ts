import { Project, AnnotixImage } from '@/lib/db';

export abstract class BaseExporter {
  abstract export(
    project: Project,
    images: AnnotixImage[],
    onProgress?: (progress: number) => void
  ): Promise<Blob>;

  protected updateProgress(current: number, total: number, onProgress?: (progress: number) => void): void {
    if (onProgress) {
      const progress = total > 0 ? (current / total) * 100 : 0;
      onProgress(progress);
    }
  }
}
