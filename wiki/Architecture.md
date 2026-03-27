# Architecture

Annotix is a desktop application built with Tauri 2, combining a React 19 frontend with a Rust backend. This page covers the technical architecture in depth.

## System Overview

```
+-----------------------------------------------------+
|                    Frontend                           |
|   React 19 + TypeScript + Tailwind + shadcn/ui       |
|   Konva (canvas) . Chart.js (metrics) . i18next      |
|   Zustand (state) . React Router 7                   |
+-----------------------------------------------------+
|                  Tauri 2 IPC                          |
|             137+ registered commands                  |
+-----------------------------------------------------+
|                  Backend (Rust)                       |
|   +------------+ +-----------+ +-----------------+   |
|   |   Store    | | Commands  | | Export/Import   |   |
|   | (JSON+RAM) | | (16 mod)  | | (11+8 formats) |   |
|   +------------+ +-----------+ +-----------------+   |
|   +------------+ +-----------+ +-----------------+   |
|   |  Training  | | Browser   | | P2P (Iroh)      |   |
|   | (19 backs) | | Automat.  | | QUIC mesh       |   |
|   +------------+ +-----------+ +-----------------+   |
+-----------------------------------------------------+
|               External Integrations                   |
|   Python (micromamba) . FFmpeg . Chromium CDP         |
|   Cloud APIs . Iroh P2P network                      |
+-----------------------------------------------------+
```

---

## Storage Model

### No Database

Annotix uses **no SQL or embedded database**. All data is stored as JSON files and raw assets on disk.

```
~/.local/share/annotix/
  config.json                    -> { "projects_dir": "/chosen/path" }

{projects_dir}/{uuid}/
  project.json                   -> entire project (metadata, classes, all annotations)
  images/{uuid}_{filename}       -> original image files
  thumbnails/{id}.jpg            -> generated thumbnails
  videos/{uuid}_{filename}       -> video files
  models/{uuid}_{filename}       -> inference models
```

### ProjectFile

The `project.json` file contains a single `ProjectFile` struct:

```rust
pub struct ProjectFile {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub project_type: String,
    pub classes: Vec<ClassDef>,
    pub created: f64,                          // JS timestamp (ms)
    pub updated: f64,
    pub images: Vec<ImageEntry>,               // all images + their annotations
    pub timeseries: Vec<TimeSeriesEntry>,
    pub videos: Vec<VideoEntry>,
    pub training_jobs: Vec<TrainingJobEntry>,
    pub tabular_data: Vec<TabularDataEntry>,
    pub p2p: Option<P2pProjectConfig>,
    pub inference_models: Vec<InferenceModelEntry>,
    pub folder: Option<String>,
}
```

### In-Memory Cache

The backend maintains a `HashMap<String, CachedProject>` in memory:

```rust
pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub data_dir: PathBuf,
    pub cache: Mutex<HashMap<String, CachedProject>>,
}

pub struct CachedProject {
    pub data: ProjectFile,
    pub dir: PathBuf,
    pub dirty: bool,
}
```

### Access Patterns

| Method | Purpose |
|--------|---------|
| `with_project(id, \|pf\| ...)` | Read from cache (no disk IO) |
| `with_project_mut(id, \|pf\| ...)` | Write (sets dirty flag, auto-flushes) |
| `flush_project(id)` | Write to disk |

### Atomic Writes

All disk writes use the tmp-and-rename pattern:

```rust
fs::write(dir.join("project.json.tmp"), &content)?;   // 1. Write to temp
fs::rename("project.json.tmp", "project.json")?;       // 2. Atomic rename
```

This ensures the project file is never in a partially written state, even if the process crashes.

---

## Frontend-Backend Communication

### IPC Chain

Every frontend operation follows this chain:

```
Component -> Hook -> Service -> tauriDb -> invoke() -> Rust Command
```

Example for saving annotations:

```
AnnotationCanvas.tsx
  -> useAnnotations().addAnnotation(annotation)
    -> annotationService.save(projectId, imageId, annotations)
      -> tauriDb.saveAnnotations(projectId, imageId, annotations)
        -> invoke('save_annotations', { projectId, imageId, annotations })
```

### Centralized Bridge

`src/lib/tauriDb.ts` is the **only file** that calls `invoke()`. Components and services never call `invoke()` directly.

### Backend-to-Frontend Events

The Rust backend sends notifications to the frontend via Tauri events:

| Event | Trigger |
|-------|---------|
| `db:images-changed` | Image or annotation changes |
| `db:projects-changed` | Project list changes |
| `db:videos-changed` | Video changes |
| `db:tracks-changed` | Track/keyframe changes |
| `db:timeseries-changed` | Time series changes |
| `export:progress` | Export progress (0-100) |
| `import:progress` | Import progress (0-100) |
| `training:progress` | Training metrics and status |
| `inference:progress` | Inference batch progress |

### useTauriQuery Hook

A generic hook that combines data fetching with event-based invalidation:

```typescript
function useTauriQuery<T>(
    queryFn: () => Promise<T>,
    deps: unknown[],
    eventNames: string[]
): { data: T | undefined, isLoading: boolean, reload: () => void }
```

When any of the specified events fire, the query automatically re-fetches.

---

## State Management

Three layers of state, each with a different scope and persistence:

| Layer | Technology | Persistence | Scope |
|-------|-----------|-------------|-------|
| **UI Global** | Zustand (localStorage) | Across sessions | Active tool, class, project, sidebar |
| **Annotations** | Zustand (volatile) | Current session | Current image's annotations |
| **Undo/Redo** | Zustand (volatile) | Current image | 100-step history, resets on image change |

### Optimistic UI

The frontend updates state immediately, then persists to the backend asynchronously. A **save guard** (`captureSaveContext`) prevents saving annotations to the wrong image if the user navigates quickly.

---

## Handler Pattern

Each annotation tool is a class implementing the same interface:

```typescript
interface BaseHandler {
    onMouseDown(event: MouseEventData): void;
    onMouseMove(event: MouseEventData): void;
    onMouseUp(event: MouseEventData): void;
    finish(): void;
    cancel(): void;
}
```

`AnnotationCanvas.tsx` selects the active handler based on `uiStore.activeTool` and delegates all mouse events to it. Handlers are located in `src/features/canvas/handlers/`.

---

## Annotation Data Model

All annotation types share a common `AnnotationEntry`:

```rust
pub struct AnnotationEntry {
    pub id: String,                        // UUID v4
    pub annotation_type: String,           // "bbox", "polygon", etc.
    pub class_id: i64,                     // Reference to ClassDef.id
    pub data: serde_json::Value,           // Flexible JSON per type
    pub source: String,                    // "user" | "ai"
    pub confidence: Option<f64>,
    pub model_class_name: Option<String>,
}
```

The `data` field is **free-form JSON**, allowing each annotation type to define its own structure without schema migrations:

| Type | Data Shape |
|------|-----------|
| bbox | `{x, y, width, height}` |
| obb | `{x, y, width, height, rotation}` |
| polygon | `{points: [{x, y}, ...]}` |
| keypoints | `{points: [{x, y, visible, name}], skeletonType, instanceId}` |
| landmarks | `{points: [{x, y, name}, ...]}` |
| mask | `{base64png: "..."}` |

---

## Command Modules

The Rust backend registers 137+ Tauri commands across 16 modules:

| Module | Commands | Examples |
|--------|----------|----------|
| Projects | 7 | `create_project`, `list_projects`, `delete_project` |
| Images | 8 | `upload_images`, `save_annotations`, `get_image` |
| Videos | 13 | `upload_video`, `create_track`, `set_keyframe`, `bake_video_tracks` |
| Timeseries | 5 | `create_timeseries`, `save_ts_annotations` |
| Export | 1 | `export_dataset` |
| Import | 2 | `detect_import_format`, `import_dataset` |
| Inference | 14 | `upload_inference_model`, `start_batch_inference` |
| P2P | 25 | `p2p_create_session`, `p2p_lock_image`, `p2p_sync_annotations` |
| Training | 17 | `start_training`, `cancel_training`, `detect_gpu` |
| Tabular | 6 | `upload_tabular_file`, `get_tabular_preview` |
| Config | 3 | `is_setup_complete`, `set_projects_dir` |
| Settings | 3+ | `get_settings`, `save_settings` |
| CSV | 2+ | CSV parsing commands |
| Image Processing | 2+ | Thumbnail generation, image info |
| Automation | 5+ | Browser automation commands |

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| TypeScript | 5.7 | Static typing |
| Vite | 6 | Bundler and dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| shadcn/ui | — | Component library (Radix UI) |
| Zustand | 5 | Global state with localStorage persistence |
| React Router | 7 | SPA routing |
| Konva | 10 | 2D annotation canvas |
| Chart.js | 4 | Metrics visualization |
| i18next | 24 | Internationalization (10 languages) |
| Lucide React | — | Icons |
| UUID | 13 | Unique ID generation |

### Backend (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2 | Desktop framework + IPC |
| serde / serde_json | 1 | JSON serialization |
| image | 0.25 | Image processing |
| ffmpeg-the-third | 4 | Video frame extraction |
| zip | 2 | Export/import packaging |
| quick-xml | 0.37 | Pascal VOC XML |
| csv | 1.3 | CSV import/export |
| reqwest | 0.12 | HTTP client (cloud providers) |
| headless_chrome | 1.0 | Browser automation (CDP) |
| iroh | 0.96 | P2P networking (QUIC + CRDT) |
| tokio | 1 | Async runtime |
| blake3 | 1 | Hashing |
| uuid | 1 | ID generation |
| chrono | 0.4 | Timestamps |

### Python (via micromamba)

| Package | Purpose |
|---------|---------|
| ultralytics | YOLO, RT-DETR |
| rfdetr | RF-DETR |
| mmdet, mmseg, mmpose, mmrotate | OpenMMLab suite |
| segmentation-models-pytorch | Semantic segmentation |
| timm | Classification (700+ models) |
| detectron2 | Instance segmentation |
| tsai, pytorch-forecasting | Time series deep learning |
| pyod, tslearn, pypots, stumpy | Time series classical ML |
| scikit-learn, xgboost, lightgbm | Tabular ML |

---

## Project Structure

```
annotix/
├── package.json                 # Frontend dependencies and scripts
├── tsconfig.json                # TypeScript config
├── vite.config.ts               # Vite bundler config
├── tailwind.config.js           # Tailwind CSS config
├── components.json              # shadcn/ui config
├── ARCHITECTURE.md              # Architecture documentation
├── DOCS/                        # Technical reference docs
├── public/
│   ├── logo.png
│   └── locales/                 # 10 language files (JSON)
├── src/                         # React frontend
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Router and providers
│   ├── lib/
│   │   ├── db.ts                # Type definitions (mirrors Rust)
│   │   ├── tauriDb.ts           # Centralized invoke bridge
│   │   └── i18n.ts              # i18next configuration
│   ├── hooks/
│   │   └── useTauriQuery.ts     # Generic Tauri query hook
│   ├── components/ui/           # shadcn/ui components
│   └── features/
│       ├── core/                # Layout, shortcuts, UI state store
│       ├── projects/            # Project CRUD
│       ├── gallery/             # Image gallery + class management
│       ├── canvas/              # Annotation canvas
│       │   ├── handlers/        # Tool handlers (BBox, Polygon, etc.)
│       │   ├── components/      # Canvas component + renderers
│       │   ├── hooks/           # useAnnotations, canvas state
│       │   ├── store/           # undoStore
│       │   └── services/        # annotationService
│       ├── classification/      # Image classification
│       ├── video/               # Video annotation
│       ├── timeseries/          # Time series
│       ├── tabular/             # Tabular data
│       ├── training/            # ML training panel
│       ├── export/              # Export UI
│       ├── import/              # Import UI
│       ├── inference/           # Model inference
│       ├── settings/            # App settings + Python env
│       ├── browser-automation/  # Chrome automation
│       ├── p2p/                 # P2P collaboration
│       └── setup/               # Initial setup
└── src-tauri/                   # Rust backend
    ├── Cargo.toml               # Rust dependencies
    ├── tauri.conf.json          # Tauri config
    └── src/
        ├── lib.rs               # Command registrations (137+)
        ├── main.rs              # Entry point
        ├── store/               # Storage (state, IO, cache, models)
        ├── commands/            # 16 command modules
        ├── export/              # 11 export format modules
        ├── import/              # 8 import modules + auto-detector
        ├── training/            # ML training pipeline
        ├── browser_automation/  # Chrome automation
        ├── p2p/                 # Iroh P2P networking
        ├── inference/           # ONNX + PyTorch inference
        └── utils/
```

---

## Architectural Principles

1. **JSON monolith** — Each project is a single `project.json` file. No database, no migrations.
2. **Cache + atomic flush** — In-memory HashMap for speed, atomic `.tmp` -> `rename` for safety.
3. **Optimistic UI** — Frontend updates instantly, backend syncs asynchronously.
4. **Handler pattern** — Each annotation tool is a self-contained class with `onMouseDown/Move/Up`.
5. **Service chain** — `Component -> Hook -> Service -> tauriDb -> invoke()`. No skipping layers.
6. **Bidirectional IPC** — `invoke()` for commands, `emit()` for notifications.
7. **Flexible data** — `serde_json::Value` for annotation data. No schema migrations needed.
8. **P2P as interceptor** — Permission checks on every command, transparent CRDT sync.
9. **Feature-based structure** — Each feature is an independent module with components, hooks, services, and store.

### Layer Diagram

```
TypeScript Types (db.ts)  <-->  Rust Structs (project_file.rs)
         |                              |
   Zustand Stores                 In-memory Cache
   (optimistic UI)              (HashMap + dirty flag)
         |                              |
    Service Layer                  with_project_mut
   (annotationService)            (atomic flush)
         |                              |
     tauriDb.ts ---- invoke() ----> Tauri Commands
                <--- events ------
         |                              |
   useTauriQuery                  P2P Sync (Iroh)
   (auto-refetch)               (CRDT + gossip)
```
