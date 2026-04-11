import type { Annotation, MaskData } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export interface ReclassifyResult {
  updatedAnnotations: Annotation[];
  changed: boolean;
}

/**
 * Reclasifica una isla de píxeles de una clase a otra.
 * Delega flood-fill y manipulación de píxeles al backend Rust.
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

  // Recopilar máscaras con sus índices
  const maskEntries: { idx: number; ann: Annotation }[] = [];
  for (let i = 0; i < annotations.length; i++) {
    if (annotations[i].type === 'mask') {
      maskEntries.push({ idx: i, ann: annotations[i] });
    }
  }
  if (maskEntries.length === 0) return noChange;

  // Preparar inputs para Rust
  const masksBase64: tauriDb.MaskInput[] = maskEntries.map((e) => ({
    base64png: (e.ann.data as MaskData).base64png,
    classId: e.ann.classId,
  }));

  const result = await tauriDb.reclassifyMaskIsland(
    masksBase64,
    Math.round(x),
    Math.round(y),
    imageWidth,
    imageHeight,
    targetClassId,
    targetColor,
  );

  if (!result.changed) return noChange;

  // Reconstruir array de anotaciones
  const updated = [...annotations];

  for (const mu of result.updatedMasks) {
    const entry = maskEntries[mu.index];
    if (!entry) continue;

    if (mu.base64png) {
      updated[entry.idx] = {
        ...entry.ann,
        data: { base64png: mu.base64png },
      };
    } else {
      // Máscara vacía: marcar para eliminar
      (updated as any)[entry.idx] = null;
    }
  }

  // Agregar nueva máscara si se creó
  if (result.newMask) {
    updated.push({
      id: crypto.randomUUID(),
      type: 'mask',
      classId: targetClassId,
      data: { base64png: result.newMask },
    });
  }

  const finalAnnotations = updated.filter((a): a is Annotation => a !== null);
  return { updatedAnnotations: finalAnnotations, changed: true };
}
