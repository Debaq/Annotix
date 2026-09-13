// Apila un paso del flujo mientras el componente está montado o el diálogo
// abierto, y lo retira al salir. Headless.

import { useEffect } from 'react';
import { popStep, pushStep } from './studySession';
import type { StudyStep } from './studySteps';

export function useStudyStep(step: StudyStep, active = true): void {
  useEffect(() => {
    if (!active) return;
    pushStep(step);
    return () => popStep(step);
  }, [step, active]);
}
