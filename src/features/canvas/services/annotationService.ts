import { Annotation } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const annotationService = {
  async save(projectId: string, imageId: string, annotations: Annotation[]): Promise<void> {
    await tauriDb.saveAnnotations(projectId, imageId, annotations);
  },

  async load(projectId: string, imageId: string): Promise<Annotation[]> {
    const image = await tauriDb.getImage(projectId, imageId);
    return image?.annotations || [];
  },
};
