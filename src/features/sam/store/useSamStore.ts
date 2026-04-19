import { create } from 'zustand';
import type { SamMask, SamAmgProgress, SamPoint, SamPrediction } from '@/lib/db';

export interface SamFilters {
  predIouMin: number;
  stabilityMin: number;
  nmsThresh: number;
  overlapThresh: number;
}

export const DEFAULT_SAM_FILTERS: SamFilters = {
  predIouMin: 0.7,
  stabilityMin: 0.85,
  nmsThresh: 0.7,
  overlapThresh: 0.5,
};

interface SamState {
  samAssistActive: boolean;
  pairId: string | null;
  hqMode: boolean;
  candidates: SamMask[];
  activeMaskIdx: 0 | 1 | 2;
  hoverMaskId: string | null;
  filters: SamFilters;
  amgProgress: SamAmgProgress | null;
  encoding: boolean;
  generating: boolean;
  amgRequestToken: number;

  // ─── Modo refine (PR7) ───────────────────────────────────────────────
  refineMode: boolean;
  refinePoints: SamPoint[];
  refineBbox: [number, number, number, number] | null;
  refinePrediction: SamPrediction | null;
  refineActiveIdx: 0 | 1 | 2;
  refineRunning: boolean;

  setSamAssistActive: (v: boolean) => void;
  setPairId: (id: string | null) => void;
  setHqMode: (v: boolean) => void;
  setCandidates: (c: SamMask[]) => void;
  removeCandidate: (id: string) => void;
  setActiveMaskIdx: (i: 0 | 1 | 2) => void;
  setHoverMaskId: (id: string | null) => void;
  setFilters: (patch: Partial<SamFilters>) => void;
  setAmgProgress: (p: SamAmgProgress | null) => void;
  setEncoding: (v: boolean) => void;
  setGenerating: (v: boolean) => void;
  requestAmg: () => void;

  setRefineMode: (v: boolean) => void;
  addRefinePoint: (p: SamPoint) => void;
  removeRefinePointAt: (idx: number) => void;
  clearRefinePoints: () => void;
  setRefineBbox: (b: [number, number, number, number] | null) => void;
  setRefinePrediction: (p: SamPrediction | null) => void;
  setRefineActiveIdx: (i: 0 | 1 | 2) => void;
  cycleRefineActiveIdx: () => void;
  setRefineRunning: (v: boolean) => void;
  resetRefine: () => void;

  reset: () => void;
}

export const useSamStore = create<SamState>((set) => ({
  samAssistActive: false,
  pairId: null,
  hqMode: false,
  candidates: [],
  activeMaskIdx: 0,
  hoverMaskId: null,
  filters: { ...DEFAULT_SAM_FILTERS },
  amgProgress: null,
  encoding: false,
  generating: false,
  amgRequestToken: 0,

  refineMode: false,
  refinePoints: [],
  refineBbox: null,
  refinePrediction: null,
  refineActiveIdx: 0,
  refineRunning: false,

  setSamAssistActive: (v) => set({ samAssistActive: v }),
  setPairId: (id) => set({ pairId: id }),
  setHqMode: (v) => set({ hqMode: v }),
  setCandidates: (c) => set({ candidates: c }),
  removeCandidate: (id) =>
    set((s) => ({
      candidates: s.candidates.filter((m) => m.id !== id),
      hoverMaskId: s.hoverMaskId === id ? null : s.hoverMaskId,
    })),
  setActiveMaskIdx: (i) => set({ activeMaskIdx: i }),
  setHoverMaskId: (id) => set({ hoverMaskId: id }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  setAmgProgress: (p) => set({ amgProgress: p }),
  setEncoding: (v) => set({ encoding: v }),
  setGenerating: (v) => set({ generating: v }),
  requestAmg: () => set((s) => ({ amgRequestToken: s.amgRequestToken + 1 })),
  setRefineMode: (v) =>
    set((s) => ({
      refineMode: v,
      // Salir de refine: descartar puntos/bbox/prediction. Entrar: limpiar también.
      refinePoints: [],
      refineBbox: null,
      refinePrediction: v ? s.refinePrediction : null,
      refineActiveIdx: 0,
    })),
  addRefinePoint: (p) => set((s) => ({ refinePoints: [...s.refinePoints, p] })),
  removeRefinePointAt: (idx) =>
    set((s) => ({ refinePoints: s.refinePoints.filter((_, i) => i !== idx) })),
  clearRefinePoints: () => set({ refinePoints: [], refineBbox: null }),
  setRefineBbox: (b) => set({ refineBbox: b }),
  setRefinePrediction: (p) =>
    set({ refinePrediction: p, refineActiveIdx: (p?.bestIndex ?? 0) as 0 | 1 | 2 }),
  setRefineActiveIdx: (i) => set({ refineActiveIdx: i }),
  cycleRefineActiveIdx: () =>
    set((s) => {
      const len = s.refinePrediction?.masksLowres.length ?? 1;
      if (len <= 1) return {};
      return { refineActiveIdx: (((s.refineActiveIdx + 1) % len) as 0 | 1 | 2) };
    }),
  setRefineRunning: (v) => set({ refineRunning: v }),
  resetRefine: () =>
    set({
      refineMode: false,
      refinePoints: [],
      refineBbox: null,
      refinePrediction: null,
      refineActiveIdx: 0,
      refineRunning: false,
    }),

  reset: () =>
    set({
      candidates: [],
      hoverMaskId: null,
      amgProgress: null,
      encoding: false,
      generating: false,
      refineMode: false,
      refinePoints: [],
      refineBbox: null,
      refinePrediction: null,
      refineActiveIdx: 0,
      refineRunning: false,
    }),
}));
