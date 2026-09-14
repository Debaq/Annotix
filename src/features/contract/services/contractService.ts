import { invoke } from '@tauri-apps/api/core';
import type { ModelContract, StudyProtocol } from '../types';

export const contractService = {
  /** Arma el contrato sin escribirlo, para verlo antes de emitirlo. */
  build(projectId: string, jobId: string): Promise<ModelContract> {
    return invoke('build_model_contract', { projectId, jobId });
  },

  /** Escribe `model_contract.json` junto al modelo. Devuelve [contrato, ruta]. */
  write(projectId: string, jobId: string): Promise<[ModelContract, string]> {
    return invoke('write_model_contract', { projectId, jobId });
  },

  getProtocol(projectId: string): Promise<StudyProtocol> {
    return invoke('get_study_protocol', { projectId });
  },

  setProtocol(projectId: string, protocol: StudyProtocol): Promise<void> {
    return invoke('set_study_protocol', { projectId, protocol });
  },
};
