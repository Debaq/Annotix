# CLAUDE.md - Annotix

Este archivo proporciona la especificación completa de la migración de Annotix al stack moderno: Vite + React 19 + TypeScript + Tailwind CSS + Shadcn/ui + Dexie.js.

---

## RESUMEN EJECUTIVO

**Annotix** es un marcador de datos para entrenamiento de ML + sistema de configuración de entrenamiento mediante connector Python. Actualmente implementado en vanilla JavaScript, se migrará al stack moderno para facilitar desarrollo futuro y escalabilidad.

### Estado Actual (Vanilla JS)

**Características Implementadas:**
- ✅ 18 tipos de anotación (9 imágenes + 9 series temporales)
- ✅ 8+ formatos de exportación (YOLO, COCO, Pascal VOC, U-Net, CSV)
- ✅ Inferencia ONNX en navegador (detección funcionando, segmentación pendiente)
- ✅ Conector Python modular para entrenamiento local (Flask)
- ✅ Generador de código para Ultralytics, PyTorch, TensorFlow
- ✅ 10 idiomas con i18next
- ✅ PWA con offline-first
- ✅ 100% client-side (IndexedDB nativo)

**Limitaciones del Stack Actual:**
- Difícil de mantener y escalar (vanilla JS, ~15,700 líneas)
- No hay tipado estático
- Arquitectura monolítica en index.html
- Dificulta agregar nuevas características (Audio, Video, 3D, Texto - 46 tipos pendientes)

### Objetivo de la Migración

Reconstruir Annotix con arquitectura moderna y modular que permita:
1. **Desarrollo ágil** - Agregar features sin afectar código existente
2. **Tipado fuerte** - Prevenir errores con TypeScript
3. **Componentes reutilizables** - React + Shadcn/ui
4. **Base de datos optimizada** - Dexie.js con queries indexadas
5. **Testing** - Infraestructura para pruebas unitarias/E2E
6. **Escalabilidad** - Preparado para 46+ tipos de anotación futuros

---

## ⚠️ REGLAS OBLIGATORIAS DE DESARROLLO (MANDATORY)

### 🚫 TRADUCCIONES - POLÍTICA ESTRICTA

**REGLA CRÍTICA - NO NEGOCIABLE:**

Cuando se agreguen nuevas features, componentes, o cualquier funcionalidad que requiera texto traducible:

1. **SOLO agregar las LLAVES (keys)** en los archivos de traducción JSON (`public/locales/*.json`)
2. **NO realizar traducciones** - Las traducciones serán completadas manualmente por el desarrollador principal
3. **NO modificar traducciones existentes** a menos que se solicite explícitamente

**Ejemplo CORRECTO al agregar una nueva feature:**

```json
// public/locales/en.json
{
  "newFeature": {
    "title": "",
    "description": "",
    "button": ""
  }
}
```

**Ejemplo INCORRECTO (NO HACER):**

```json
// public/locales/en.json
{
  "newFeature": {
    "title": "New Feature",           // ❌ NO agregar traducciones
    "description": "Description",     // ❌ NO agregar traducciones
    "button": "Click here"            // ❌ NO agregar traducciones
  }
}
```

**Razón:** Las traducciones profesionales a 10 idiomas requieren consistencia terminológica y contexto específico del dominio ML/Computer Vision que solo el desarrollador principal puede garantizar.

---

## STACK TECNOLÓGICO (ESTRICTO E INNEGOCIABLE)

| Categoría | Tecnología | Versión | Propósito |
|-----------|-----------|---------|-----------|
| **Frontend Framework** | React | 19.x | UI components & reactivity |
| **Build Tool** | Vite | 6.x | Fast dev server & bundling |
| **Language** | TypeScript | 5.x | Type safety |
| **Styling** | Tailwind CSS | 3.x | Utility-first CSS |
| **UI Components** | Shadcn/ui | Latest | Pre-built accessible components |
| **Database (Offline-First)** | Dexie.js | 4.x | IndexedDB wrapper |
| **i18n** | i18next + react-i18next | 23.x | Internationalization |
| **State Management** | Zustand | 5.x | Lightweight global state |
| **Canvas** | Native Canvas API | - | Image rendering & drawing |
| **File Processing** | JSZip | 3.x | Dataset ZIP creation |
| **Charts** | Chart.js + react-chartjs-2 | 4.x | Time series visualization |
| **ONNX Runtime** | onnxruntime-web | Latest | ML inference in browser |
| **Backend (Opcional)** | FastAPI (Python) | 0.115.x | Training & sync |
| **WebSocket** | FastAPI WebSocket | - | Real-time training progress |
| **Icons** | Lucide React | Latest | Icon system |

---

## ESQUEMA DE BASE DE DATOS (Dexie.js)

### Estructura de Tablas

```typescript
// src/lib/db.ts

import Dexie, { Table } from 'dexie';

// ============================================================================
// PROJECTS TABLE
// ============================================================================

export interface Project {
  id?: number;
  name: string;
  type: ProjectType;
  classes: ClassDefinition[];
  metadata: {
    created: number;
    updated: number;
    version: string;
  };
}

export interface ClassDefinition {
  id: number;
  name: string;
  color: string; // Hex color
}

export type ProjectType =
  // Images - Implemented (Fase 1-2)
  | 'bbox'
  | 'mask'
  | 'polygon'
  | 'keypoints'
  | 'landmarks'
  | 'obb'
  | 'classification'
  | 'multi-label-classification'
  | 'instance-segmentation'
  // Time Series - Implemented (Fase 3)
  | 'timeseries-classification'
  | 'timeseries-forecasting'
  | 'anomaly-detection'
  | 'timeseries-segmentation'
  | 'pattern-recognition'
  | 'event-detection'
  | 'timeseries-regression'
  | 'clustering'
  | 'imputation'
  // Future: Audio (10 types)
  | 'audio-classification'
  | 'speech-recognition'
  | 'sound-event-detection'
  // ... (more types in future phases)
  ;

// ============================================================================
// IMAGES TABLE
// ============================================================================

export interface Image {
  id?: number;
  projectId: number;           // Indexed
  name: string;
  blob: Blob;
  annotations: Annotation[];
  dimensions: {
    width: number;
    height: number;
  };
  metadata: {
    uploaded: number;
    annotated?: number;
    status: 'pending' | 'annotated' | 'reviewed';  // Indexed
  };
}

export interface Annotation {
  id: string;                  // UUID v4
  type: ProjectType;
  classId: number;
  data: AnnotationData;
}

export type AnnotationData =
  | BBoxData
  | MaskData
  | PolygonData
  | KeypointsData
  | LandmarksData
  | OBBData
  | ClassificationData;

// ============================================================================
// ANNOTATION DATA TYPES
// ============================================================================

export interface BBoxData {
  x: number;                   // Top-left X (pixels)
  y: number;                   // Top-left Y (pixels)
  width: number;               // Width (pixels)
  height: number;              // Height (pixels)
}

export interface MaskData {
  base64png: string;           // Base64 encoded PNG of mask canvas
  instanceId?: number;         // For instance segmentation
}

export interface PolygonData {
  points: { x: number; y: number }[];
  closed?: boolean;            // Auto-close polygon
}

export interface KeypointsData {
  points: {
    x: number;
    y: number;
    visible: boolean;          // 0=not labeled, 1=labeled but occluded, 2=visible
    name?: string;             // Keypoint name (e.g., "nose", "left_eye")
  }[];
  skeletonType: string;        // 'coco', 'face', 'hand', 'mediapipe_pose', etc.
  instanceId?: number;         // For multiple instances
}

export interface LandmarksData {
  points: {
    x: number;
    y: number;
    name: string;              // Landmark name
  }[];
}

export interface OBBData {
  x: number;                   // Center X
  y: number;                   // Center Y
  width: number;
  height: number;
  rotation: number;            // Rotation in degrees (0-360)
}

export interface ClassificationData {
  labels: number[];            // Array of class IDs (for multi-label)
}

// ============================================================================
// INFERENCE CACHE TABLE (Fase 4)
// ============================================================================

export interface InferenceCache {
  id?: number;
  imageId: number;             // Indexed
  modelHash: string;           // MD5 hash of model file - Indexed
  predictions: Prediction[];
  timestamp: number;
}

export interface Prediction {
  classId: number;
  confidence: number;
  bbox?: BBoxData;
  mask?: MaskData;
  keypoints?: KeypointsData;
}

// ============================================================================
// TRAINING JOBS TABLE (Fase 5)
// ============================================================================

export interface TrainingJob {
  id?: number;
  projectId: number;           // Indexed
  status: 'pending' | 'running' | 'completed' | 'failed';  // Indexed
  config: TrainingConfig;
  progress: number;            // 0-100
  logs: string[];
  metrics?: TrainingMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingConfig {
  framework: 'ultralytics' | 'pytorch' | 'tensorflow';
  modelType: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
  device: 'cpu' | 'cuda' | 'mps';
  optimizer: string;
  imageSize?: number;
  augmentation?: boolean;
  // ... more hyperparameters
}

export interface TrainingMetrics {
  loss: number[];
  accuracy?: number[];
  precision?: number[];
  recall?: number[];
  mAP?: number[];
}

// ============================================================================
// DEXIE DATABASE CLASS
// ============================================================================

class AnnotixDB extends Dexie {
  projects!: Table<Project>;
  images!: Table<Image>;
  inferenceCache!: Table<InferenceCache>;
  trainingJobs!: Table<TrainingJob>;

  constructor() {
    super('annotixDB');

    this.version(1).stores({
      projects: '++id, name, type, metadata.created',
      images: '++id, projectId, metadata.status, metadata.uploaded',
      inferenceCache: '++id, imageId, modelHash',
      trainingJobs: '++id, projectId, status, createdAt',
    });
  }
}

export const db = new AnnotixDB();
```

### Notas sobre el Esquema

1. **Indexes**: Campos indexados para queries rápidas
   - `images.projectId` - Filtrar imágenes por proyecto
   - `images.metadata.status` - Filtrar por estado de anotación
   - `inferenceCache.imageId` + `modelHash` - Cache de predicciones
   - `trainingJobs.projectId` + `status` - Listar jobs activos

2. **Blobs**: Imágenes almacenadas como Blobs (eficiente en IndexedDB)

3. **Annotations Array**: Cada imagen puede tener múltiples anotaciones

4. **Tipado Discriminado**: `AnnotationData` usa union types para type safety

5. **Timestamps**: Unix timestamps (ms) para ordenamiento temporal

6. **Versioning**: DB version 1 inicial, migraciones futuras incrementarán versión

---

## ESTRUCTURA DE CARPETAS (Feature-Based Architecture)

```
annotix/
├── public/
│   ├── locales/                    # Archivos JSON de traducciones
│   │   ├── en.json                 # English
│   │   ├── es.json                 # Español (default)
│   │   ├── fr.json                 # Français
│   │   ├── zh.json                 # 中文
│   │   ├── ja.json                 # 日本語
│   │   ├── de.json                 # Deutsch
│   │   ├── pt.json                 # Português
│   │   ├── it.json                 # Italiano
│   │   ├── ru.json                 # Русский
│   │   └── ko.json                 # 한국어
│   └── models/                     # ONNX models (Fase 4)
│       └── .gitkeep
│
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root component
│   ├── vite-env.d.ts               # Vite types
│   │
│   ├── lib/                        # Librerías core
│   │   ├── db.ts                   # Dexie schema & types
│   │   ├── i18n.ts                 # i18next configuration
│   │   └── utils.ts                # General utilities (cn, etc.)
│   │
│   ├── features/                   # Feature modules (autonomous)
│   │   │
│   │   ├── core/                   # Layout & Navigation (Base)
│   │   │   ├── components/
│   │   │   │   ├── AppLayout.tsx           # Main layout wrapper
│   │   │   │   ├── Header.tsx              # Top header with logo, lang selector
│   │   │   │   ├── Sidebar.tsx             # Left sidebar navigation
│   │   │   │   ├── LanguageSelector.tsx    # Dropdown for i18n
│   │   │   │   └── StorageIndicator.tsx    # IndexedDB usage meter
│   │   │   ├── hooks/
│   │   │   │   ├── useKeyboardShortcuts.ts # Global shortcuts (Ctrl+S, arrows, etc.)
│   │   │   │   └── useStorageEstimate.ts   # Navigator.storage.estimate()
│   │   │   └── store/
│   │   │       └── uiStore.ts              # Zustand: sidebar state, modals, etc.
│   │   │
│   │   ├── projects/               # FASE 1 - Project Management
│   │   │   ├── components/
│   │   │   │   ├── ProjectList.tsx         # Grid/List of projects
│   │   │   │   ├── ProjectCard.tsx         # Individual project card
│   │   │   │   ├── CreateProjectDialog.tsx # Modal for new project
│   │   │   │   ├── ProjectTypeSelector.tsx # Dropdown with project types
│   │   │   │   ├── ClassManager.tsx        # Add/Edit/Delete classes
│   │   │   │   ├── ClassColorPicker.tsx    # Color selector
│   │   │   │   └── ProjectStats.tsx        # Stats panel (images, annotations)
│   │   │   ├── hooks/
│   │   │   │   ├── useProjects.ts          # CRUD for projects
│   │   │   │   ├── useCurrentProject.ts    # Active project state
│   │   │   │   └── useClasses.ts           # Manage class definitions
│   │   │   ├── services/
│   │   │   │   ├── projectService.ts       # Dexie operations
│   │   │   │   └── importExportService.ts  # .tix, .tixconfig handlers
│   │   │   └── types.ts                    # Feature-specific types
│   │   │
│   │   ├── gallery/                # FASE 1 - Image Gallery
│   │   │   ├── components/
│   │   │   │   ├── ImageGallery.tsx        # Main gallery container
│   │   │   │   ├── ImageGrid.tsx           # Grid layout with thumbnails
│   │   │   │   ├── ImageCard.tsx           # Single image card with indicators
│   │   │   │   ├── ImageUploader.tsx       # Drag & drop / file input
│   │   │   │   ├── GalleryFilters.tsx      # Filter buttons (all/annotated/unannotated)
│   │   │   │   └── ImageNavigation.tsx     # Prev/Next buttons
│   │   │   ├── hooks/
│   │   │   │   ├── useImages.ts            # CRUD for images
│   │   │   │   ├── useCurrentImage.ts      # Active image state
│   │   │   │   └── useImageNavigation.ts   # Navigate between images
│   │   │   └── services/
│   │   │       └── imageService.ts         # Dexie operations, blob handling
│   │   │
│   │   ├── canvas/                 # FASE 1 + 2 - Annotation Canvas
│   │   │   ├── components/
│   │   │   │   ├── AnnotationCanvas.tsx       # Main canvas component
│   │   │   │   ├── CanvasToolbar.tsx          # Tool selection buttons
│   │   │   │   ├── ZoomControls.tsx           # Zoom in/out/reset buttons
│   │   │   │   ├── AnnotationList.tsx         # List of annotations (sidebar)
│   │   │   │   ├── AnnotationItem.tsx         # Single annotation row
│   │   │   │   ├── ClassSelector.tsx          # Quick class selector (1-9)
│   │   │   │   ├── BrushSizeSlider.tsx        # For mask tool
│   │   │   │   └── RotationSlider.tsx         # Image rotation
│   │   │   ├── hooks/
│   │   │   │   ├── useCanvas.ts               # Canvas setup & rendering loop
│   │   │   │   ├── useAnnotations.ts          # CRUD for annotations
│   │   │   │   ├── useCanvasTransform.ts      # Zoom/Pan matrix transforms
│   │   │   │   ├── useDrawingTool.ts          # Active tool state
│   │   │   │   └── useUndo.ts                 # Undo/Redo stack (future)
│   │   │   ├── tools/                         # Drawing tool classes
│   │   │   │   ├── BaseTool.ts                # Abstract base class
│   │   │   │   ├── BBoxTool.ts                # FASE 1 - Rectangle drawing
│   │   │   │   ├── MaskTool.ts                # FASE 1 - Brush/Erase
│   │   │   │   ├── PolygonTool.ts             # FASE 2 - Polygon drawing
│   │   │   │   ├── KeypointsTool.ts           # FASE 2 - Keypoints placement
│   │   │   │   ├── LandmarksTool.ts           # FASE 2 - Named landmarks
│   │   │   │   ├── OBBTool.ts                 # FASE 2 - Rotated bboxes
│   │   │   │   ├── SelectTool.ts              # Select & edit annotations
│   │   │   │   └── PanTool.ts                 # Pan canvas
│   │   │   ├── renderers/                     # Rendering functions (pure)
│   │   │   │   ├── bboxRenderer.ts            # Draw bboxes
│   │   │   │   ├── maskRenderer.ts            # Draw masks with opacity
│   │   │   │   ├── polygonRenderer.ts         # Draw polygons
│   │   │   │   ├── keypointsRenderer.ts       # Draw keypoints + skeleton
│   │   │   │   ├── landmarksRenderer.ts       # Draw landmarks
│   │   │   │   └── obbRenderer.ts             # Draw rotated bboxes
│   │   │   ├── services/
│   │   │   │   └── annotationService.ts       # Save/Load annotations
│   │   │   └── types.ts
│   │   │
│   │   ├── export/                 # FASE 1 + 2 - Dataset Export
│   │   │   ├── components/
│   │   │   │   ├── ExportDialog.tsx           # Export modal
│   │   │   │   ├── FormatSelector.tsx         # Dropdown for export formats
│   │   │   │   └── ExportProgress.tsx         # Progress bar during export
│   │   │   ├── exporters/                     # Export format implementations
│   │   │   │   ├── BaseExporter.ts            # Abstract base
│   │   │   │   ├── YOLOExporter.ts            # FASE 1 - YOLO Detection/Seg
│   │   │   │   ├── COCOExporter.ts            # FASE 1 - COCO JSON
│   │   │   │   ├── PascalVOCExporter.ts       # FASE 2 - Pascal VOC XML
│   │   │   │   ├── CSVExporter.ts             # FASE 2 - CSV tables
│   │   │   │   └── MasksExporter.ts           # FASE 2 - U-Net PNG masks
│   │   │   ├── utils/
│   │   │   │   ├── zipUtils.ts                # JSZip wrapper
│   │   │   │   ├── converters.ts              # Mask→Polygon, normalize coords
│   │   │   │   └── maskToPolygon.ts           # Moore-Neighbor + Douglas-Peucker
│   │   │   └── services/
│   │   │       └── exportService.ts           # Orchestrate export process
│   │   │
│   │   ├── classification/         # FASE 3 - Classification Annotations
│   │   │   ├── components/
│   │   │   │   ├── ClassificationPanel.tsx    # Label selection UI
│   │   │   │   └── LabelSelector.tsx          # Single/Multi-label selector
│   │   │   └── hooks/
│   │   │       └── useClassification.ts       # Manage classification labels
│   │   │
│   │   ├── timeseries/             # FASE 3 - Time Series Annotations
│   │   │   ├── components/
│   │   │   │   ├── TimeSeriesCanvas.tsx       # Chart.js canvas
│   │   │   │   ├── TimelineNavigator.tsx      # Zoom timeline
│   │   │   │   ├── CSVImporter.tsx            # Import CSV wizard
│   │   │   │   └── TimeSeriesTools.tsx        # Point/Range annotation tools
│   │   │   ├── hooks/
│   │   │   │   ├── useTimeSeries.ts           # Manage TS data
│   │   │   │   └── useTSAnnotations.ts        # Point/Range annotations
│   │   │   └── services/
│   │   │       └── csvParser.ts               # Parse CSV files
│   │   │
│   │   ├── inference/              # FASE 4 - ONNX Inference
│   │   │   ├── components/
│   │   │   │   ├── InferencePanel.tsx         # Main inference UI
│   │   │   │   ├── ModelUploader.tsx          # Upload .onnx files
│   │   │   │   ├── PredictionControls.tsx     # Confidence slider, etc.
│   │   │   │   ├── PredictionOverlay.tsx      # Show predictions on canvas
│   │   │   │   └── ModelArchViewer.tsx        # Visualize model architecture
│   │   │   ├── hooks/
│   │   │   │   ├── useONNXRuntime.ts          # ONNX session management
│   │   │   │   ├── useInference.ts            # Run inference
│   │   │   │   └── useBatchInference.ts       # Batch processing
│   │   │   ├── services/
│   │   │   │   ├── onnxService.ts             # ONNX runtime wrapper
│   │   │   │   ├── modelParser.ts             # Parse .onnx with protobuf.js
│   │   │   │   ├── preprocessor.ts            # Letterbox, normalize, etc.
│   │   │   │   └── postprocessor.ts           # NMS, threshold filtering
│   │   │   └── types.ts
│   │   │
│   │   └── training/               # FASE 5 - Training with Connector
│   │       ├── components/
│   │       │   ├── TrainingDialog.tsx         # Training config modal
│   │       │   ├── HyperparameterForm.tsx     # Epochs, LR, batch size, etc.
│   │       │   ├── ProgressMonitor.tsx        # Real-time progress bar
│   │       │   ├── MetricsChart.tsx           # Loss/accuracy charts
│   │       │   ├── CodeGenerator.tsx          # Generate Python code
│   │       │   └── ConnectorStatus.tsx        # Connection indicator
│   │       ├── hooks/
│   │       │   ├── useTrainingJob.ts          # Manage training jobs
│   │       │   ├── useWebSocket.ts            # WebSocket connection
│   │       │   └── useConnector.ts            # Connector API calls
│   │       ├── services/
│   │       │   ├── trainingService.ts         # API calls to FastAPI
│   │       │   ├── codeGenerator.ts           # Generate training scripts
│   │       │   └── websocketService.ts        # WebSocket manager
│   │       └── types.ts
│   │
│   ├── components/                 # Shared/UI components
│   │   └── ui/                     # Shadcn components (auto-generated)
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── select.tsx
│   │       ├── slider.tsx
│   │       ├── toast.tsx
│   │       ├── toaster.tsx
│   │       ├── tabs.tsx
│   │       ├── badge.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── tooltip.tsx
│   │       ├── progress.tsx
│   │       ├── separator.tsx
│   │       ├── label.tsx
│   │       ├── radio-group.tsx
│   │       ├── checkbox.tsx
│   │       ├── popover.tsx
│   │       ├── command.tsx
│   │       ├── alert.tsx
│   │       └── table.tsx
│   │
│   ├── hooks/                      # Global custom hooks
│   │   ├── useToast.ts             # Toast notifications
│   │   ├── useLocalStorage.ts      # LocalStorage wrapper
│   │   └── useMediaQuery.ts        # Responsive breakpoints
│   │
│   └── styles/
│       ├── globals.css             # Tailwind directives + base styles
│       └── themes.css              # CSS custom properties (dark mode ready)
│
├── connector/                      # FastAPI Python Backend (FASE 5)
│   ├── main.py                     # FastAPI application entry
│   ├── routers/
│   │   ├── training.py             # Training endpoints
│   │   ├── modules.py              # Module management endpoints
│   │   └── websocket.py            # WebSocket for progress
│   ├── modules/                    # Training modules (lazy download)
│   │   ├── ultralytics_yolo/
│   │   │   ├── __init__.py
│   │   │   └── trainer.py
│   │   ├── pytorch_custom/
│   │   │   ├── __init__.py
│   │   │   └── trainer.py
│   │   └── tensorflow_unet/
│   │       ├── __init__.py
│   │       └── trainer.py
│   ├── services/
│   │   ├── trainer.py              # Abstract trainer base
│   │   └── downloader.py           # Module downloader
│   ├── requirements.txt            # Python dependencies
│   └── .env.example
│
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── components.json                 # Shadcn config
├── .env.example
├── .gitignore
└── README.md
```

---

## PLAN DE FASES (Desarrollo Progresivo)

### ✅ FASE 1: Core + BBox/Mask + YOLO Export (MVP Funcional) - COMPLETADA

**Estado:** ✅ **IMPLEMENTADA Y FUNCIONAL** (2026-01-02)

**Objetivo:** Aplicación funcional para anotar bounding boxes y máscaras con exportación YOLO.

**Duración Estimada:** Base sólida para desarrollo iterativo

**Build Status:** ✅ TypeScript compilation successful | Bundle: 493KB (152KB gzip)

**Features Implementadas:**

**Setup Técnico:**
- ✅ Vite + React 19 + TypeScript
- ✅ Tailwind CSS + Shadcn/ui
- ✅ Dexie DB con stores: `projects`, `images`
- ✅ i18next con 2 idiomas (Español, Inglés)
- ✅ Zustand para estado global ligero

**Layout & Navigation:**
- ✅ AppLayout: Header + Sidebar + Main area
- ✅ Header: Logo, Language selector, Storage indicator
- ✅ Sidebar: Project switcher, Stats panel, Tool buttons
- ✅ Responsive design (mobile-ready)

**Projects Feature:**
- ✅ Create project (name, type selection, classes)
- ✅ List projects (cards with metadata)
- ✅ Delete project (with confirmation)
- ✅ Switch active project
- ✅ Class Manager: Add, Edit, Delete, Color picker
- ✅ Project stats: Total images, annotated count, progress bar
- ✅ Export/Import .tix files (complete project with images)

**Gallery Feature:**
- ✅ Upload multiple images (drag & drop / file input)
- ✅ Grid view with thumbnails
- ✅ Filters: All / Annotated / Unannotated
- ✅ Visual indicators (green border for annotated)
- ✅ Navigate with Prev/Next buttons or arrow keys
- ✅ Delete images

**Canvas Feature:**
- ✅ Image rendering with devicePixelRatio (sharp on HiDPI)
- ✅ Zoom controls (in/out/reset) - Range: 10%-500%
- ✅ Pan tool (drag canvas with hand tool or wheel)
- ✅ Transform matrix for zoom/pan
- ✅ BBox Tool: Draw rectangles
- ✅ Mask Tool: Brush with size slider (5-100px), Erase mode
- ✅ Select Tool: Edit/move/resize annotations
- ✅ Annotations list: Show all annotations, click to select, delete
- ✅ Class selector: Quick select with 1-9 keys
- ✅ Toggle labels visibility
- ✅ Toggle grid overlay

**Export Feature:**
- ✅ YOLO Detection format (.txt normalized coords)
- ✅ YOLO Segmentation format (.txt polygon coords)
- ✅ ZIP generation with JSZip
- ✅ Structure: images/ + labels/ + classes.txt + data.yaml
- ✅ Export progress indicator

**Keyboard Shortcuts:**
- ✅ 1-9: Select class by index
- ✅ B: BBox tool
- ✅ M: Mask tool
- ✅ V: Select tool
- ✅ H: Pan tool
- ✅ Ctrl+S: Save annotations
- ✅ Ctrl+Z: Undo last action
- ✅ Del/Backspace: Delete selected annotation
- ✅ ← / → / PageUp / PageDown: Navigate images
- ✅ Esc: Deselect

**Entregable FASE 1:**
- Aplicación React funcional y deployable
- Usuarios pueden crear proyectos, subir imágenes, anotar bboxes/máscaras
- Exportar dataset en formato YOLO
- Interfaz completamente traducida (ES/EN)

---

### ✅ FASE 2: Polygon + Keypoints + Landmarks + OBB + More Exports (COMPLETADA - 2026-01-02)

**Objetivo:** Herramientas avanzadas de anotación y múltiples formatos de exportación.

**Duración:** Desarrollo iterativo completado el 2026-01-02

**Build Status:** ✅ TypeScript compilation successful | Bundle: 508.95KB (156.77KB gzip)

**Features Implementadas:**

**Canvas Tools (4 nuevas):**
- ✅ **PolygonTool**: Click to add vertices, auto-close (double-click o cerca del primer punto), mínimo 3 puntos, preview en tiempo real
- ✅ **KeypointsTool**: 5 skeleton presets predefinidos (COCO-17, MediaPipe-33, MediaPipe-Hand-21, Face-Basic-10, Animal-Quadruped), colocación secuencial con guía visual, soporte multi-instancia
- ✅ **LandmarksTool**: Puntos nombrados personalizables, colocación secuencial con preview, configuración dinámica de nombres
- ✅ **OBBTool**: Rotated bounding boxes, handle visual de rotación, teclas R/Shift+R para rotar (±15°), indicador de ángulo

**Renderers (4 nuevos):**
- ✅ **polygonRenderer**: Relleno semitransparente, vértices visibles, label en centroide
- ✅ **keypointsRenderer**: Esqueleto con conexiones, puntos coloreados, labels con instance ID
- ✅ **landmarksRenderer**: Puntos con nombres flotantes, outline para legibilidad
- ✅ **obbRenderer**: Rectángulos rotados, handle de rotación, label con ángulo

**Export Formats (5 nuevos):**
- ✅ **COCO JSON**: Formato industry-standard, soporte para Detection/Segmentation/Keypoints, metadata completa (info, licenses, categories), cálculo automático de áreas, conversión OBB→BBox
- ✅ **Pascal VOC XML**: Un XML por imagen, estructura estándar (folder, filename, size, object, bndbox), escape correcto de caracteres, soporte bbox y OBB
- ✅ **CSV (4 variantes)**:
  - Detection: filename, dimensions, class, bbox coords
  - Landmarks: filename + coordenadas nombradas (x, y)
  - Keypoints: filename + keypoints con visibilidad
  - Classification: filename, class (single/multi-label)
- ✅ **U-Net Masks**: PNG grayscale masks, cada clase = valor de gris diferente, modo escalado (1-255) o indexado, soporte masks y polygons, classes.txt con mapeo
- ✅ **Folders by Class**: Carpetas organizadas por clase (class1/, class2/, unlabeled/), README.txt con estadísticas, nombres sanitizados

**Utilities (2 nuevas):**
- ✅ **maskToPolygon**: Moore-Neighbor tracing algorithm, extracción de contornos, soporte múltiples regiones, filtro por área mínima, cálculo de área (shoelace formula)
- ✅ **douglasPeucker**: Polygon simplification, control de tolerancia (epsilon), alternativa radial distance (más rápida), método combinado, cálculo de % reducción

**YOLO Improvements:**
- ✅ data.yaml generator actualizado con skeleton config (kpt_shape, keypoint_names, skeleton connections)

**i18n:**
- ✅ 5 idiomas actualizados: Français, 中文, 日本語, Deutsch, Português
- ✅ Traducciones para polygon, keypoints, landmarks, obb tools

**Keyboard Shortcuts Nuevos:**
- ✅ P: Polygon tool
- ✅ K: Keypoints tool
- ✅ L: Landmarks tool
- ✅ O: OBB tool
- ✅ R / Shift+R: Rotar OBB (±15°)

**Entregable FASE 2:**
- ✅ 6 tipos de anotación de imágenes funcionales (bbox, mask, polygon, keypoints, landmarks, obb)
- ✅ 7 formatos de exportación completos (YOLO Detection/Segmentation, COCO, PascalVOC, CSV x4, U-Net, Folders)
- ✅ Conversión automática entre formatos (mask→polygon)
- ✅ 10 idiomas soportados completamente
- ✅ 15 archivos nuevos (~60 archivos totales)
- ✅ Algoritmos de visión computacional implementados (Moore-Neighbor, Douglas-Peucker)

---

### ✅ FASE 3: Classification + Time Series (COMPLETADA - 2026-01-02)

**Objetivo:** Soporte completo para clasificación y series temporales.

**Duración:** Desarrollo iterativo completado el 2026-01-02

**Build Status:** ✅ TypeScript compilation successful | Bundle: 925.33KB (295.70KB gzip)

**Features Implementadas:**

**Classification:**
- ✅ Single-label classification (radio buttons)
- ✅ Multi-label classification (checkboxes)
- ✅ ClassificationPanel component con selector de etiquetas
- ✅ LabelSelector component (Radio/Checkbox según tipo)
- ✅ Hook useClassification para gestión de estado
- ✅ Auto-save con evento `annotix:save`
- ✅ Integración completa con sistema de clases
- ✅ Indicadores visuales de estado (badges)
- ✅ Export: Folders by Class, Classification CSV (desde FASE 2)

**Time Series - Base (Importación y Visualización):**
- ✅ Esquema de base de datos completo:
  - Nueva tabla `timeseries` en Dexie
  - Interfaces: TimeSeries, TimeSeriesData, TimeSeriesAnnotation
  - Soporte univariado y multivariado
  - 5 tipos de anotaciones: point, range, classification, event, anomaly
- ✅ CSV Parser robusto:
  - Validación de formato CSV
  - Detección automática de headers
  - Selección de columna timestamp configurable
  - Delimitador configurable
  - Manejo de errores robusto
- ✅ Servicios:
  - csvParser.ts - Parser con validación completa
  - timeseriesService.ts - CRUD operations con Dexie
- ✅ Hooks base:
  - useTimeSeries - Gestión de series temporales
  - useCurrentTimeSeries - Serie temporal activa
- ✅ Componentes base:
  - CSVImporter - Wizard de importación con opciones
  - TimeSeriesGallery - Lista/galería con estadísticas
- ✅ Sistema de navegación:
  - Galería con stats (total, anotadas, pendientes)
  - Selección de series
  - Indicadores visuales
- ✅ 9 tipos de proyectos soportados:
  - Timeseries Classification
  - Timeseries Forecasting
  - Anomaly Detection
  - Timeseries Segmentation
  - Pattern Recognition
  - Event Detection
  - Timeseries Regression
  - Clustering
  - Imputation

**Time Series - Herramientas Interactivas (COMPLETADO 2026-01-02):**
- ✅ **Hook useTSAnnotations** - Gestión completa de anotaciones:
  - CRUD operations (crear, actualizar, eliminar, limpiar)
  - 5 herramientas: Select, Point, Range, Event, Anomaly
  - Estado de dibujo (isDrawing, tempAnnotation)
  - Selección y edición de anotaciones
  - Integración con Dexie para persistencia automática
  - Uso de UUID v4 para IDs únicos
- ✅ **TimeSeriesTools Component** - Barra de herramientas:
  - 5 botones de herramientas con iconos (Select, Point, Range, Event, Anomaly)
  - Tooltips con atajos de teclado (V, P, R, E, A)
  - Contador de anotaciones en tiempo real
  - Botón para limpiar todas las anotaciones
  - Indicador visual de herramienta activa
  - Integración con Lucide icons
- ✅ **TimeSeriesAnnotationsList Component** - Lista lateral:
  - Lista scrollable de todas las anotaciones
  - Iconos específicos por tipo (MapPin, MoveHorizontal, Zap, AlertTriangle)
  - Información detallada (timestamp formateado, tipo, clase)
  - Click para seleccionar/deseleccionar
  - Botón de eliminar por anotación
  - Badges de clase con colores del proyecto
  - Scroll area con Shadcn ScrollArea
  - Estado visual de selección (highlight)
- ✅ **TimeSeriesCanvas Interactivo** - Canvas completamente funcional:
  - **Interacción con clicks**:
    - Point tool: Click simple para marcar punto
    - Range tool: Click inicio + Click fin (drag visual)
    - Event tool: Click para marcar evento
    - Anomaly tool: Click para marcar anomalía
  - **Renderizado en tiempo real** con Chart.js Annotation Plugin:
    - Points: Círculos de colores (6px radius)
    - Ranges: Cajas semitransparentes con bordes
    - Events: Líneas verticales punteadas con labels
    - Anomalies: Puntos rojos destacados (8px radius)
    - Preview en vivo mientras se dibuja (tempAnnotation)
    - Colores por clase del proyecto activo
  - **Plugins Chart.js**:
    - chartjs-plugin-annotation - Marcadores y anotaciones visuales
    - chartjs-plugin-zoom - Zoom interactivo y pan
  - **Zoom/Pan avanzado**:
    - Zoom con rueda del mouse (scroll)
    - Pan arrastrando el gráfico (click + drag)
    - Botones UI: Zoom in (+20%), Zoom out (-20%), Reset
    - Métodos: chart.zoom(), chart.resetZoom()
  - **Chart.js features**:
    - Gráficos de líneas interactivos
    - Soporte univariado y multivariado
    - Tooltips interactivos con mode: 'index'
    - Leyendas para series múltiples
    - Responsive y maintainAspectRatio: false
  - **Instrucciones contextuales**:
    - Panel inferior con instrucciones según herramienta activa
    - Muestra solo cuando tool !== 'select'
    - Traducciones completas (EN, ES)
  - **Sidebar integrado**:
    - 320px de ancho fijo
    - Lista de anotaciones con scroll
    - Sincronizado con selección del canvas
  - **Eventos onClick y onHover**:
    - onClick: Crear anotaciones, finalizar rangos
    - onHover: Actualizar preview de rangos
    - Conversión de coordenadas: pixel → data coordinates
    - Validación de índices de timestamps
- ✅ **Keyboard Shortcuts**:
  - V - Select tool
  - P - Point annotation tool
  - R - Range annotation tool
  - E - Event annotation tool
  - A - Anomaly detection tool
  - Esc - Cancelar dibujo actual
  - Delete/Backspace - Eliminar anotación seleccionada
  - Event listeners globales con cleanup

**App Integration:**
- ✅ Router lógico para 3 categorías de proyectos:
  - Image-based (bbox, mask, polygon, keypoints, landmarks, obb, instance-seg)
  - Classification (single-label, multi-label)
  - Time Series (9 tipos)
- ✅ Helper functions: isTimeSeriesProject(), isClassificationProject()
- ✅ UI Store extendido con currentTimeSeriesId

**i18n:**
- ✅ Traducciones actualizadas (EN, ES)
- ✅ Nueva sección "common" (save, clear, delete, cancel, importing)
- ✅ Nueva sección "classification" (8 keys)
- ✅ Nueva sección "timeseries" (34 keys totales):
  - Base: 19 keys (importación, navegación)
  - Tools: 6 keys (nombres de herramientas)
  - Instructions: 4 keys (instrucciones por tool)
  - Labels: 5 keys (UI labels adicionales)

**Componentes Shadcn:**
- ✅ Checkbox component instalado
- ✅ ScrollArea component instalado

**Dependencias Nuevas:**
- ✅ uuid + @types/uuid - Generación de IDs únicos
- ✅ chartjs-plugin-annotation - Anotaciones en gráficos
- ✅ chartjs-plugin-zoom - Zoom y pan interactivo

**Archivos Creados/Modificados (FASE 3 completa):**
- **Base (primera iteración):** 15 archivos (~1,200 líneas)
- **Herramientas interactivas:** 3 archivos nuevos + 3 modificados (~800 líneas)
- **Total FASE 3:** 18 archivos (~2,000 líneas de código)

**Entregable FASE 3:**
- ✅ Clasificación single/multi-label funcional
- ✅ Sistema COMPLETO de series temporales:
  - ✅ Importación CSV con validación
  - ✅ Visualización interactiva con Chart.js
  - ✅ 5 herramientas de anotación interactivas
  - ✅ Renderizado en tiempo real de anotaciones
  - ✅ Zoom/Pan con rueda del mouse
  - ✅ Lista lateral de anotaciones
  - ✅ Atajos de teclado
  - ✅ Colores por clase
  - ✅ Persistencia automática en Dexie
- ✅ 18 tipos de proyectos totales (9 imágenes + 2 clasificación + 7 TS funcionales)
- ✅ Build exitoso: 925.33KB (295.70KB gzip)
- ✅ Incremento vs FASE 2: +77KB gzip (+35%)

---

### FASE 4: ONNX Inference

**Objetivo:** Auto-anotación con modelos ONNX pre-entrenados.

**Features Implementadas:**

**ONNX Runtime:**
- ✅ ONNX Runtime Web con backend WebGL (fallback WASM)
- ✅ Model upload (.onnx files)
- ✅ Model parser: protobuf.js para leer arquitectura
- ✅ Model info viewer: Input/output shapes, layers

**Inference Engine:**
- ✅ Detection inference: YOLO v5/v8/v9/v10/v11
- ✅ Segmentation inference: YOLO segmentation models
- ✅ Classification inference
- ✅ Preprocessing pipeline:
  - Letterbox resize (maintain aspect ratio)
  - Normalization (0-1 range)
  - RGB/BGR conversion
  - Tensor formatting
- ✅ Postprocessing pipeline:
  - Non-Maximum Suppression (NMS)
  - Confidence threshold filtering
  - Coordinate denormalization
  - Mask decoding

**UI/UX:**
- ✅ Inference panel (collapsible sidebar)
- ✅ Confidence threshold slider (0-1)
- ✅ Auto-inference toggle (run on image load)
- ✅ Prediction overlay (show/hide predictions)
- ✅ Convert predictions → annotations (one-click)
- ✅ Batch inference: Run on all unannotated images
- ✅ Progress bar for batch processing

**Caching:**
- ✅ InferenceCache table in Dexie
- ✅ Cache predictions by (imageId + modelHash)
- ✅ Avoid re-inference on same image+model

**Entregable FASE 4:**
- Auto-anotación funcional para detección y segmentación
- Importar modelos ONNX y ejecutar en navegador
- Batch inference para acelerar anotación de datasets grandes
- Cache inteligente de predicciones

---

### FASE 5: FastAPI Connector + Training + Code Generator

**Objetivo:** Sistema completo de entrenamiento local con progreso en tiempo real.

**Features Implementadas:**

**FastAPI Backend:**
- ✅ Migrar de Flask → FastAPI
- ✅ Async endpoints para operaciones pesadas
- ✅ WebSocket endpoint para progreso en tiempo real
- ✅ CORS habilitado para localhost
- ✅ Arquitectura modular de módulos de entrenamiento

**Módulos de Entrenamiento:**
- ✅ Ultralytics YOLO (~500MB):
  - YOLOv8, v9, v10, v11
  - Detection, Segmentation, Pose
- ✅ PyTorch Custom:
  - ResNet, EfficientNet, ViT
  - Custom CNN architectures
- ✅ TensorFlow U-Net:
  - Semantic segmentation
  - U-Net variants

**Módulo Management:**
- ✅ Lazy download: Módulos se descargan solo cuando se usan
- ✅ Version checking: Actualizar módulos si hay nueva versión
- ✅ Local cache: ~/.annotix/modules/
- ✅ Download progress tracking

**Training API:**
- ✅ POST /train: Start training job
- ✅ GET /progress: Get current progress (deprecated, usar WebSocket)
- ✅ WebSocket /ws/training/{job_id}: Real-time updates
- ✅ POST /upload: Upload dataset ZIP
- ✅ GET /modules: List available modules
- ✅ POST /module/install: Install/update module

**Frontend Integration:**
- ✅ Training Dialog: Configure hyperparameters
- ✅ Hyperparameter Form:
  - Framework selector (Ultralytics, PyTorch, TensorFlow)
  - Model type/size
  - Epochs, batch size, learning rate
  - Optimizer (Adam, AdamW, SGD, RMSprop)
  - Device (CPU, CUDA, MPS)
  - Image size (416, 640, 1280)
  - Data augmentation toggles
  - Early stopping patience
  - Validation split
- ✅ Progress Monitor:
  - Real-time progress bar (WebSocket)
  - Live logs streaming
  - Metrics charts (loss, accuracy, mAP)
- ✅ Code Generator:
  - Generate complete Python training script
  - Framework-specific code (Ultralytics, PyTorch, TensorFlow)
  - Executable standalone scripts
  - Comments and documentation

**Connector Status:**
- ✅ Connection indicator (green/red dot)
- ✅ Auto-detect localhost:8000
- ✅ Retry logic on connection failure

**TrainingJobs Table:**
- ✅ Store training job history in Dexie
- ✅ Job status: pending, running, completed, failed
- ✅ Store config, progress, logs, metrics
- ✅ Resume incomplete jobs (future)

**Entregable FASE 5:**
- Entrenamiento local de modelos con FastAPI
- Progreso en tiempo real con WebSocket
- Generador de código Python completo
- Historial de jobs de entrenamiento
- Sistema modular extensible para agregar frameworks

---

## COMPONENTES SHADCN/UI

### Instalación Progresiva

```bash
# Inicializar Shadcn/ui (una sola vez)
npx shadcn@latest init

# FASE 1 - Core UI Components
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add select
npx shadcn@latest add slider
npx shadcn@latest add toast
npx shadcn@latest add tabs
npx shadcn@latest add badge
npx shadcn@latest add dropdown-menu
npx shadcn@latest add tooltip
npx shadcn@latest add progress
npx shadcn@latest add separator
npx shadcn@latest add label

# FASE 2 - Advanced Forms
npx shadcn@latest add radio-group
npx shadcn@latest add checkbox
npx shadcn@latest add popover

# FASE 3 - Data Display
npx shadcn@latest add table
npx shadcn@latest add alert

# FASE 4 - Command Palette (optional)
npx shadcn@latest add command

# FASE 5 - Additional (if needed)
npx shadcn@latest add accordion
npx shadcn@latest add scroll-area
```

### Componentes por Feature

| Feature | Componentes Shadcn Usados |
|---------|---------------------------|
| **Projects** | Dialog, Card, Input, Select, Button, Dropdown Menu, Badge |
| **Gallery** | Card, Badge, Progress, Tooltip, Button |
| **Canvas** | Slider, Button, Tooltip, Separator, Tabs |
| **Export** | Dialog, Select, Progress, Button, Alert |
| **Classification** | Radio Group, Checkbox, Button |
| **Time Series** | Slider, Button, Separator, Tooltip |
| **Inference** | Dialog, Slider, Progress, Button, Popover, Alert |
| **Training** | Dialog, Input, Select, Slider, Progress, Button, Tabs, Table |

---

## COMANDOS DE INSTALACIÓN

### Setup Inicial (Fase 1)

```bash
# 1. Crear proyecto Vite con React + TypeScript
npm create vite@latest annotix -- --template react-ts
cd annotix

# 2. Instalar Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 3. Configurar Shadcn/ui
npx shadcn@latest init
# Seleccionar:
# - TypeScript: Yes
# - Style: Default
# - Base color: Slate
# - CSS variables: Yes

# 4. Instalar dependencias core
npm install dexie
npm install react-i18next i18next i18next-browser-languagedetector
npm install zustand
npm install jszip
npm install lucide-react

# 5. Instalar componentes Shadcn (Fase 1)
npx shadcn@latest add button dialog card input select slider toast tabs badge dropdown-menu tooltip progress separator label

# 6. Crear estructura de carpetas
mkdir -p src/features/{core,projects,gallery,canvas,export}/{components,hooks,services}
mkdir -p src/features/canvas/{tools,renderers}
mkdir -p src/lib
mkdir -p public/locales

# 7. Copiar archivos de traducción
# Copiar locales/*.json del proyecto vanilla a public/locales/

# 8. Ejecutar dev server
npm run dev
```

### Dependencias Adicionales por Fase

```bash
# FASE 3 - Time Series
npm install chart.js react-chartjs-2

# FASE 4 - ONNX Inference
npm install onnxruntime-web
npm install protobufjs

# FASE 5 - Training (Frontend)
# (No requiere dependencias adicionales en frontend)
```

### Backend FastAPI (Fase 5)

```bash
# En carpeta connector/
cd connector

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# o
venv\Scripts\activate  # Windows

# Instalar dependencias
pip install fastapi uvicorn python-multipart aiofiles websockets

# Para módulos de entrenamiento (lazy install):
# ultralytics_yolo:
pip install ultralytics torch torchvision

# pytorch_custom:
pip install torch torchvision timm

# tensorflow_unet:
pip install tensorflow opencv-python

# Ejecutar servidor
uvicorn main:app --reload --port 8000
```

---

## CONFIGURACIONES CLAVE

### vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'dexie': ['dexie'],
          'i18n': ['react-i18next', 'i18next'],
        },
      },
    },
  },
})
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### components.json (Shadcn Config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

---

## NOTAS TÉCNICAS IMPORTANTES

### Canvas System

**Coordinate Systems:**
- **Screen coordinates**: Mouse events en CSS pixels
- **Canvas coordinates**: Image pixels con zoom/pan aplicado
- **Transform**: `canvasX = (screenX - panX) / zoom`

**DevicePixelRatio Scaling:**
```typescript
const dpr = window.devicePixelRatio || 1;
canvas.width = displayWidth * dpr;
canvas.height = displayHeight * dpr;
ctx.scale(dpr, dpr);
```

**Transform Matrix:**
```typescript
ctx.save();
ctx.translate(panX, panY);
ctx.scale(zoom, zoom);
// Draw image and annotations
ctx.restore();
```

### Dexie Queries

**Optimized Queries:**
```typescript
// Get all images for project (indexed)
const images = await db.images
  .where('projectId')
  .equals(projectId)
  .toArray();

// Get unannotated images (indexed)
const pending = await db.images
  .where('metadata.status')
  .equals('pending')
  .toArray();

// Get recent projects (indexed)
const recent = await db.projects
  .orderBy('metadata.created')
  .reverse()
  .limit(10)
  .toArray();
```

**Transactions:**
```typescript
// Atomic update of project and images
await db.transaction('rw', [db.projects, db.images], async () => {
  await db.projects.update(projectId, { classes: newClasses });
  await db.images.where('projectId').equals(projectId).modify(image => {
    // Update annotations...
  });
});
```

### i18next Setup

```typescript
// src/lib/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'es',
    supportedLngs: ['en', 'es', 'fr', 'zh', 'ja', 'de', 'pt', 'it', 'ru', 'ko'],
    ns: ['translation'],
    defaultNS: 'translation',
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

**Usage in Components:**
```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('app.title')}</h1>
      <p>{t('project.created', { name: 'My Project' })}</p>
    </div>
  );
}
```

### Zustand Store Example

```typescript
// src/features/core/store/uiStore.ts
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  currentTool: string;
  zoom: number;
  toggleSidebar: () => void;
  setTool: (tool: string) => void;
  setZoom: (zoom: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  currentTool: 'select',
  zoom: 1,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTool: (tool) => set({ currentTool: tool }),
  setZoom: (zoom) => set({ zoom }),
}));
```

### Export Format Notes

**YOLO Format:**
- Normalized coordinates (0-1)
- Format: `<class_id> <x_center> <y_center> <width> <height>`
- One .txt per image in labels/ folder
- data.yaml con nc, names, train/val paths

**COCO Format:**
- JSON con images, annotations, categories
- Segmentation como polígonos: `[[x1,y1,x2,y2,...]]`
- Keypoints como flat array: `[x1,y1,v1,x2,y2,v2,...]`
- Visibility: 0=not labeled, 1=labeled but occluded, 2=visible

**Pascal VOC Format:**
- Un XML por imagen
- Estructura: folder, filename, size, object (name, bndbox)
- Solo bounding boxes (no segmentación)

### Mask to Polygon Conversion

**Algorithm: Moore-Neighbor Tracing**
1. Find contour start point (first white pixel)
2. Trace boundary using 8-connected neighbors
3. Return ordered list of boundary points

**Simplification: Douglas-Peucker**
1. Recursive algorithm to reduce polygon points
2. Epsilon parameter controls tolerance
3. Preserves shape while reducing file size

```typescript
// Example usage
const polygon = maskToPolygon(maskCanvas);
const simplified = douglasPeucker(polygon.points, epsilon=2.0);
```

### ONNX Preprocessing Pipeline

```typescript
// 1. Letterbox resize (maintain aspect ratio)
const letterboxed = letterboxResize(image, targetSize=640);

// 2. Normalize to [0, 1]
const normalized = normalize(letterboxed);

// 3. Convert to tensor [1, 3, 640, 640]
const tensor = imageToTensor(normalized);

// 4. Run inference
const output = await session.run({ images: tensor });

// 5. Postprocess (NMS, denormalize coords)
const predictions = postprocess(output, confidenceThreshold=0.25);
```

### WebSocket Real-Time Progress

```typescript
// Frontend
const ws = new WebSocket('ws://localhost:8000/ws/training/123');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'progress') {
    setProgress(data.value);
  } else if (data.type === 'log') {
    appendLog(data.message);
  } else if (data.type === 'metrics') {
    updateMetricsChart(data.metrics);
  }
};

// Backend (FastAPI)
@app.websocket("/ws/training/{job_id}")
async def training_websocket(websocket: WebSocket, job_id: int):
    await websocket.accept()
    async for progress in train_model(job_id):
        await websocket.send_json({
            "type": "progress",
            "value": progress.percent,
        })
```

---

## MIGRACIÓN DE DATOS (Estrategia)

### NO se implementará migración automática

**Decisión:** Empezar de cero sin código de migración de IndexedDB nativo a Dexie.

**Razón:** Simplifica desarrollo inicial, evita complejidad de one-time migration scripts.

**Workflow para usuarios:**
1. En versión vanilla: Exportar proyectos a .tix
2. En versión React: Importar .tix
3. Datos se almacenan en nuevo esquema Dexie

**Formato .tix (mantener compatibilidad):**
```json
{
  "version": "2.0",
  "project": {
    "name": "My Project",
    "type": "bbox",
    "classes": [...]
  },
  "images": [
    {
      "name": "image1.jpg",
      "blob": "<base64>",
      "annotations": [...]
    }
  ]
}
```

**ImportService manejará:**
- Parsing de .tix v1.x (vanilla) y v2.x (React)
- Conversión de estructuras antiguas a nuevas
- Validación de tipos con TypeScript

---

## TESTING (Futuro)

### Herramientas Recomendadas

```bash
# Unit testing
npm install -D vitest @testing-library/react @testing-library/jest-dom

# E2E testing
npm install -D playwright @playwright/test

# Type checking
npm install -D @types/react @types/react-dom
```

### Estructura de Tests

```
src/
├── features/
│   ├── projects/
│   │   ├── __tests__/
│   │   │   ├── projectService.test.ts
│   │   │   └── useProjects.test.tsx
```

---

## DESARROLLO WORKFLOW

### Git Branching Strategy

```bash
main          # Stable releases
├── develop   # Integration branch
│   ├── feature/fase-1-core
│   ├── feature/fase-2-polygon
│   ├── feature/fase-3-timeseries
│   ├── feature/fase-4-inference
│   └── feature/fase-5-training
```

### Development Commands

```bash
# Dev server
npm run dev

# Type checking
npm run type-check

# Build for production
npm run build

# Preview production build
npm run preview

# Linting (if configured)
npm run lint
```

### Code Style

- **Prettier** para formateo automático
- **ESLint** para linting
- **TypeScript strict mode** habilitado
- **Conventional Commits** para mensajes (opcional)

---

## DEPLOYMENT

### Opciones de Deploy

**1. Vercel (Recomendado para React)**
```bash
npm install -g vercel
vercel
```

**2. Netlify**
```bash
npm run build
# Drag & drop dist/ folder to netlify.app
```

**3. GitHub Pages**
```bash
npm run build
# Configure vite.config.ts base: '/repo-name/'
```

**4. Self-hosted**
```bash
npm run build
# Serve dist/ con nginx, apache, o cualquier servidor estático
```

### Build Optimizations

- Code splitting por feature
- Lazy loading de rutas (React.lazy)
- Tree shaking automático (Vite)
- Compresión gzip/brotli en servidor
- Service Worker para PWA (Fase futura)

---

## PRÓXIMOS PASOS

### Después de Fase 5

**Expansión de Modalidades:**
- Audio (10 tipos): Speech recognition, audio classification, etc.
- Video (9 tipos): Action recognition, object tracking, etc.
- 3D (9 tipos): Point cloud, mesh segmentation, etc.
- Texto/NLP (12 tipos): NER, sentiment analysis, etc.

**Mejoras de UI/UX:**
- Dark mode
- Customizable themes
- Dashboard con analytics
- Collaborative annotation (multi-user)
- Annotation review workflow
- Quality assurance tools

**Funcionalidades Avanzadas:**
- Auto-save (debounced)
- Undo/Redo stack completo (múltiples niveles)
- History timeline
- Annotation versioning
- Data augmentation batch processing
- Active learning integration

**Performance:**
- Virtual scrolling en gallery (react-window)
- Web Workers para procesamiento pesado
- Image tiling para imágenes gigantes
- Pagination/infinite scroll

**Integrations:**
- Cloud sync (Google Drive, Dropbox)
- Team collaboration (shared projects)
- API REST para integraciones externas
- Plugins system

---

## RECURSOS Y REFERENCIAS

### Documentación Oficial

- **React 19**: https://react.dev
- **Vite**: https://vitejs.dev
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Shadcn/ui**: https://ui.shadcn.com
- **Dexie.js**: https://dexie.org
- **i18next**: https://www.i18next.com
- **Zustand**: https://zustand-demo.pmnd.rs
- **ONNX Runtime Web**: https://onnxruntime.ai/docs/get-started/with-javascript.html
- **FastAPI**: https://fastapi.tiangolo.com

### Canvas & Algorithms

- **Canvas API**: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- **Moore-Neighbor Tracing**: https://en.wikipedia.org/wiki/Moore_neighborhood
- **Douglas-Peucker**: https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
- **Non-Maximum Suppression**: https://learnopencv.com/non-maximum-suppression/

### ML Formats

- **YOLO Format**: https://docs.ultralytics.com/datasets/
- **COCO Format**: https://cocodataset.org/#format-data
- **Pascal VOC**: http://host.robots.ox.ac.uk/pascal/VOC/

---

## CONTACTO Y SOPORTE

**Desarrollado por:**
FabLab TecMedHub
Universidad Austral de Chile - Sede Puerto Montt

**Repositorio:**
[GitHub URL - TBD]

**Licencia:**
[MIT / GPL / Propietaria - TBD]

---

## CHANGELOG

### Version 2.0.0 (En Desarrollo - React Migration)

**✅ FASE 1 (COMPLETADA - 2026-01-02):**
- [x] Setup Vite + React 19 + TypeScript
- [x] Dexie DB schema (projects, images con tipos NewProject, AnnotixImage)
- [x] i18next configuration (10 idiomas)
- [x] AppLayout & Core UI (Header, Sidebar, responsive)
- [x] Projects feature (CRUD completo con ClassManager)
- [x] Gallery feature (upload drag&drop, grid, filtros all/annotated/unannotated)
- [x] Canvas feature (BBox tool, Mask tool con brush/erase, zoom/pan)
- [x] Export YOLO format (Detection + Segmentation base)
- [x] Keyboard shortcuts (1-9 clases, B/M/V/H tools, Ctrl+S, flechas)
- [x] Font Awesome integrado
- [x] 16 componentes Shadcn/ui instalados
- [x] TypeScript compilation exitosa
- [x] Build production: 493KB (152KB gzip)

**✅ FASE 2 (COMPLETADA - 2026-01-02):**
- [x] PolygonTool (click para agregar vértices, auto-close, edición)
- [x] KeypointsTool (5 skeleton presets: COCO-17, MediaPipe-33, Hand-21, Face-10, Animal)
- [x] LandmarksTool (puntos nombrados personalizados)
- [x] OBBTool (bounding boxes rotados con handle de rotación)
- [x] Renderers: polygon, keypoints, landmarks, OBB
- [x] COCO JSON Exporter (Detection, Segmentation, Keypoints, Polygon)
- [x] Pascal VOC XML Exporter (per-image XML files)
- [x] CSV Exporter (4 formatos: detection, landmarks, keypoints, classification)
- [x] U-Net Masks Exporter (PNG grayscale masks)
- [x] Folders by Class Exporter (organización por carpetas)
- [x] maskToPolygon utility (Moore-Neighbor tracing algorithm)
- [x] douglasPeucker utility (polygon simplification)
- [x] YOLO data.yaml con skeleton config
- [x] Traducciones actualizadas (fr, zh, ja, de, pt)
- [x] Build production: 508.95KB (156.77KB gzip)

**✅ FASE 3 (COMPLETADA - 2026-01-02):**
- [x] Classification feature completa (single-label, multi-label)
- [x] ClassificationPanel component con LabelSelector
- [x] Hook useClassification con auto-save
- [x] Time Series schema en Dexie (tabla timeseries)
- [x] CSV Parser service (validación, headers, timestamps)
- [x] Time Series services y hooks base (useTimeSeries, useCurrentTimeSeries)
- [x] CSVImporter component (wizard de importación)
- [x] TimeSeriesGallery component (lista con stats)
- [x] Hook useTSAnnotations (CRUD anotaciones TS con UUID)
- [x] TimeSeriesTools component (5 herramientas: Select/Point/Range/Event/Anomaly)
- [x] TimeSeriesAnnotationsList component (lista lateral con scroll)
- [x] TimeSeriesCanvas COMPLETO con interactividad:
  - [x] Click en gráfico para crear anotaciones
  - [x] Renderizado en tiempo real con chartjs-plugin-annotation
  - [x] Zoom/Pan con chartjs-plugin-zoom (rueda mouse + drag)
  - [x] Preview en vivo de anotaciones temporales
  - [x] Colores por clase del proyecto
  - [x] Instrucciones contextuales por herramienta
  - [x] Sidebar integrado con lista de anotaciones
- [x] Keyboard shortcuts (V/P/R/E/A, Esc, Delete/Backspace)
- [x] Chart.js plugins instalados (annotation, zoom)
- [x] uuid + @types/uuid instalados
- [x] App router actualizado (3 categorías: image, classification, timeseries)
- [x] UI Store extendido (currentTimeSeriesId)
- [x] Checkbox + ScrollArea components de Shadcn instalados
- [x] Traducciones actualizadas (34 keys timeseries: tools, instructions, labels)
- [x] Build production: 925.33KB (295.70KB gzip)

**FASE 4-5:**
- [ ] (Ver secciones de fases arriba)

### Version 1.0.0 (Vanilla JS - Legacy)

- ✅ 18 tipos de anotación implementados
- ✅ 8+ formatos de exportación
- ✅ Inferencia ONNX (detección)
- ✅ Conector Python Flask
- ✅ 10 idiomas
- ✅ PWA offline-first

---

## ESTADO ACTUAL DEL PROYECTO

### ✅ FASE 1 - COMPLETADA (2026-01-02)

**Archivos Creados:** ~45 archivos TypeScript/React organizados por features

**Estructura Implementada:**
```
src/
├── features/
│   ├── core/          ✅ Layout, Header, Sidebar, Keyboard shortcuts
│   ├── projects/      ✅ CRUD, ClassManager, Stats
│   ├── gallery/       ✅ Upload, Grid, Filters, Navigation
│   ├── canvas/        ✅ BBox/Mask tools, Zoom/Pan, Annotations
│   └── export/        ✅ YOLO Detection/Segmentation
├── components/ui/     ✅ 16 componentes Shadcn (Button, Dialog, Card, etc.)
├── lib/
│   ├── db.ts          ✅ Dexie schema completo
│   ├── i18n.ts        ✅ i18next con 10 idiomas
│   └── utils.ts       ✅ Utilidades (cn, etc.)
└── App.tsx            ✅ Router lógico y event handlers
```

**Estado del Build:**
- ✅ TypeScript compilation: SUCCESS
- ✅ Vite build: SUCCESS (5.29s)
- ✅ Bundle size: 493KB (152KB gzip)
- ✅ Code splitting: vendor, dexie, i18n chunks

**Tecnologías Confirmadas:**
- React 19.0.0 ✅
- TypeScript 5.7 ✅
- Vite 6.4.1 ✅
- Tailwind CSS 3.4 ✅
- Dexie 4.0.11 ✅
- i18next 24.2.0 ✅
- Zustand 5.0.3 ✅
- JSZip 3.10.1 ✅

**Funcionalidades Verificadas:**
1. ✅ Crear proyectos (bbox/mask) con clases personalizadas
2. ✅ Subir imágenes múltiples con drag & drop
3. ✅ Anotar con BBox tool (rectángulos)
4. ✅ Anotar con Mask tool (pincel + borrador)
5. ✅ Exportar dataset YOLO (.zip con estructura correcta)
6. ✅ Cambiar idioma entre 10 opciones
7. ✅ Navegación con teclado (1-9, B/M/V/H, flechas)
8. ✅ Zoom/Pan en canvas
9. ✅ Filtros de galería (all/annotated/unannotated)
10. ✅ Indicador de almacenamiento IndexedDB

### ✅ FASE 2 - COMPLETADA (2026-01-02)

**Archivos Creados:** 15 archivos adicionales (Total: ~60 archivos)

**Estructura Ampliada:**
```
src/
├── features/
│   ├── canvas/
│   │   ├── tools/           ✅ +4 tools (Polygon, Keypoints, Landmarks, OBB)
│   │   ├── renderers/       ✅ +4 renderers (polygon, keypoints, landmarks, obb)
│   │   └── data/            ✅ skeletonPresets.ts (5 presets)
│   └── export/
│       ├── exporters/       ✅ +5 exporters (COCO, PascalVOC, CSV, UNet, Folders)
│       └── utils/           ✅ +2 utilities (maskToPolygon, douglasPeucker)
└── public/locales/          ✅ 10 idiomas actualizados
```

**Estado del Build:**
- ✅ TypeScript compilation: SUCCESS
- ✅ Vite build: SUCCESS (4.28s)
- ✅ Bundle size: 508.95KB (156.77KB gzip)
- ✅ Code splitting: vendor, dexie, i18n chunks

**Herramientas de Anotación (6 total):**
1. ✅ BBox Tool (FASE 1)
2. ✅ Mask Tool (FASE 1)
3. ✅ Polygon Tool (FASE 2) - Click to add vertices, auto-close
4. ✅ Keypoints Tool (FASE 2) - 5 skeleton presets
5. ✅ Landmarks Tool (FASE 2) - Named custom points
6. ✅ OBB Tool (FASE 2) - Rotated bounding boxes

**Formatos de Exportación (7 total):**
1. ✅ YOLO Detection (FASE 1)
2. ✅ YOLO Segmentation (FASE 1)
3. ✅ COCO JSON (FASE 2) - Detection, Segmentation, Keypoints
4. ✅ Pascal VOC XML (FASE 2) - Per-image XML files
5. ✅ CSV (FASE 2) - 4 variantes (detection, landmarks, keypoints, classification)
6. ✅ U-Net Masks (FASE 2) - PNG grayscale masks
7. ✅ Folders by Class (FASE 2) - Classification organization

**Algoritmos Implementados:**
- ✅ Moore-Neighbor Tracing (mask to polygon conversion)
- ✅ Douglas-Peucker (polygon simplification)

**Idiomas Soportados:** 10 (es, en, fr, zh, ja, de, pt, it, ru, ko)

### ✅ FASE 3 - COMPLETADA (2026-01-02)

**Archivos Creados:** 18 archivos adicionales (Total: ~78 archivos)

**Estructura Ampliada:**
```
src/
├── features/
│   ├── classification/        ✅ NUEVA
│   │   ├── components/
│   │   │   ├── ClassificationPanel.tsx
│   │   │   └── LabelSelector.tsx
│   │   └── hooks/
│   │       └── useClassification.ts
│   │
│   └── timeseries/            ✅ NUEVA (COMPLETA)
│       ├── components/
│       │   ├── CSVImporter.tsx
│       │   ├── TimeSeriesGallery.tsx
│       │   ├── TimeSeriesCanvas.tsx         ✅ ACTUALIZADO (interactivo)
│       │   ├── TimeSeriesTools.tsx          ✅ NUEVO
│       │   └── TimeSeriesAnnotationsList.tsx ✅ NUEVO
│       ├── hooks/
│       │   ├── useTimeSeries.ts
│       │   ├── useCurrentTimeSeries.ts
│       │   └── useTSAnnotations.ts          ✅ NUEVO
│       └── services/
│           ├── csvParser.ts
│           └── timeseriesService.ts
│
├── components/ui/
│   ├── checkbox.tsx           ✅ INSTALADO
│   └── scroll-area.tsx        ✅ INSTALADO
│
└── lib/
    └── db.ts                  ✅ ACTUALIZADO (Time Series schema)
```

**Estado del Build:**
- ✅ TypeScript compilation: SUCCESS
- ✅ Vite build: SUCCESS (5.62s)
- ✅ Bundle size: 925.33KB (295.70KB gzip)
- ✅ Modules: 1848 transformed
- ✅ Incremento vs FASE 2: +77KB gzip (+35%)

**Dependencias Nuevas:**
- chart.js 4.x ✅
- react-chartjs-2 latest ✅
- chartjs-plugin-annotation ✅ (anotaciones visuales)
- chartjs-plugin-zoom ✅ (zoom/pan interactivo)
- uuid + @types/uuid ✅ (IDs únicos)
- @radix-ui/react-checkbox (via shadcn) ✅
- @radix-ui/react-scroll-area (via shadcn) ✅

**Tipos de Proyectos Soportados (18 totales):**

**Imágenes (9):**
1. ✅ BBox (FASE 1)
2. ✅ Mask (FASE 1)
3. ✅ Polygon (FASE 2)
4. ✅ Keypoints (FASE 2)
5. ✅ Landmarks (FASE 2)
6. ✅ OBB (FASE 2)
7. ✅ Classification (FASE 3) - Single-label
8. ✅ Multi-Label Classification (FASE 3)
9. ✅ Instance Segmentation (base)

**Series Temporales (9):**
1. ✅ Timeseries Classification (FASE 3)
2. ✅ Timeseries Forecasting (FASE 3)
3. ✅ Anomaly Detection (FASE 3)
4. ✅ Timeseries Segmentation (FASE 3)
5. ✅ Pattern Recognition (FASE 3)
6. ✅ Event Detection (FASE 3)
7. ✅ Timeseries Regression (FASE 3)
8. ✅ Clustering (FASE 3)
9. ✅ Imputation (FASE 3)

**Features Classification:**
- ✅ Single-label classification con radio buttons
- ✅ Multi-label classification con checkboxes
- ✅ Panel interactivo con preview de selección
- ✅ Badges visuales para labels seleccionados
- ✅ Auto-save con Ctrl+S
- ✅ Instrucciones contextuales
- ✅ Integración completa con clases del proyecto

**Features Time Series (COMPLETAS):**
- ✅ **Importación y Visualización:**
  - Importación CSV con wizard interactivo
  - Validación de formato CSV
  - Detección automática de headers
  - Configuración de columna timestamp
  - Soporte univariado y multivariado
  - Visualización con Chart.js (Line charts)
  - Galería con estadísticas (total, anotadas, pendientes)
- ✅ **Herramientas Interactivas de Anotación:**
  - 5 herramientas: Select, Point, Range, Event, Anomaly
  - Click en gráfico para crear anotaciones
  - Preview en vivo de anotaciones temporales
  - Colores por clase del proyecto
  - Validación de coordenadas timestamp
- ✅ **Renderizado Visual:**
  - Points: Círculos de colores (6px radius)
  - Ranges: Cajas semitransparentes con bordes
  - Events: Líneas verticales punteadas con labels
  - Anomalies: Puntos rojos destacados (8px radius)
  - Renderizado en tiempo real con chartjs-plugin-annotation
- ✅ **Zoom y Pan:**
  - Zoom con rueda del mouse (scroll wheel)
  - Pan arrastrando el gráfico (click + drag)
  - Botones UI: Zoom in, Zoom out, Reset
  - chartjs-plugin-zoom integration
- ✅ **UI/UX:**
  - Barra de herramientas con tooltips
  - Lista lateral de anotaciones con scroll
  - Click para seleccionar/deseleccionar
  - Botón eliminar por anotación
  - Contador de anotaciones en tiempo real
  - Instrucciones contextuales por herramienta
- ✅ **Keyboard Shortcuts:**
  - V - Select tool
  - P - Point tool
  - R - Range tool
  - E - Event tool
  - A - Anomaly tool
  - Esc - Cancelar dibujo
  - Delete/Backspace - Eliminar anotación
- ✅ **Persistencia:**
  - Auto-save en Dexie con cada cambio
  - UUID v4 para IDs únicos
  - Sincronización automática con DB

**App Router:**
- ✅ 3 categorías de proyectos soportadas:
  - Image-based (7 tipos de herramientas)
  - Classification (2 tipos)
  - Time Series (9 tipos)
- ✅ Helper functions para determinar tipo de proyecto
- ✅ Navegación automática según tipo de proyecto

**Traducciones:**
- ✅ Inglés (EN) - 90+ keys totales FASE 3
- ✅ Español (ES) - 90+ keys totales FASE 3
- ✅ Secciones:
  - common (save, clear, delete, cancel, importing)
  - classification (8 keys)
  - timeseries (34 keys):
    - Base: 19 keys (importación, navegación, labels)
    - Tools: 6 keys (nombres de herramientas)
    - Instructions: 4 keys (instrucciones por tool)
    - Labels: 5 keys (UI labels adicionales)

### Próximos Pasos (FASE 4 - ONNX Inference)

**Pendiente para siguiente iteración:**
- [ ] ONNX Runtime Web integration
- [ ] Model upload y parsing
- [ ] Inference engine (detection, segmentation)
- [ ] Preprocessing pipeline (letterbox, normalize)
- [ ] Postprocessing (NMS, confidence filtering)
- [ ] Inference cache en Dexie
- [ ] Batch inference UI

### Comandos para Desarrollo

```bash
# Iniciar servidor de desarrollo
npm run dev

# Build para producción
npm run build

# Preview build
npm run preview

# Type checking
npx tsc --noEmit

# Linting (si se configura)
npm run lint
```

### Notas Técnicas Importantes

**Transformación de Datos:**
- `Image` (DB): Usa `blob`, `dimensions.width`, `dimensions.height`
- `AnnotixImage` (Componentes): Usa `image`, `width`, `height` (flattened)
- Transformación automática en `imageService.ts`

**Stores:**
- `uiStore`: Estado global UI (proyecto actual, imagen actual, serie temporal actual, herramienta activa, clase activa)
  - `currentProjectId`: ID del proyecto activo
  - `currentImageId`: ID de imagen activa (para proyectos de imagen)
  - `currentTimeSeriesId`: ID de serie temporal activa (FASE 3)
  - `activeTool`: Herramienta de dibujo activa
  - `activeClassId`: Clase activa para anotaciones
- `canvasTransformStore`: Zoom/pan separado (dentro de useCanvasTransform)
- `drawingToolStore`: Brush size/erase mode (dentro de useDrawingTool)

**Event System:**
- `annotix:annotation-created`: Disparado por tools al completar anotación
- `annotix:save`: Guardar anotaciones (Ctrl+S)
- `annotix:undo`: Deshacer última anotación (Ctrl+Z)

**Tipos Críticos:**
- `NewProject`: Para crear proyectos (sin id, metadata opcional)
- `AnnotixImage`: Formato de imágenes para componentes
- `NewAnnotixImage`: Para crear imágenes (sin id, metadata opcional)
- `Annotation`: Con tipos BBoxData, MaskData, PolygonData, KeypointsData, LandmarksData, OBBData, ClassificationData
- `TimeSeries`: Para series temporales (FASE 3)
- `TimeSeriesData`: Datos univariados/multivariados (FASE 3)
- `TimeSeriesAnnotation`: Con tipos PointAnnotation, RangeAnnotation, ClassificationAnnotation, EventAnnotation, AnomalyAnnotation (FASE 3)

---

**FIN DEL DOCUMENTO**

Este documento debe actualizarse conforme avanza el desarrollo. Cada fase completada debe marcarse con ✅ en el Changelog.
