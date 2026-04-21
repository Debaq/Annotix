import { create } from 'zustand';

interface TrainingModalState {
  // Se incrementa cada vez que alguien pide abrir el panel yendo directo al
  // job activo (bypass del selector). `TrainingPanel` observa los cambios de
  // este contador para auto-abrirse y saltar a phase='training'.
  openActiveSignal: number;
  requestOpenActive: () => void;
}

export const useTrainingModalStore = create<TrainingModalState>((set) => ({
  openActiveSignal: 0,
  requestOpenActive: () => set((s) => ({ openActiveSignal: s.openActiveSignal + 1 })),
}));
