import { invoke } from '@tauri-apps/api/core';
import type { MedicalImportReport, WindowPreset } from '../types';

export const medicalService = {
  /**
   * Importa DICOM y NIfTI. `axis` y `signalThreshold` sólo afectan a los NIfTI.
   *
   * El informe que devuelve incluye qué identificadores se quitaron: hay que
   * enseñarlo, una deidentificación que nadie mira es una promesa sin comprobar.
   */
  importFiles(
    projectId: string,
    paths: string[],
    axis: 'axial' | 'coronal' | 'sagital' = 'axial',
    signalThreshold = 0.02,
  ): Promise<MedicalImportReport> {
    return invoke('import_medical_files', { projectId, paths, axis, signalThreshold });
  },

  /** Vuelve a renderizar una imagen médica con otra ventana. */
  rewindow(projectId: string, imageId: string, center: number, width: number): Promise<void> {
    return invoke('rewindow_image', { projectId, imageId, center, width });
  },

  /** Ventanas de uso corriente, servidas por el backend para que no haya dos listas. */
  getWindowPresets(): Promise<WindowPreset[]> {
    return invoke('get_window_presets');
  },
};
