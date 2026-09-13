// Cliente del modo estudio. Todo pasa por aquí: ningún componente llama a
// `invoke('study_log_emit')` directamente.
//
// Garantías:
// - Con el modo apagado, `emit` no hace nada (ni siquiera cruza el puente).
// - Nunca lanza: un fallo del registro no puede romper una acción del usuario.
// - Solo acepta eventos de la taxonomía (`events.ts`).

import { invoke } from '@tauri-apps/api/core';
import type { StudyEvent } from './events';

export interface StudyStatus {
  enabled: boolean;
  sessionId: string;
  condition: string;
  active: boolean;
  logsDir: string;
  seq: number;
}

type Payload = Record<string, unknown>;

/** Espejo local del estado, para no cruzar el puente con el modo apagado. */
let active = false;

export function isStudyActive(): boolean {
  return active;
}

function applyStatus(status: StudyStatus): StudyStatus {
  active = status.active;
  return status;
}

export const studyLog = {
  isActive(): boolean {
    return active;
  },

  async getStatus(): Promise<StudyStatus> {
    return applyStatus(await invoke<StudyStatus>('study_get_status'));
  },

  async setConfig(enabled: boolean, sessionId: string, condition: string): Promise<StudyStatus> {
    return applyStatus(
      await invoke<StudyStatus>('study_set_config', {
        enabled,
        sessionId,
        condition,
        screenW: window.screen?.width ?? 0,
        screenH: window.screen?.height ?? 0,
      }),
    );
  },

  /** Reabre la sesión al arrancar si quedó activada. Llamar una sola vez. */
  async resume(): Promise<StudyStatus> {
    return applyStatus(
      await invoke<StudyStatus>('study_resume_session', {
        screenW: window.screen?.width ?? 0,
        screenH: window.screen?.height ?? 0,
      }),
    );
  },

  /** Registra un evento. No espera al backend ni propaga errores. */
  emit(event: StudyEvent, payload: Payload = {}): void {
    if (!active) return;
    invoke('study_log_emit', { event, payload }).catch((e) => {
      console.warn('[study] no se pudo registrar', event, e);
    });
  },

  listFiles(sessionId: string): Promise<string[]> {
    return invoke('study_log_list', { sessionId });
  },

  verify(path: string): Promise<{ valid: boolean; nEvents: number; errors: string[] }> {
    return invoke('study_log_verify', { path });
  },

  exportSession(sessionId: string, destDir: string): Promise<{ destDir: string; files: string[] }> {
    return invoke('study_log_export', { sessionId, destDir });
  },

  openLogsDir(): Promise<void> {
    return invoke('study_open_logs_dir');
  },
};
