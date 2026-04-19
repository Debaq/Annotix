import { useEffect } from 'react';
import { samAcceptMask } from '@/lib/tauriDb';
import type { Annotation, MaskTarget, ProjectType } from '@/lib/db';
import { useSamStore } from '../store/useSamStore';
import { CLASS_SHORTCUTS } from '../../core/constants';

interface Params {
  projectType: ProjectType | undefined;
  classes: Array<{ id: number; name: string }> | undefined;
  imageId: string | null;
  addAnnotation: (a: Annotation) => Promise<void>;
}

function projectTypeToTarget(t: ProjectType | undefined): MaskTarget | null {
  if (t === 'bbox') return 'bbox';
  if (t === 'obb') return 'obb';
  if (t === 'polygon') return 'polygon';
  if (t === 'mask') return 'mask';
  return null;
}

/**
 * Cuando hay una máscara en hover y SAM Assist activo, intercepta
 * teclas de clase (1-0, Q-P) para aceptar la máscara con esa clase.
 *
 * Se registra ANTES que `useKeyboardShortcuts` global usando capture=true.
 */
export function useSamClassAccept({
  projectType,
  classes,
  imageId,
  addAnnotation,
}: Params) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) return;

      const { samAssistActive, hoverMaskId, activeMaskIdx, removeCandidate } =
        useSamStore.getState();
      if (!samAssistActive || !hoverMaskId || !imageId || !classes) return;

      const tgt = projectTypeToTarget(projectType);
      if (!tgt) return;

      const key = e.key.toLowerCase();
      let classIndex = -1;

      if (/^[1-9]$/.test(key)) {
        classIndex = parseInt(key, 10) - 1;
      } else if (key === '0') {
        classIndex = 9;
      } else {
        const li = CLASS_SHORTCUTS.indexOf(key);
        if (li !== -1) classIndex = li;
      }

      if (classIndex < 0 || classIndex >= classes.length) return;
      const cls = classes[classIndex];
      if (!cls) return;

      e.preventDefault();
      e.stopPropagation();

      const maskId = hoverMaskId;
      void (async () => {
        try {
          const data = await samAcceptMask(imageId, maskId, activeMaskIdx, tgt, 2.0);
          const ann: Annotation = {
            id: crypto.randomUUID(),
            type: tgt as ProjectType,
            classId: cls.id,
            data: data as Annotation['data'],
          };
          await addAnnotation(ann);
          removeCandidate(maskId);
        } catch (err) {
          console.error('[SAM] accept_mask falló:', err);
        }
      })();
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [projectType, classes, imageId, addAnnotation]);
}
