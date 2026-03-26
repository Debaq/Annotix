import { create } from 'zustand';
import { Annotation } from '@/lib/db';

const MAX_HISTORY = 100;

interface UndoState {
  /** Pila de estados anteriores (undo) */
  past: Annotation[][];
  /** Pila de estados futuros (redo) */
  future: Annotation[][];
  /** ID de imagen actual — al cambiar se limpia el historial */
  imageId: string | null;

  /** Registra el estado actual antes de una mutación */
  pushState: (annotations: Annotation[]) => void;
  /** Deshace: devuelve el estado anterior o null si no hay */
  undo: (current: Annotation[]) => Annotation[] | null;
  /** Rehace: devuelve el estado siguiente o null si no hay */
  redo: (current: Annotation[]) => Annotation[] | null;
  /** Limpia historial (al cambiar de imagen) */
  reset: (imageId: string | null) => void;

  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],
  imageId: null,

  pushState: (annotations) => {
    set((state) => {
      const newPast = [...state.past, annotations];
      if (newPast.length > MAX_HISTORY) newPast.shift();
      return { past: newPast, future: [] };
    });
  },

  undo: (current) => {
    const { past } = get();
    if (past.length === 0) return null;

    const previous = past[past.length - 1];
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [current, ...state.future],
    }));
    return previous;
  },

  redo: (current) => {
    const { future } = get();
    if (future.length === 0) return null;

    const next = future[0];
    set((state) => ({
      past: [...state.past, current],
      future: state.future.slice(1),
    }));
    return next;
  },

  reset: (imageId) => {
    set({ past: [], future: [], imageId });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));
