# Getting Started

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Windows 10, macOS 12, Linux (glibc 2.31+) | Latest stable |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 500 MB (app) + dataset space | SSD recommended |
| **GPU** | — | NVIDIA with CUDA or Apple Silicon (MPS) |
| **FFmpeg** | Required for video annotation | Bundled in release builds |
| **Chromium** | Optional (browser automation) | Chrome, Brave, Edge, or Chromium |

## Prerequisites for Development

1. **[Node.js](https://nodejs.org/) >= 18**
2. **[Rust](https://rustup.rs/) >= 1.89**
3. **Tauri 2 system dependencies** — follow the official guide for your platform:
   - [Tauri 2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Linux-specific packages

```bash
# Ubuntu / Debian
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf pkg-config

# Fedora
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel
```

### Windows-specific

- Visual Studio Build Tools (or full Visual Studio) with MSVC
- WebView2 (pre-installed on Windows 11, available for Windows 10)

### macOS-specific

```bash
xcode-select --install
```

## Installation

```bash
# Clone the repository
git clone https://github.com/tecmedhub/annotix.git
cd annotix

# Install frontend dependencies
npm install
```

## Development

```bash
# Full development mode (React hot-reload + Rust auto-rebuild)
npm run tauri:dev

# Frontend only (Vite dev server on port 5173)
npm run dev
```

When running `tauri:dev`, the Rust backend compiles on first launch (this takes a few minutes). Subsequent rebuilds are incremental and much faster.

## Production Build

```bash
npm run tauri:build
```

Build outputs by platform:

| Platform | Output |
|----------|--------|
| **Linux** | AppImage + raw binary in `src-tauri/target/release/bundle/` |
| **Windows** | NSIS installer (`.exe`) + MSI in `src-tauri/target/release/bundle/` |
| **macOS** | `.app` bundle + DMG in `src-tauri/target/release/bundle/` |

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Frontend only (Vite dev server) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run tauri:dev` | Full development with Rust backend |
| `npm run tauri:build` | Production build with platform-specific installers |
| `npm run lint` | ESLint with zero-warnings policy |
| `npm run preview` | Preview the built frontend |

## First Run

1. Launch Annotix.
2. The **setup screen** appears automatically on first run, asking you to choose a directory where projects will be stored.
3. Choose a directory (e.g. `~/annotix-projects`). This is saved to `~/.local/share/annotix/config.json`.
4. You're ready to create your first project.

## Creating Your First Project

1. Click **New Project** on the project list screen.
2. Enter a name and select a **project type** (e.g. `bbox` for object detection).
3. Define your **classes** (e.g. "car", "person") with colors.
4. Upload images via drag-and-drop or the upload button.
5. Click an image to open the annotation canvas and start drawing.

## Project Types

### Images

| Type | Use Case |
|------|----------|
| `bbox` | Object detection with rectangular bounding boxes |
| `obb` | Oriented/rotated bounding box detection |
| `polygon` | Semantic segmentation with polygons |
| `mask` | Semantic segmentation with freehand painting |
| `instance-segmentation` | Instance segmentation (mask + polygon) |
| `keypoints` | Pose estimation with skeleton presets |
| `landmarks` | Named reference points |
| `classification` | Single-label image classification |
| `multi-label-classification` | Multi-label image classification |

### Time Series

| Type | Use Case |
|------|----------|
| `timeseries-classification` | Classify entire series |
| `timeseries-forecasting` | Predict future values |
| `anomaly-detection` | Detect anomalous points/ranges |
| `timeseries-segmentation` | Segment temporal regions |
| `pattern-recognition` | Find recurring patterns |
| `event-detection` | Mark discrete events |
| `timeseries-regression` | Continuous value prediction |
| `clustering` | Group similar series |
| `imputation` | Fill missing values |

### Other

| Type | Use Case |
|------|----------|
| `tabular` | Classical ML on structured data |

## Application Routes

| Route | View |
|-------|------|
| `/` | Project list |
| `/projects/:id` | Image gallery + class management |
| `/projects/:id/images/:imageId` | Annotation canvas |
| `/projects/:id/timeseries/:tsId` | Time series annotation |
| `/projects/:id/videos/:videoId` | Video annotation with timeline |
| `/settings` | Application settings |

## Storage Layout

All data is stored as JSON files and raw assets on disk. No database.

```
~/.local/share/annotix/
  config.json                          -> global config (projects_dir path)

{projects_dir}/{uuid}/
  project.json                         -> full project (metadata, classes, annotations)
  images/{uuid}_{filename}             -> original images
  thumbnails/{id}.jpg                  -> generated thumbnails
  videos/{uuid}_{filename}             -> video files
  models/{uuid}_{filename}             -> inference models
```

## Next Steps

- [[Annotation Tools]] — Learn all 7 annotation tools in detail.
- [[Integrated ML Training]] — Set up your Python environment and train models.
- [[P2P Collaboration]] — Collaborate with your team in real-time.
