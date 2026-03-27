import type { Annotation, MaskData } from '@/lib/db';

/**
 * Decodifica un base64 PNG a un canvas 2D.
 */
function decodeToCanvas(base64png: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.src = base64png;
  });
}

/**
 * Flood-fill 4-conexo: retorna todas las coordenadas conectadas
 * con alpha > 0 partiendo de (startX, startY).
 */
function floodFill(imageData: ImageData, startX: number, startY: number): Set<number> {
  const { width, height, data } = imageData;
  const x0 = Math.round(startX);
  const y0 = Math.round(startY);

  if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) return new Set();

  const startIdx = (y0 * width + x0) * 4;
  if (data[startIdx + 3] === 0) return new Set(); // pixel transparente

  const visited = new Set<number>();
  const queue: number[] = [x0 + y0 * width];
  visited.add(x0 + y0 * width);

  while (queue.length > 0) {
    const pos = queue.pop()!;
    const px = pos % width;
    const py = (pos - px) / width;

    // 4 vecinos
    const neighbors = [
      px > 0 ? pos - 1 : -1,
      px < width - 1 ? pos + 1 : -1,
      py > 0 ? pos - width : -1,
      py < height - 1 ? pos + width : -1,
    ];

    for (const n of neighbors) {
      if (n < 0 || visited.has(n)) continue;
      if (data[n * 4 + 3] > 0) {
        visited.add(n);
        queue.push(n);
      }
    }
  }

  return visited;
}

export interface ReclassifyResult {
  /** Anotaciones actualizadas (mismo array, mismas posiciones) */
  updatedAnnotations: Annotation[];
  /** true si hubo cambios */
  changed: boolean;
}

/**
 * Reclasifica una isla de píxeles de una clase a otra.
 *
 * @param x coordenada X en imagen
 * @param y coordenada Y en imagen
 * @param imageWidth ancho de la imagen
 * @param imageHeight alto de la imagen
 * @param targetClassId clase destino (clase activa)
 * @param targetColor color hex de la clase destino
 * @param annotations todas las anotaciones actuales
 * @returns resultado con anotaciones actualizadas o null si no hubo cambio
 */
export async function reclassifyIsland(
  x: number,
  y: number,
  imageWidth: number,
  imageHeight: number,
  targetClassId: number,
  targetColor: string,
  annotations: Annotation[],
): Promise<ReclassifyResult> {
  const noChange: ReclassifyResult = { updatedAnnotations: annotations, changed: false };

  // Buscar todas las máscaras
  const maskEntries: { idx: number; ann: Annotation }[] = [];
  for (let i = 0; i < annotations.length; i++) {
    if (annotations[i].type === 'mask') {
      maskEntries.push({ idx: i, ann: annotations[i] });
    }
  }
  if (maskEntries.length === 0) return noChange;

  // Decodificar máscaras y encontrar cuál tiene un pixel en (x, y)
  const canvases = await Promise.all(
    maskEntries.map(({ ann }) =>
      decodeToCanvas((ann.data as MaskData).base64png, imageWidth, imageHeight)
    )
  );

  const px = Math.round(x);
  const py = Math.round(y);
  let sourceIdx = -1;

  for (let i = 0; i < canvases.length; i++) {
    const ctx = canvases[i].getContext('2d')!;
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    if (pixel[3] > 0) {
      sourceIdx = i;
      break;
    }
  }

  if (sourceIdx < 0) return noChange; // click en zona vacía

  const sourceEntry = maskEntries[sourceIdx];
  if (sourceEntry.ann.classId === targetClassId) return noChange; // misma clase

  // Flood-fill en el canvas origen para obtener la isla
  const sourceCanvas = canvases[sourceIdx];
  const sourceCtx = sourceCanvas.getContext('2d')!;
  const sourceData = sourceCtx.getImageData(0, 0, imageWidth, imageHeight);
  const island = floodFill(sourceData, x, y);

  if (island.size === 0) return noChange;

  // Borrar isla del canvas origen
  for (const pos of island) {
    const offset = pos * 4;
    sourceData.data[offset] = 0;
    sourceData.data[offset + 1] = 0;
    sourceData.data[offset + 2] = 0;
    sourceData.data[offset + 3] = 0;
  }
  sourceCtx.putImageData(sourceData, 0, 0);

  // Buscar o crear canvas destino
  const targetMaskIdx = maskEntries.findIndex((e) => e.ann.classId === targetClassId);
  let targetCanvas: HTMLCanvasElement;
  if (targetMaskIdx >= 0) {
    targetCanvas = canvases[targetMaskIdx];
  } else {
    targetCanvas = document.createElement('canvas');
    targetCanvas.width = imageWidth;
    targetCanvas.height = imageHeight;
  }

  // Parsear color destino
  const r = parseInt(targetColor.slice(1, 3), 16);
  const g = parseInt(targetColor.slice(3, 5), 16);
  const b = parseInt(targetColor.slice(5, 7), 16);

  // Pintar isla en canvas destino con el color de la clase destino
  const targetCtx = targetCanvas.getContext('2d')!;
  const targetData = targetCtx.getImageData(0, 0, imageWidth, imageHeight);
  for (const pos of island) {
    const offset = pos * 4;
    targetData.data[offset] = r;
    targetData.data[offset + 1] = g;
    targetData.data[offset + 2] = b;
    targetData.data[offset + 3] = 255;
  }
  targetCtx.putImageData(targetData, 0, 0);

  // Generar PNGs actualizados
  const sourceBase64 = sourceCanvas.toDataURL('image/png');
  const targetBase64 = targetCanvas.toDataURL('image/png');

  // Construir array de anotaciones actualizado (mantener orden)
  const updated = [...annotations];

  // Actualizar máscara origen (si quedó vacía, eliminarla)
  const sourceHasPixels = sourceData.data.some((_v, i) => i % 4 === 3 && sourceData.data[i] > 0);
  if (sourceHasPixels) {
    updated[sourceEntry.idx] = {
      ...sourceEntry.ann,
      data: { base64png: sourceBase64 },
    };
  } else {
    // Marcar para eliminar (reemplazar con null y filtrar después)
    (updated as any)[sourceEntry.idx] = null;
  }

  // Actualizar o crear máscara destino
  if (targetMaskIdx >= 0) {
    const targetEntry = maskEntries[targetMaskIdx];
    updated[targetEntry.idx] = {
      ...targetEntry.ann,
      data: { base64png: targetBase64 },
    };
  } else {
    // Crear nueva anotación de máscara
    updated.push({
      id: crypto.randomUUID(),
      type: 'mask',
      classId: targetClassId,
      data: { base64png: targetBase64 },
    });
  }

  // Filtrar nulls (máscaras vacías eliminadas)
  const finalAnnotations = updated.filter((a): a is Annotation => a !== null);

  return { updatedAnnotations: finalAnnotations, changed: true };
}
