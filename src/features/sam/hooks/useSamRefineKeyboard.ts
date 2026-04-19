import { useEffect } from 'react';
import { samAcceptRefine, samClearRefine } from '@/lib/tauriDb';
import type { Annotation, MaskTarget, ProjectType } from '@/lib/db';
import { useSamStore } from '../store/useSamStore';
import { CLASS_SHORTCUTS } from '../../core/constants';

interface Params {
  projectType: ProjectType | undefined;
  classes: Array<{ id: number; name: string }> | undefined;
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
 * Atajos del modo refine SAM:
 *  - Tab    : ciclar máscara multimask
 *  - Esc    : descartar puntos/bbox/prediction (sigue en refineMode)
 *  - Tecla de clase (1-0, Q-P): aceptar prediction con esa clase
 *
 * Capture-phase para ganarle a useKeyboardShortcuts global.
 */
export function useSamRefineKeyboard({
  projectType,
  classes,
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

      const {
        refineMode,
        refinePrediction,
        refineActiveIdx,
        cycleRefineActiveIdx,
        clearRefinePoints,
        setRefinePrediction,
        resetRefine,
        setRefineMode,
      } = useSamStore.getState();

      if (!refineMode) return;

      if (e.key === 'Tab') {
        if (refinePrediction && (refinePrediction.masksLowres?.length ?? 0) > 1) {
          e.preventDefault();
          e.stopPropagation();
          cycleRefineActiveIdx();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const { refinePoints, refineBbox } = useSamStore.getState();
        const hasInput = !!(refinePrediction || refinePoints.length > 0 || refineBbox);
        if (hasInput) {
          clearRefinePoints();
          setRefinePrediction(null);
          void samClearRefine().catch(() => {});
        } else {
          resetRefine();
          setRefineMode(false);
        }
        return;
      }

      // Tecla de clase: aceptar prediction
      if (!refinePrediction || !classes) return;
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

      void (async () => {
        try {
          const data = await samAcceptRefine(refineActiveIdx, tgt, 2.0);
          const ann: Annotation = {
            id: crypto.randomUUID(),
            type: tgt as ProjectType,
            classId: cls.id,
            data: data as Annotation['data'],
          };
          await addAnnotation(ann);
          // Limpia puntos para iniciar otra refine sin salir del modo.
          clearRefinePoints();
          setRefinePrediction(null);
        } catch (err) {
          console.error('[SAM] accept_refine falló:', err);
        }
      })();
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [projectType, classes, addAnnotation]);
}
