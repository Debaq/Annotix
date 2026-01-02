import { create } from 'zustand';

interface CanvasTransformState {
  zoom: number;
  panX: number;
  panY: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setPan: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
}

const useCanvasTransformStore = create<CanvasTransformState>((set) => ({
  zoom: 1,
  panX: 0,
  panY: 0,

  zoomIn: () =>
    set((state) => ({
      zoom: Math.min(state.zoom * 1.2, 5),
    })),

  zoomOut: () =>
    set((state) => ({
      zoom: Math.max(state.zoom / 1.2, 0.1),
    })),

  resetZoom: () =>
    set({
      zoom: 1,
      panX: 0,
      panY: 0,
    }),

  setPan: (x, y) =>
    set({
      panX: x,
      panY: y,
    }),

  setZoom: (zoom) =>
    set({
      zoom: Math.max(0.1, Math.min(zoom, 5)),
    }),
}));

export function useCanvasTransform() {
  const state = useCanvasTransformStore();

  const screenToCanvas = (screenX: number, screenY: number) => {
    return {
      x: (screenX - state.panX) / state.zoom,
      y: (screenY - state.panY) / state.zoom,
    };
  };

  const canvasToScreen = (canvasX: number, canvasY: number) => {
    return {
      x: canvasX * state.zoom + state.panX,
      y: canvasY * state.zoom + state.panY,
    };
  };

  return {
    ...state,
    screenToCanvas,
    canvasToScreen,
    transform: {
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      setPan: state.setPan,
      setZoom: state.setZoom,
    },
  };
}
