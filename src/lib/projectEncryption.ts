import { invoke } from '@tauri-apps/api/core';

/**
 * Estado de cifrado de un proyecto, tal como lo publica Rust.
 */
export interface EncryptionState {
  encrypted: boolean;
  unlocked: boolean;
  publicLabel: string | null;
  slots: { id: string; label: string; createdAt: number }[];
  keyringAvailable: boolean;
  remembered: boolean;
}

/**
 * Cache del estado por proyecto.
 *
 * Se consulta antes de cada carga de imagen —y una galería pide quinientas—,
 * así que preguntarlo cada vez sería un viaje a Rust por miniatura. Lo que
 * cambia el estado (activar, abrir, cerrar) invalida la entrada a mano: es un
 * puñado de sitios y todos pasan por esta misma capa.
 */
const cache = new Map<string, Promise<EncryptionState>>();

export function getEncryptionState(projectId: string): Promise<EncryptionState> {
  let entrada = cache.get(projectId);
  if (!entrada) {
    entrada = invoke<EncryptionState>('estado_cifrado', { projectId }).catch(() => ({
      encrypted: false,
      unlocked: false,
      publicLabel: null,
      slots: [],
      keyringAvailable: false,
      remembered: false,
    }));
    cache.set(projectId, entrada);
  }
  return entrada;
}

export function invalidateEncryptionState(projectId?: string) {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}

/**
 * `true` si las imágenes de este proyecto hay que pedirlas descifradas a Rust.
 *
 * El webview lee el disco por su cuenta con `convertFileSrc`, y de un archivo
 * cifrado sólo saca ruido: no falla con un error claro, falla con una imagen
 * rota.
 */
export async function needsDecryptedBytes(projectId: string): Promise<boolean> {
  const estado = await getEncryptionState(projectId);
  return estado.encrypted;
}

/**
 * URL de la miniatura de una imagen, cifrada o no.
 *
 * Devuelve también cómo soltarla: una URL de blob que nadie revoca es memoria
 * que no vuelve, y una galería crea cientos.
 */
export async function thumbnailUrl(
  projectId: string,
  imageId: string,
): Promise<{ url: string; revoke: () => void } | null> {
  const bytes = await invoke<number[] | null>('get_thumbnail_data', {
    projectId,
    id: imageId,
  }).catch(() => null);
  const datos = bytes ?? (await invoke<number[]>('get_image_data', { projectId, id: imageId }).catch(() => null));
  if (!datos) return null;
  const url = URL.createObjectURL(new Blob([new Uint8Array(datos)]));
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
