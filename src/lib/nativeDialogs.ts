/**
 * nativeDialogs.ts - Wrappers para diálogos nativos del SO via Tauri plugins
 * Reemplaza <input type="file"> por file pickers nativos.
 */
import { open, save } from '@tauri-apps/plugin-dialog';

/**
 * Abre file picker nativo para seleccionar imágenes.
 * @returns Array de rutas absolutas, o null si se canceló
 */
export async function pickImages(): Promise<string[] | null> {
  const result = await open({
    multiple: true,
    filters: [
      {
        name: 'Imágenes y PDF',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'pdf'],
      },
      {
        name: 'PDF',
        extensions: ['pdf'],
      },
      {
        name: 'Imágenes',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'],
      },
      {
        name: 'Todos los archivos',
        extensions: ['*'],
      },
    ],
  });

  if (!result) return null;
  // open() retorna string | string[] | null
  return Array.isArray(result) ? result : [result];
}

/**
 * Abre file picker nativo para seleccionar un video.
 * @returns Ruta absoluta, o null si se canceló
 */
export async function pickVideo(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [
      {
        name: 'Video',
        extensions: [
          'mp4', 'avi', 'mov', 'mkv', 'webm',
          'MP4', 'AVI', 'MOV', 'MKV', 'WEBM',
        ],
      },
    ],
  });

  if (!result) return null;
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Abre file picker nativo para seleccionar un archivo CSV.
 * @returns Ruta absoluta, o null si se canceló
 */
export async function pickCsvFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [
      {
        name: 'CSV',
        extensions: ['csv'],
      },
    ],
  });

  if (!result) return null;
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Abre file picker nativo para seleccionar un archivo ZIP/TIX.
 * @returns Ruta absoluta, o null si se canceló
 */
export async function pickZipFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [
      {
        name: 'Dataset',
        extensions: ['zip', 'tix'],
      },
    ],
  });

  if (!result) return null;
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Abre save dialog nativo para elegir dónde guardar un archivo.
 * @param defaultName Nombre de archivo por defecto
 * @param extension Extensión del archivo (sin punto)
 * @returns Ruta absoluta donde guardar, o null si se canceló
 */
export async function pickSaveLocation(
  defaultName: string,
  extension: string
): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
    filters: [
      {
        name: extension.toUpperCase(),
        extensions: [extension],
      },
    ],
  });

  return result;
}

/**
 * Abre file picker nativo para seleccionar un modelo ONNX.
 * @returns Ruta absoluta, o null si se canceló
 */
export async function pickOnnxModel(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [
      {
        name: 'ONNX Model',
        extensions: ['onnx'],
      },
    ],
  });

  if (!result) return null;
  return Array.isArray(result) ? result[0] : result;
}
