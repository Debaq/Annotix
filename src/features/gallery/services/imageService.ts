import { db, AnnotixImage, NewAnnotixImage, type Image } from '@/lib/db';

// Transform AnnotixImage to Image (for database storage)
function toImage(annotixImage: NewAnnotixImage): Omit<Image, 'id'> {
  const { image, width, height, metadata, ...rest } = annotixImage;
  return {
    ...rest,
    blob: image,
    dimensions: { width, height },
    metadata: {
      uploaded: Date.now(),
      status: 'pending' as const,
      ...metadata,
    },
  };
}

// Transform Image to AnnotixImage (for component usage)
function toAnnotixImage(image: Image): AnnotixImage {
  const { blob, dimensions, ...rest } = image;
  return {
    ...rest,
    image: blob,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export const imageService = {
  async create(image: NewAnnotixImage): Promise<number> {
    const dbImage = toImage(image);
    const id = await db.images.add(dbImage);
    return id;
  },

  async get(id: number): Promise<AnnotixImage | undefined> {
    const image = await db.images.get(id);
    return image ? toAnnotixImage(image) : undefined;
  },

  async listByProject(projectId: number): Promise<AnnotixImage[]> {
    const images = await db.images
      .where('projectId')
      .equals(projectId)
      .sortBy('metadata.uploaded');
    return images.map(toAnnotixImage);
  },

  async update(id: number, updates: Partial<AnnotixImage>): Promise<void> {
    const dbUpdates: Partial<Image> = {};

    if (updates.image !== undefined) dbUpdates.blob = updates.image;
    if (updates.width !== undefined || updates.height !== undefined) {
      const current = await db.images.get(id);
      dbUpdates.dimensions = {
        width: updates.width ?? current?.dimensions.width ?? 0,
        height: updates.height ?? current?.dimensions.height ?? 0,
      };
    }
    if (updates.annotations !== undefined) dbUpdates.annotations = updates.annotations;
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;

    await db.images.update(id, dbUpdates);
  },

  async delete(id: number): Promise<void> {
    await db.images.delete(id);
  },

  async uploadMultiple(projectId: number, files: File[]): Promise<void> {
    const uploadPromises = files.map((file) => {
      return new Promise<void>((resolve, reject) => {
        // Load image to get dimensions
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = async () => {
          try {
            URL.revokeObjectURL(url);

            // Create the image entry in the database
            await this.create({
              projectId,
              name: file.name,
              image: file,
              annotations: [],
              width: img.width,
              height: img.height,
            });

            resolve();
          } catch (error) {
            URL.revokeObjectURL(url);
            reject(error);
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error(`Failed to load image: ${file.name}`));
        };

        img.src = url;
      });
    });

    await Promise.all(uploadPromises);
  },
};
