import { invoke } from '@tauri-apps/api/core';
import type { Annotation } from '@/lib/db';
import type { AgreementReport, Discrepancy } from '../types';

export const agreementService = {
  /** Acuerdo del corpus, con intervalo de confianza. */
  getCorpusAgreement(projectId: string): Promise<AgreementReport> {
    return invoke('get_corpus_agreement', { projectId });
  },

  /** Discrepancias entre lecturas, la peor arriba. */
  getDiscrepancyQueue(projectId: string, limit = 50): Promise<Discrepancy[]> {
    return invoke('get_discrepancy_queue', { projectId, limit });
  },

  /** Resuelve una discrepancia: lo que se manda pasa a ser la capa consolidada. */
  adjudicate(projectId: string, imageId: string, annotations: Annotation[]): Promise<void> {
    return invoke('adjudicate_image', { projectId, imageId, annotations });
  },
};
