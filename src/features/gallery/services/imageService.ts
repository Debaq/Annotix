import { AnnotixImage } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const imageService = {
  async get(projectId: string, id: string): Promise<AnnotixImage | undefined> {
    const image = await tauriDb.getImage(projectId, id);
    return image ?? undefined;
  },

  async listByProject(projectId: string): Promise<AnnotixImage[]> {
    return await tauriDb.listImagesByProject(projectId);
  },

  async delete(projectId: string, id: string): Promise<void> {
    await tauriDb.deleteImage(projectId, id);
  },

  /**
   * Upload múltiple desde file paths nativos (post file picker)
   */
  async uploadFromPaths(projectId: string, filePaths: string[]): Promise<string[]> {
    return await tauriDb.uploadImages(projectId, filePaths);
  },

  /**
   * Upload desde bytes (para importación y otros usos programáticos)
   */
  async uploadFromBytes(
    projectId: string,
    fileName: string,
    data: Uint8Array,
    annotations: AnnotixImage['annotations'] = []
  ): Promise<string> {
    return await tauriDb.uploadImageBytes(
      projectId,
      fileName,
      data,
      annotations
    );
  },

  /**
   * Upload múltiple desde File objects del browser (compatibilidad)
   * Lee cada File como ArrayBuffer y lo envía al backend
   */
  async uploadMultiple(projectId: string, files: File[]): Promise<void> {
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      await this.uploadFromBytes(projectId, file.name, data);
    }
  },

  /**
   * Obtener la ruta absoluta del archivo de imagen
   */
  async getFilePath(projectId: string, id: string): Promise<string> {
    return await tauriDb.getImageFilePath(projectId, id);
  },

  /**
   * Obtener los bytes raw de una imagen
   */
  async getImageData(projectId: string, id: string): Promise<Uint8Array> {
    const data = await tauriDb.getImageData(projectId, id);
    return new Uint8Array(data);
  },
};
