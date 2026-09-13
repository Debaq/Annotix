// Estado de sesión del modo estudio: paso activo, modalidad y contexto de
// proyecto. Vive fuera de React para que puedan emitir tanto los componentes
// como los servicios.

import { studyLog } from './studyLog';
import type { Modality } from './events';
import type { StudyStep } from './studySteps';

interface SessionState {
  step: StudyStep | null;
  stepStartedAt: number;
  projectKind: string;
  modality: Modality;
  /** `annot.first` se emite una sola vez por sesión. */
  firstAnnotationEmitted: boolean;
  /** Instante del último `tool.select` o `annot.commit`, para `duration_ms`. */
  lastAnnotMarkAt: number;
  toolId: string | null;
  editsSinceMark: number;
}

const state: SessionState = {
  step: null,
  stepStartedAt: 0,
  projectKind: 'unknown',
  modality: 'other',
  firstAnnotationEmitted: false,
  lastAnnotMarkAt: 0,
  toolId: null,
  editsSinceMark: 0,
};

export function setStudyContext(projectKind: string, modality: Modality): void {
  state.projectKind = projectKind;
  state.modality = modality;
}

export function studyContext(): { projectKind: string; modality: Modality } {
  return { projectKind: state.projectKind, modality: state.modality };
}

/**
 * El paso activo tiene dos fuentes: la pantalla en la que está el usuario
 * (`setRouteStep`) y los pasos que gobierna un diálogo o panel, que se apilan
 * encima (`pushStep`) y se retiran al cerrarse (`popStep`). Siempre manda el
 * tope de la pila; si está vacía, manda la pantalla.
 */
let routeStep: StudyStep | null = null;
const overlay: StudyStep[] = [];

function applyStep(step: StudyStep | null): void {
  if (state.step === step) return;
  const now = performance.now();
  if (state.step) {
    studyLog.emit('step.exit', {
      step_id: state.step,
      duration_ms: Math.round(now - state.stepStartedAt),
    });
  }
  state.step = step;
  state.stepStartedAt = now;
  if (step) {
    studyLog.emit('step.enter', { step_id: step, modality: state.modality });
  }
}

function resolve(): void {
  applyStep(overlay.length > 0 ? overlay[overlay.length - 1] : routeStep);
}

export function setRouteStep(step: StudyStep | null): void {
  routeStep = step;
  resolve();
}

export function pushStep(step: StudyStep): void {
  overlay.push(step);
  resolve();
}

export function popStep(step: StudyStep): void {
  const idx = overlay.lastIndexOf(step);
  if (idx >= 0) overlay.splice(idx, 1);
  resolve();
}

export function currentStep(): StudyStep | null {
  return state.step;
}

// ─── Anotación (3.5) ────────────────────────────────────────────────────────

export function markToolSelected(toolId: string, modality?: Modality): void {
  if (modality) state.modality = modality;
  state.toolId = toolId;
  state.lastAnnotMarkAt = performance.now();
  state.editsSinceMark = 0;
  studyLog.emit('tool.select', { tool_id: toolId, modality: state.modality });
}

/** Un ajuste sobre la anotación en curso, antes de confirmarla. */
export function markEdit(): void {
  state.editsSinceMark += 1;
}

export type AnnotOrigin =
  | 'manual'
  | 'assisted_accepted'
  | 'assisted_edited'
  | 'assisted_rejected';

export function emitAnnotCommit(toolId: string, origin: AnnotOrigin): void {
  const now = performance.now();
  const since = state.lastAnnotMarkAt > 0 ? now - state.lastAnnotMarkAt : 0;
  studyLog.emit('annot.commit', {
    tool_id: toolId,
    modality: state.modality,
    origin,
    duration_ms: Math.round(since),
    n_edits: state.editsSinceMark,
  });
  if (!state.firstAnnotationEmitted) {
    state.firstAnnotationEmitted = true;
    studyLog.emit('annot.first', {});
  }
  state.lastAnnotMarkAt = now;
  state.editsSinceMark = 0;
  state.toolId = toolId;
}

export function emitAnnotDelete(toolId: string, origin: AnnotOrigin = 'manual'): void {
  studyLog.emit('annot.delete', { tool_id: toolId, modality: state.modality, origin });
}

/** Reinicia el estado derivado al abrir una sesión nueva. */
export function resetStudySession(): void {
  routeStep = null;
  overlay.length = 0;
  state.step = null;
  state.stepStartedAt = 0;
  state.firstAnnotationEmitted = false;
  state.lastAnnotMarkAt = 0;
  state.toolId = null;
  state.editsSinceMark = 0;
}
