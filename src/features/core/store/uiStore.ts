// src/features/core/store/uiStore.ts
import { create } from 'zustand';

type ToolType = 'select' | 'pan' | 'bbox' | 'mask' | 'polygon' | 'keypoints' | 'landmarks' | 'obb';
type GalleryFilterType = 'all' | 'annotated' | 'unannotated';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Active tool
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  // Active class
  activeClassId: number | null;
  setActiveClassId: (id: number | null) => void;

  // Zoom & Pan (deprecated - now in useCanvasTransform)
  zoom: number;
  panX: number;
  panY: number;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  resetTransform: () => void;

  // Current project & image
  currentProjectId: number | null;
  currentImageId: number | null;
  setCurrentProjectId: (id: number | null) => void;
  setCurrentImageId: (id: number | null) => void;

  // Gallery filter
  galleryFilter: GalleryFilterType;
  setGalleryFilter: (filter: GalleryFilterType) => void;

  // UI flags
  showLabels: boolean;
  showGrid: boolean;
  toggleLabels: () => void;
  toggleGrid: () => void;

  // Brush size (for mask tool) (deprecated - now in useDrawingTool)
  brushSize: number;
  setBrushSize: (size: number) => void;

  // Erase mode (for mask tool) (deprecated - now in useDrawingTool)
  eraseMode: boolean;
  setEraseMode: (mode: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Active tool
  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),

  // Active class
  activeClassId: null,
  setActiveClassId: (id) => set({ activeClassId: id }),

  // Zoom & Pan (deprecated)
  zoom: 1,
  panX: 0,
  panY: 0,
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  resetTransform: () => set({ zoom: 1, panX: 0, panY: 0 }),

  // Current project & image
  currentProjectId: null,
  currentImageId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id, currentImageId: null }),
  setCurrentImageId: (id) => set({ currentImageId: id }),

  // Gallery filter
  galleryFilter: 'all',
  setGalleryFilter: (filter) => set({ galleryFilter: filter }),

  // UI flags
  showLabels: true,
  showGrid: false,
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),

  // Brush size (deprecated)
  brushSize: 20,
  setBrushSize: (size) => set({ brushSize: Math.max(5, Math.min(100, size)) }),

  // Erase mode (deprecated)
  eraseMode: false,
  setEraseMode: (mode) => set({ eraseMode: mode }),
}));
