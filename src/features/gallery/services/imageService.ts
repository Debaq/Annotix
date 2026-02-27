import { AnnotixImage } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const imageService = {
  async get(id: number): Promise<AnnotixImage | undefined> {
    const image = await tauriDb.getImage(id);
    return image ?? undefined;
  },

  async listByProject(projectId: number): Promise<AnnotixImage[]> {
    return await tauriDb.listImagesByProject(projectId);
  },

  async delete(id: number): Promise<void> {
    await tauriDb.deleteImage(id);
  },

  /**
   * Upload múltiple desde file paths nativos (post file picker)
   */
  async uploadFromPaths(projectId: number, filePaths: string[]): Promise<number[]> {
    return await tauriDb.uploadImages(projectId, filePaths);
  },

  /**
   * Upload desde bytes (para importación y otros usos programáticos)
   */
  async uploadFromBytes(
    projectId: number,
    fileName: string,
    data: Uint8Array,
    annotations: AnnotixImage['annotations'] = []
  ): Promise<number> {
    return await tauriDb.uploadImageBytes(
      projectId,
      fileName,
      Array.from(data),
      annotations
    );
  },

  /**
   * Upload múltiple desde File objects del browser (compatibilidad)
   * Lee cada File como ArrayBuffer y lo envía al backend
   */
  async uploadMultiple(projectId: number, files: File[]): Promise<void> {
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      await this.uploadFromBytes(projectId, file.name, data);
    }
  },

  /**
   * Obtener la ruta absoluta del archivo de imagen
   */
  async getFilePath(id: number): Promise<string> {
    return await tauriDb.getImageFilePath(id);
  },

  /**
   * Obtener los bytes raw de una imagen
   */
  async getImageData(id: number): Promise<Uint8Array> {
    const data = await tauriDb.getImageData(id);
    return new Uint8Array(data);
  },
};
