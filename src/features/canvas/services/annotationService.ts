import { db, Annotation } from '@/lib/db';

export const annotationService = {
  async save(imageId: number, annotations: Annotation[]): Promise<void> {
    const image = await db.images.get(imageId);
    if (!image) return;

    await db.images.update(imageId, {
      annotations,
      metadata: {
        ...image.metadata,
        annotated: Date.now(),
        status: 'annotated' as const,
      },
    });
  },

  async load(imageId: number): Promise<Annotation[]> {
    const image = await db.images.get(imageId);
    return image?.annotations || [];
  },
};
