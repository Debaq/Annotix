import { Annotation } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const annotationService = {
  async save(imageId: number, annotations: Annotation[]): Promise<void> {
    await tauriDb.saveAnnotations(imageId, annotations);
  },

  async load(imageId: number): Promise<Annotation[]> {
    const image = await tauriDb.getImage(imageId);
    return image?.annotations || [];
  },
};
