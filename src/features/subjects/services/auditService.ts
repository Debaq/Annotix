import { invoke } from '@tauri-apps/api/core';
import type { AuditEntry, AuditReport } from '../types';

export const auditService = {
  /** Comprueba la cadena, el orden y la taxonomía del registro del proyecto. */
  verify(projectId: string): Promise<AuditReport> {
    return invoke('verify_audit_log', { projectId });
  },

  /** Últimos eventos, del más reciente al más antiguo. */
  tail(projectId: string, limit = 20): Promise<AuditEntry[]> {
    return invoke('read_audit_tail', { projectId, limit });
  },
};
