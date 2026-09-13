// Eventos de fricción del modo estudio (sección 3.6) que no son inactividad.
//
// `error.shown` nunca lleva el mensaje: solo una categoría y el paso del flujo
// en el que ocurrió.

import { studyLog } from './studyLog';
import { currentStep } from './studySession';

export type ErrorClass = 'operation_failed' | 'render_crash';

export function emitErrorShown(errorClass: ErrorClass): void {
  studyLog.emit('error.shown', {
    error_class: errorClass,
    scope: currentStep() ?? 'app',
  });
}

/** Temas de la ayuda integrada. Estables, como los `step_id`. */
export type HelpTopic = 'shortcuts' | 'repository' | 'tour';

export function emitHelpOpen(topic: HelpTopic): void {
  studyLog.emit('help.open', { topic_id: topic });
}
