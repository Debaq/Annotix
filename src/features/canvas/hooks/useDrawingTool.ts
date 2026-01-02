import { create } from 'zustand';

interface DrawingToolState {
  brushSize: number;
  eraseMode: boolean;
  setBrushSize: (size: number) => void;
  setEraseMode: (mode: boolean) => void;
}

const useDrawingToolStore = create<DrawingToolState>((set) => ({
  brushSize: 20,
  eraseMode: false,

  setBrushSize: (size) =>
    set({
      brushSize: Math.max(1, Math.min(size, 100)),
    }),

  setEraseMode: (mode) =>
    set({
      eraseMode: mode,
    }),
}));

export function useDrawingTool() {
  return useDrawingToolStore();
}
