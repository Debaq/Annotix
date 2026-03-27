<p align="center">
  <img src="public/logo.png" alt="Annotix Logo" width="120" />
</p>

<h1 align="center">Annotix</h1>

<p align="center">
  <strong>Desktop annotation platform for Machine Learning datasets</strong><br/>
  Images &middot; Video &middot; Time Series &middot; Tabular Data
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-2.3.1-blue" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/tauri-2.x-orange" />
  <img alt="React 19" src="https://img.shields.io/badge/react-19-61DAFB" />
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.89+-DEA584" />
  <img alt="i18n" src="https://img.shields.io/badge/languages-10-purple" />
</p>

---

## Overview

Annotix is a cross-platform desktop application for creating, managing, and exporting annotated ML datasets. It pairs a React 19 frontend with a high-performance Rust backend through Tauri 2, delivering native speed with a modern UI.

Built for researchers, ML teams, and academic labs, Annotix covers the full pipeline: raw data import, collaborative annotation, integrated model training, and export to industry-standard formats.

### Highlights

- **7 annotation tools** on a high-performance 2D canvas (Konva)
- **Video annotation** with tracks, keyframes, and linear interpolation
- **Time series** support (univariate & multivariate) with 5 annotation types
- **Tabular data** editor with classical ML training (scikit-learn)
- **19 ML training backends** including YOLO, RT-DETR, MMDetection, Detectron2, timm, SMP, and more
- **4 execution modes**: local, downloadable package, cloud providers, and browser automation
- **Real-time P2P collaboration** via Iroh (QUIC) with no central server
- **11 export formats** and **8 import formats** with automatic detection
- **10 languages** with lazy loading
- **Fully customizable keyboard shortcuts**
- **Local JSON-based storage** with in-memory cache and atomic writes

---

## Table of Contents

- [Annotation Tools](#annotation-tools)
- [Video Annotation](#video-annotation)
- [Time Series](#time-series)
- [Tabular Data](#tabular-data)
- [Integrated ML Training](#integrated-ml-training)
- [Browser Automation](#browser-automation)
- [P2P Collaboration](#p2p-collaboration)
- [Export & Import](#export--import)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Languages](#languages)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [System Requirements](#system-requirements)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [License](#license)

---

## Annotation Tools

The annotation canvas is built on Konva with dedicated renderers and handlers per tool:

| Tool | Key | Description |
|------|-----|-------------|
| **BBox** | `B` | Rectangular bounding box with drag & resize |
| **OBB** | `O` | Oriented bounding box with free rotation |
| **Mask** | `M` | Freehand painting with configurable brush and eraser mode |
| **Polygon** | `P` | Point-by-point polygon with auto-close |
| **Keypoints** | `K` | Keypoints with skeleton presets (COCO, face, hand, MediaPipe) |
| **Landmarks** | `L` | Named reference points with labels |
| **Select** | `V` | Select, move, and edit existing annotations |
| **Pan** | `H` | Canvas navigation |

Additional canvas features:

- Mouse wheel zoom with floating controls
- Image rotation (`A` / `D`)
- Label and grid toggles
- Quick class selection with `1`-`0` and `Q`-`P` (up to 20 classes)
- Undo / Redo with 100-step history (`Ctrl+Z` / `Ctrl+Y`)

### Supported Project Types

**Images:** Object detection (bbox), oriented detection (obb), semantic segmentation (polygon/mask), instance segmentation, keypoints, landmarks, single-label & multi-label classification.

**Time Series:** Classification, forecasting, anomaly detection, segmentation, pattern recognition, event detection, regression, clustering, imputation.

**Tabular:** Classical ML on structured data.

---

## Video Annotation

Full frame-based video annotation system:

- **Frame extraction** via native FFmpeg with configurable FPS
- **Auto-resume** of interrupted extractions on app restart
- **Tracks** for following objects across the video, each with class and label
- **Keyframes** with bounding boxes at specific frames
- **Linear interpolation** automatically computes positions between keyframes
- **Bake** materializes interpolation into real per-frame annotations
- **Interactive timeline** with frame-by-frame navigation

---

## Time Series

Support for univariate and multivariate temporal data:

- **CSV import** with built-in parsing and validation
- **Interactive visualization** with zoom and pan
- **5 annotation types:**
  - `point` — mark at a timestamp
  - `range` — span between two timestamps
  - `classification` — global label for the series
  - `event` — event with type and confidence
  - `anomaly` — anomaly with score and threshold

---

## Tabular Data

- Built-in tabular data editor
- Column selector for features and target
- Data preview
- Training with scikit-learn (RandomForest, SVM, kNN, GradientBoosting, etc.)

---

## Integrated ML Training

Annotix ships with a complete training pipeline and real-time metrics monitoring across 19 ML backends.

### Backends by Task

#### Object Detection

| Backend | Models |
|---------|--------|
| **YOLO** (Ultralytics) | YOLOv8, v9, v10, v11, v12 |
| **RT-DETR** (Ultralytics) | RT-DETR-l, RT-DETR-x |
| **RF-DETR** (Roboflow) | RF-DETR-base, RF-DETR-large |
| **MMDetection** (OpenMMLab) | 30+ architectures (Faster R-CNN, DINO, Co-DETR, etc.) |

#### Semantic Segmentation

| Backend | Models |
|---------|--------|
| **SMP** | U-Net, DeepLabV3+, FPN, PSPNet, etc. |
| **HuggingFace Segmentation** | SegFormer, Mask2Former, etc. |
| **MMSegmentation** | Full OpenMMLab catalog |

#### Instance Segmentation

| Backend | Models |
|---------|--------|
| **Detectron2** (Meta) | Mask R-CNN, Cascade R-CNN, etc. |

#### Keypoints & Pose Estimation

| Backend | Models |
|---------|--------|
| **MMPose** | HRNet, ViTPose, RTMPose, etc. |

#### Oriented Object Detection (OBB)

| Backend | Models |
|---------|--------|
| **MMRotate** | Oriented R-CNN, RoI Transformer, etc. |

#### Image Classification

| Backend | Models |
|---------|--------|
| **timm** | 700+ models (ResNet, EfficientNet, ViT, ConvNeXt, etc.) |
| **HuggingFace Classification** | ViT, BEiT, DeiT, Swin, etc. |

#### Time Series

| Backend | Task |
|---------|------|
| **tsai** | Classification, regression, forecasting |
| **PyTorch Forecasting** | Forecasting (TFT, N-BEATS, etc.) |
| **PyOD** | Anomaly detection |
| **tslearn** | Temporal clustering |
| **PyPOTS** | Missing value imputation |
| **STUMPY** | Matrix Profile (motif/pattern discovery) |

#### Tabular

| Backend | Task |
|---------|------|
| **scikit-learn** | RandomForest, SVM, kNN, GradientBoosting, etc. |

### Execution Modes

| Mode | Description |
|------|-------------|
| **Local** | Isolated Python environment via micromamba with GPU auto-detection (CUDA / MPS) |
| **Download Package** | Generates a ZIP with script and data for external execution |
| **Cloud** | Train on cloud providers (Vertex AI, Kaggle, Lightning AI, HuggingFace, Saturn Cloud) |
| **Browser Automation** | Free training on Google Colab via browser automation |

### Training Presets

6 optimized presets for common scenarios: `small_objects`, `industrial`, `traffic`, `edge_mobile`, `medical`, `aerial`.

### Real-Time Metrics

Live charts for task-specific metrics: box/cls/dfl loss, precision, recall, mAP50, mAP50-95, IoU, dice, accuracy, F1, MAE, RMSE, AUC-ROC, silhouette score, R2, and more.

### Model Export

Supported formats: PyTorch (`.pt`), ONNX, TorchScript, TFLite, CoreML, TensorRT.

---

## Browser Automation

Automation system based on Chrome DevTools Protocol (CDP) that operates on the user's visible browser:

### Free Google Colab Training

- Auto-detects installed Chromium browsers
- Opens Google Colab, uploads the dataset, and runs training on a T4 GPU
- Real-time progress with pause / resume / cancel

### LLM Queries Without API Keys

Access language models through the user's browser:

- **Kimi** (Moonshot AI)
- **Qwen** (Alibaba)
- **DeepSeek**
- **HuggingChat** (HuggingFace)

---

## P2P Collaboration

Real-time collaborative annotation with no central server, powered by Iroh (QUIC protocol):

- **Create a session** as host or **join** as collaborator with a session code
- **Roles**: LeadResearcher (full control) and Annotator/DataCurator (configurable permissions)
- **Configurable permissions**: annotate, upload data, edit classes, delete, export, manage
- **Image locking** with automatic 3-minute TTL and renewal
- **Batch assignment** of images to collaborators
- **Real-time annotation sync** via CRDT (Conflict-free Replicated Data Type)
- **Peer list** with online status

---

## Export & Import

### Export Formats (11)

| Format | Description |
|--------|-------------|
| YOLO Detection | One `.txt` per image with normalized bounding boxes |
| YOLO Segmentation | One `.txt` per image with normalized polygons |
| COCO JSON | Single JSON with annotations, categories, and images |
| Pascal VOC | One XML per image (VOC2012 format) |
| CSV Detection | CSV with bounding boxes |
| CSV Classification | CSV with class labels |
| CSV Keypoints | CSV with keypoint coordinates |
| CSV Landmarks | CSV with landmark coordinates |
| Folders by Class | Images organized in folders by class name |
| U-Net Masks | Binary PNG masks for semantic segmentation |
| TIX | Native Annotix format (complete packaged project) |

All exports produce a ZIP file with real-time progress tracking.

### Import Formats (8)

| Format | Auto-Detection |
|--------|----------------|
| YOLO Detection / Segmentation | Yes |
| COCO JSON | Yes |
| Pascal VOC | Yes |
| CSV (4 variants) | Yes |
| U-Net Masks | Yes |
| Folders by Class | Yes |
| TIX (native) | Yes |

The automatic detector inspects the ZIP structure and assigns a confidence score to each format.

---

## Keyboard Shortcuts

All shortcuts are **fully customizable** from Settings with per-context conflict detection.

<details>
<summary><strong>Default shortcuts</strong></summary>

### Image Tools

| Shortcut | Action |
|----------|--------|
| `B` | Bounding Box |
| `O` | OBB |
| `M` | Mask |
| `P` | Polygon |
| `K` | Keypoints |
| `L` | Landmarks |
| `V` | Select |
| `H` | Pan |
| `[` / `]` | Decrease / Increase brush size |
| `E` | Toggle eraser |
| `A` / `D` | Rotate image |
| `Enter` | Confirm |
| `Esc` | Cancel |

### Navigation

| Shortcut | Action |
|----------|--------|
| `Left` / `Right` | Previous / Next image |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Zoom to fit |

### General

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Del` | Delete selection |

### Quick Class Selection

| Keys | Classes |
|------|---------|
| `1` - `0` | Classes 1 to 10 |
| `Q` - `P` | Classes 11 to 20 |

### Video

| Shortcut | Action |
|----------|--------|
| `T` | New track |
| `Left` / `Right` | Previous / Next frame |

### Time Series

| Shortcut | Action |
|----------|--------|
| `V` | Select |
| `P` | Point |
| `R` | Range |
| `E` | Event |
| `A` | Anomaly |

</details>

---

## Languages

Annotix is available in 10 languages with lazy loading and English fallback:

| Language | Code |
|----------|------|
| Deutsch | `de` |
| English | `en` |
| Espanol | `es` |
| Francais | `fr` |
| Italiano | `it` |
| Japanese | `ja` |
| Korean | `ko` |
| Portugues | `pt` |
| Russian | `ru` |
| Chinese | `zh` |

---

## Architecture

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

### Storage

All data is stored as JSON files and raw assets on disk. No database required.

```
~/.local/share/annotix/config.json        -> global configuration
{projects_dir}/{uuid}/project.json        -> full project (metadata + classes + annotations)
{projects_dir}/{uuid}/images/             -> original image files
{projects_dir}/{uuid}/thumbnails/         -> generated thumbnails
{projects_dir}/{uuid}/videos/             -> video files
{projects_dir}/{uuid}/models/             -> inference models
```

- In-memory cache (`HashMap<String, CachedProject>`) with dirty-flag tracking
- Atomic writes (`.tmp` file then `rename`)
- Access via `with_project(id, |pf| ...)` (read) and `with_project_mut(id, |pf| ...)` (write + auto-flush)

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
| Zustand | 5 | Global state with persistence |
| React Router | 7 | SPA routing |
| Konva | 10 | 2D annotation canvas |
| Chart.js | 4 | Metrics visualization |
| i18next | 24 | Internationalization |
| Lucide React | — | Icons |

### Backend (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2 | Desktop application framework |
| serde / serde_json | 1 | JSON serialization |
| image | 0.25 | Image processing |
| ffmpeg-the-third | 4 | Video frame extraction |
| zip | 2 | Export/import packaging |
| quick-xml | 0.37 | Pascal VOC XML |
| csv | 1.3 | CSV import/export |
| reqwest | 0.12 | HTTP client (cloud providers) |
| headless_chrome | 1.0 | Browser automation (CDP) |
| iroh | 0.96 | P2P networking (QUIC) |
| tokio | 1 | Async runtime |
| blake3 | 1 | Hashing |

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
| scikit-learn | Tabular ML |

---

## System Requirements

- **OS**: Windows 10+, macOS 12+, Linux (glibc 2.31+)
- **RAM**: 4 GB minimum, 8 GB recommended
- **Disk**: ~500 MB for the application + space for datasets
- **GPU** (optional): NVIDIA with CUDA or Apple Silicon with MPS for accelerated local training
- **FFmpeg**: required for video annotation (bundled in release builds)
- **Chromium browser** (optional): for browser automation (Chrome, Chromium, Brave, Edge)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.89
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Install & Run

```bash
# Clone the repository
git clone https://github.com/tecmedhub/annotix.git
cd annotix

# Install frontend dependencies
npm install

# Run in development mode (frontend hot-reload + Rust auto-rebuild)
npm run tauri:dev

# Build for production
npm run tauri:build
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Frontend only (Vite dev server) |
| `npm run build` | Build frontend (TypeScript check + Vite) |
| `npm run tauri:dev` | Full development (frontend + Rust backend) |
| `npm run tauri:build` | Production build with platform-specific installers |
| `npm run lint` | ESLint with zero warnings policy |
| `npm run preview` | Preview the built frontend |

---

## Project Structure

```
annotix/
├── package.json                 # Frontend dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite bundler config
├── tailwind.config.js           # Tailwind CSS config
├── components.json              # shadcn/ui config
├── ARCHITECTURE.md              # Detailed architecture documentation
├── DOCS/                        # Technical reference docs
├── public/
│   ├── logo.png
│   └── locales/                 # 10 language files (JSON)
├── src/                         # React frontend
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Router and providers
│   ├── lib/
│   │   ├── db.ts                # Type definitions (mirrors Rust structs)
│   │   ├── tauriDb.ts           # Centralized Tauri invoke bridge
│   │   └── i18n.ts              # i18next configuration
│   ├── hooks/                   # Global hooks
│   ├── components/ui/           # shadcn/ui components
│   └── features/
│       ├── core/                # Layout, shortcuts, global UI state
│       ├── projects/            # Project CRUD
│       ├── gallery/             # Image gallery and class management
│       ├── canvas/              # Annotation canvas (7 tools)
│       │   ├── handlers/        # BBox, OBB, Mask, Polygon, Keypoints, Landmarks
│       │   ├── renderers/       # Visual renderers per annotation type
│       │   ├── hooks/           # useAnnotations, canvas state
│       │   └── services/        # annotationService
│       ├── classification/      # Image classification
│       ├── video/               # Video annotation
│       ├── timeseries/          # Time series visualization and annotation
│       ├── tabular/             # Tabular data editor
│       ├── training/            # ML training panel
│       ├── export/              # Export UI (11 formats)
│       ├── import/              # Import UI (8 formats)
│       ├── inference/           # Model inference
│       ├── settings/            # App settings and Python environment
│       ├── browser-automation/  # Chrome automation UI
│       ├── p2p/                 # P2P collaboration
│       └── setup/               # Initial setup screen
└── src-tauri/                   # Rust backend
    ├── Cargo.toml               # Rust dependencies
    ├── tauri.conf.json          # Tauri app configuration
    └── src/
        ├── lib.rs               # 137+ Tauri command registrations
        ├── store/               # Storage layer (state, IO, cache)
        ├── commands/            # 16 command modules
        ├── export/              # 11 export format modules
        ├── import/              # 8 import format modules + auto-detector
        ├── training/            # Multi-backend ML training pipeline
        ├── browser_automation/  # Headless Chrome automation
        ├── p2p/                 # P2P networking with Iroh
        ├── inference/           # ONNX model inference
        └── utils/
```

---

## Application Routes

| Route | View |
|-------|------|
| `/` | Project list |
| `/projects/:id` | Image gallery + class management |
| `/projects/:id/images/:imageId` | Annotation canvas |
| `/projects/:id/timeseries/:tsId` | Time series visualization and annotation |
| `/projects/:id/videos/:videoId` | Video annotation with timeline |
| `/settings` | Application settings |

The initial setup screen is shown automatically if no projects directory has been configured.

---

## License

MIT License — [TecMedHub](https://github.com/tecmedhub), Universidad Austral de Chile, Campus Puerto Montt.
