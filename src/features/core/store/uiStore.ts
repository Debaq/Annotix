// src/features/core/store/uiStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ToolType = 'pan' | 'bbox' | 'mask' | 'polygon' | 'keypoints' | 'landmarks' | 'obb';
type GalleryFilterType = 'all' | 'annotated' | 'unannotated';
export type GalleryMode = 'normal' | 'compact' | 'hidden';

export type ClassFilterMode = 'has' | 'lacks' | 'only' | 'min';
export interface ClassFilter {
  classIds: number[];
  mode: ClassFilterMode;
  minCount?: number;
}
export interface ProjectFilters {
  classFilter?: ClassFilter;
  classListSearch?: string;
  classListOnlyUsed?: boolean;
  classListOnlyInImage?: boolean;
}

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
  currentProjectId: string | null;
  currentImageId: string | null;
  currentTimeSeriesId: string | null;
  currentVideoId: string | null;
  currentAudioId: string | null;
  currentFrameIndex: number;
  setCurrentProjectId: (id: string | null) => void;
  setCurrentImageId: (id: string | null) => void;
  setCurrentTimeSeriesId: (id: string | null) => void;
  setCurrentVideoId: (id: string | null) => void;
  setCurrentAudioId: (id: string | null) => void;
  setCurrentFrameIndex: (index: number) => void;

  // Gallery filter
  galleryFilter: GalleryFilterType;
  setGalleryFilter: (filter: GalleryFilterType) => void;

  // Gallery mode (layout)
  galleryMode: GalleryMode;
  setGalleryMode: (mode: GalleryMode) => void;
  cycleGalleryMode: () => void;

  // UI flags
  showLabels: boolean;
  showGrid: boolean;
  annotationsVisible: boolean;
  toggleLabels: () => void;
  toggleGrid: () => void;
  toggleAnnotationsVisible: () => void;

  // Brush size (for mask tool) (deprecated - now in useDrawingTool)
  brushSize: number;
  setBrushSize: (size: number) => void;

  // Erase mode (for mask tool) (deprecated - now in useDrawingTool)
  eraseMode: boolean;
  setEraseMode: (mode: boolean) => void;

  // Inference: modelo seleccionado compartido entre vistas
  selectedInferenceModelId: string | null;
  setSelectedInferenceModelId: (id: string | null) => void;

  // Filtros por proyecto (debug/observación)
  projectFilters: Record<string, ProjectFilters>;
  setProjectFilter: (projectId: string, patch: Partial<ProjectFilters>) => void;
  clearProjectFilter: (projectId: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Active tool
      activeTool: 'pan',
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
      currentTimeSeriesId: null,
      currentVideoId: null,
      currentAudioId: null,
      currentFrameIndex: 0,
      setCurrentProjectId: (id) => set((state) => {
        const projectChanged = state.currentProjectId !== null && state.currentProjectId !== id;
        return {
          currentProjectId: id,
          currentImageId: null,
          currentTimeSeriesId: null,
          currentVideoId: null,
          currentAudioId: null,
          currentFrameIndex: 0,
          // Only reset tool and class when switching between projects (not on initial load)
          ...(projectChanged && {
            activeTool: 'pan',
            activeClassId: null
          })
        };
      }),
      setCurrentImageId: (id) => set({ currentImageId: id }),
      setCurrentTimeSeriesId: (id) => set({ currentTimeSeriesId: id }),
      setCurrentVideoId: (id) => set({ currentVideoId: id, currentFrameIndex: 0 }),
      setCurrentAudioId: (id) => set({ currentAudioId: id }),
      setCurrentFrameIndex: (index) => set({ currentFrameIndex: index }),

      // Gallery filter
      galleryFilter: 'all',
      setGalleryFilter: (filter) => set({ galleryFilter: filter }),

      // Gallery mode
      galleryMode: 'normal',
      setGalleryMode: (mode) => set({ galleryMode: mode }),
      cycleGalleryMode: () => set((state) => ({
        galleryMode: state.galleryMode === 'normal' ? 'compact' : state.galleryMode === 'compact' ? 'hidden' : 'normal',
      })),

      // UI flags
      showLabels: false,
      showGrid: false,
      annotationsVisible: true,
      toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
      toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
      toggleAnnotationsVisible: () => set((state) => ({ annotationsVisible: !state.annotationsVisible })),

      // Brush size (deprecated)
      brushSize: 20,
      setBrushSize: (size) => set({ brushSize: Math.max(5, Math.min(100, size)) }),

      // Erase mode (deprecated)
      eraseMode: false,
      setEraseMode: (mode) => set({ eraseMode: mode }),

      // Inference selección global
      selectedInferenceModelId: null,
      setSelectedInferenceModelId: (id) => set({ selectedInferenceModelId: id }),

      // Filtros por proyecto
      projectFilters: {},
      setProjectFilter: (projectId, patch) => set((state) => {
        const prev = state.projectFilters[projectId] ?? {};
        const next = { ...prev, ...patch };
        // Limpiar campos undefined explícitamente
        for (const k of Object.keys(patch) as (keyof ProjectFilters)[]) {
          if (patch[k] === undefined) delete (next as Record<string, unknown>)[k];
        }
        return { projectFilters: { ...state.projectFilters, [projectId]: next } };
      }),
      clearProjectFilter: (projectId) => set((state) => {
        const { [projectId]: _, ...rest } = state.projectFilters;
        return { projectFilters: rest };
      }),
    }),
    {
      name: 'annotix-ui-storage',
      merge: (persisted, current) => {
        const merged = { ...(current as object), ...(persisted as object) } as UIState;
        // Migrar tool 'select' eliminado → 'pan'
        if ((merged.activeTool as string) === 'select') {
          merged.activeTool = 'pan';
        }
        // galleryMode no se persiste: siempre iniciar en 'normal'
        merged.galleryMode = 'normal';
        return merged;
      },
    }
  )
);
