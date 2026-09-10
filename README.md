<p align="center">
  <img src="public/logo.png" alt="Annotix Logo" width="140" />
</p>

<h1 align="center">Annotix</h1>

<p align="center">
  <strong>Open-source desktop platform for ML dataset annotation, training, and collaboration</strong><br/>
  Images &middot; Video &middot; Audio &middot; Time Series &middot; Tabular Data
</p>

<p align="center">
  <a href="https://github.com/Debaq/Annotix/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/Debaq/Annotix?style=flat-square&color=blue" /></a>
  <a href="https://github.com/Debaq/Annotix/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/Debaq/Annotix/total?style=flat-square&color=brightgreen" /></a>
  <a href="https://github.com/Debaq/Annotix/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Debaq/Annotix?style=flat-square" /></a>
  <a href="https://github.com/Debaq/Annotix/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" />
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/tauri-2.x-orange?style=flat-square" />
  <img alt="React 19" src="https://img.shields.io/badge/react-19-61DAFB?style=flat-square" />
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.89+-DEA584?style=flat-square" />
  <img alt="i18n" src="https://img.shields.io/badge/languages-10-purple?style=flat-square" />
  <img alt="ML Backends" src="https://img.shields.io/badge/ML%20backends-19-red?style=flat-square" />
  <img alt="SAM" src="https://img.shields.io/badge/SAM-assisted%20segmentation-8A2BE2?style=flat-square" />
</p>

<p align="center">
  <a href="https://github.com/Debaq/Annotix/releases/latest"><strong>Download</strong></a> &nbsp;&bull;&nbsp;
  <a href="https://www.preprints.org/manuscript/202604.0919"><strong>Read the Paper</strong></a> &nbsp;&bull;&nbsp;
  <a href="#getting-started"><strong>Build from Source</strong></a> &nbsp;&bull;&nbsp;
  <a href="#citation"><strong>Cite</strong></a>
</p>

---

## Paper

> **Annotix: An Open-Source Desktop Platform for Comprehensive Machine Learning Dataset Annotation**
>
> Published on [Preprints.org](https://www.preprints.org/manuscript/202604.0919) (April 2026)
>
> Universidad Austral de Chile, Campus Puerto Montt &mdash; [TecMedHub](https://github.com/tecmedhub)

If you use Annotix in your research, please [cite the paper](#citation).

---

## Why Annotix?

Most annotation tools focus on a single data type or require cloud accounts. Annotix is different:

| | Annotix | Cloud tools (CVAT, Label Studio) | Desktop tools (labelImg, LabelMe) |
|---|:---:|:---:|:---:|
| **Runs fully offline** | Yes | No | Yes |
| **Images + Video + Audio + Time Series + Tabular** | Yes | Partial | No |
| **SAM-assisted segmentation (local ONNX)** | Yes | Partial | No |
| **Integrated ML training (19 backends)** | Yes | No | No |
| **P2P collaboration (no server)** | Yes | Server required | No |
| **LAN sharing via browser (no install)** | Yes | Server required | No |
| **Free GPU training (Colab automation)** | Yes | No | No |
| **Export to 17 formats** | Yes | Yes | Limited |
| **Cross-platform native app** | Yes | Browser | Partial |

---

## Status

> Last updated: June 2026 &mdash; v2.9.10

| Feature | Status | Notes |
|---------|--------|-------|
| **Image annotation** (7 tools) | :white_check_mark: Stable | BBox, OBB, Mask, Polygon, Keypoints, Landmarks, Pan |
| **SAM assist** | :white_check_mark: Stable | Local ONNX encoder/decoder, AMG candidates, click-refine, app-level model store |
| **Video annotation** | :white_check_mark: Stable | Tracks, keyframes, interpolation, bake |
| **Audio annotation** | :white_check_mark: Stable | Waveform UI, classification, ASR transcription, sound events, TTS recording |
| **Time series annotation** | :white_check_mark: Stable | 5 annotation types, Chart.js canvas |
| **Tabular ML** | :white_check_mark: Stable | scikit-learn integration, column selector |
| **ONNX inference** | :white_check_mark: Stable | Auto-detects YOLOv5-v12, DETR, SSD, classification; opt-in TensorRT/CUDA/DirectML/CoreML EPs |
| **Export** (17 formats) | :white_check_mark: Stable | YOLO, COCO, VOC, CSV, U-Net, TIX, rasterized previews, audio formats |
| **Import** (8 formats) | :white_check_mark: Stable | Auto-detection with confidence scoring; PDF pages as images |
| **Local ML training** (19 backends) | :white_check_mark: Stable | Isolated Python env, GPU auto-detection, live metrics, PDF report |
| **Cloud training** (7 providers) | :white_check_mark: Stable | Vertex AI, Kaggle, Lightning AI, HuggingFace, Saturn Cloud, Colab Enterprise |
| **Browser automation** (Colab free) | :white_check_mark: Stable | T4 GPU, real-time progress |
| **Network sharing** (serve) | :white_check_mark: Stable | HTTP server on LAN with bearer-token auth, browser annotation UI |
| **Annotation inspector & filters** | :white_check_mark: Stable | Per-class/per-image filters, cross-project comparison |
| **Keyboard shortcuts** | :white_check_mark: Stable | Fully customizable, conflict detection |
| **i18n** (10 languages) | :white_check_mark: Stable | 47 namespaces, lazy loading, English fallback |
| **P2P collaboration** | :construction: Beta | Live image/mark sync works; no auto-reconnection on network drop; last-write-wins conflicts; video frames excluded |
| **Audio import** | :construction: In progress | Export implemented (HF ASR, LJSpeech, CSV); import not yet available |
| **Audio training backends** | :construction: Not implemented | Audio projects annotate & export only; train externally |
| **SAM model auto-download** | :construction: In progress | Manual upload works; HuggingFace presets (MobileSAM / ViT-B / SAM2) pending |
| **LLM chat via browser** | :construction: Beta | Kimi, Qwen, DeepSeek, HuggingChat; generic runner works, provider modules partially wired |
| **macOS build** | :warning: Not tested | No CI for macOS; should build from source but untested |

:white_check_mark: = production-ready &nbsp;&middot;&nbsp; :construction: = usable but incomplete &nbsp;&middot;&nbsp; :warning: = known limitation

---

## Download

Pre-built binaries for the latest release:

| Platform | Download |
|----------|----------|
| **Windows** (x64) | [`.exe` installer](https://github.com/Debaq/Annotix/releases/latest) &nbsp;\|&nbsp; [`.msi`](https://github.com/Debaq/Annotix/releases/latest) |
| **Linux** (x64) | [`.tar.gz`](https://github.com/Debaq/Annotix/releases/latest) (portable binary + libs + installer script) |
| **macOS** | Build from source (see [Getting Started](#getting-started)) |

Linux packaging is a self-contained tarball (`annotix-v<version>-linux-x86_64.tar.gz`) with the
binary, `libpdfium.so` and a `run.sh` launcher &mdash; no `.deb`/`.rpm`/AppImage. It needs
`libwebkit2gtk-4.1-0`, `libgtk-3-0` and `librsvg2-2` on the system, and can register itself as a
desktop entry. Windows installers bundle FFmpeg DLLs and pdfium.

> All releases: [github.com/Debaq/Annotix/releases](https://github.com/Debaq/Annotix/releases)

The app checks GitHub for new releases and shows an in-app update banner with a dynamic changelog.

---

## Features at a Glance

### Annotation Tools

7 tools on a high-performance Konva canvas:

| Tool | Key | Description |
|------|-----|-------------|
| **BBox** | `B` | Rectangular bounding box with drag & resize |
| **OBB** | `O` | Oriented bounding box with free rotation |
| **Mask** | `M` | Freehand painting with configurable brush and eraser |
| **Polygon** | `P` | Point-by-point polygon with auto-close |
| **Keypoints** | `K` | Skeleton presets (COCO, face, hand, MediaPipe) |
| **Landmarks** | `L` | Named reference points with labels |
| **Pan** | `H` | Canvas navigation |

Plus: mouse wheel zoom, image rotation, label/grid toggles, per-annotation visibility, draggable
floating panels persisted per project, quick class selection (`1`-`0`, `Q`-`P` for up to 20 classes),
and undo/redo with 100-step history.

### SAM-Assisted Segmentation

Segment Anything runs **locally via ONNX** &mdash; no cloud, no API key.

- **AMG mode**: generates 20&ndash;200 candidate masks; click a mask + press a class key to
  convert it into the active tool's format (BBox / OBB / Mask / Polygon)
- **Refine mode**: click-by-click positive/negative prompts on a cached image embedding
- Frontend sliders (granularity, score, NMS, overlap) re-filter candidates without re-running AMG
- Encoder/decoder models are stored **app-level** (`{data_dir}/sam_models/`), shared across projects
- Candidates are ephemeral &mdash; never written to `project.json`

### Project Types

- **Images** &mdash; Object detection, oriented detection, semantic/instance segmentation, keypoints, landmarks, single & multi-label classification
- **Video** &mdash; Frame extraction (FFmpeg), tracks with keyframes, linear interpolation, bake to per-frame annotations
- **Audio** &mdash; Classification, speech recognition (transcription), sound event detection, TTS recording with phonetic-coverage analysis
- **Time Series** &mdash; Univariate & multivariate CSV, 5 annotation types (point, range, classification, event, anomaly)
- **Tabular** &mdash; Built-in editor with column selection and scikit-learn training

Images can also be ingested from **PDF** documents (pages rasterized natively with pdfium) and
stored as **WebP** per project.

### Integrated ML Training (19 Backends)

Train models directly from the app with real-time metrics charts, a training monitor with
suggestions ("coach"), free-text observations, and an exportable **PDF training report**.

<details>
<summary><strong>Full backend list</strong></summary>

#### Object Detection
| Backend | Models |
|---------|--------|
| **YOLO** (Ultralytics) | YOLO26, YOLOv8&ndash;v12 |
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

#### Keypoints & Pose
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
| **PyTorch Forecasting** | TFT, N-BEATS, etc. |
| **PyOD** | Anomaly detection |
| **tslearn** | Temporal clustering |
| **PyPOTS** | Missing value imputation |
| **STUMPY** | Matrix Profile (motif/pattern discovery) |

#### Tabular
| Backend | Task |
|---------|------|
| **scikit-learn** | RandomForest, SVM, kNN, GradientBoosting, etc. |

</details>

**4 execution modes:**

| Mode | Description |
|------|-------------|
| **Local** | Isolated Python env via micromamba, GPU auto-detection (CUDA / MPS) |
| **Download Package** | ZIP with script + data for external execution |
| **Cloud** | Vertex AI, Kaggle, Lightning AI, HuggingFace, Saturn Cloud |
| **Browser Automation** | Free T4 GPU on Google Colab via CDP automation |

6 training presets: `small_objects`, `industrial`, `traffic`, `edge_mobile`, `medical`, `aerial`.

Model export: PyTorch `.pt`, ONNX, TorchScript, TFLite, CoreML, TensorRT.

### Inference

Run trained or third-party ONNX models over a whole project:

- Auto-detection of architecture and metadata (classes, input size, `nc`/`names`)
- Batch inference with cancel, per-prediction accept/reject, conversion to annotations
- Model archives can be dropped in directly (ZIP extraction + drag & drop import)
- Execution providers are **opt-in** (TensorRT, CUDA, DirectML, CoreML); CPU path uses SIMD
  preprocessing and a parallel pipeline

### P2P Collaboration

Real-time collaborative annotation powered by [Iroh](https://iroh.computer/) (QUIC). No central server.

- Host or join with a session code (encrypted host secret)
- Roles: LeadResearcher (full control) / Annotator / DataCurator (configurable permissions)
- Image locking with 3-min TTL, batch assignment, live image/mark sync with author attribution
- Peer list with online status

### Network Sharing (Serve)

Publish a project over the LAN as an HTTP server with a **bearer-token** protected web UI &mdash;
collaborators annotate from a browser with no install. Optional auto-save.

### Browser Automation

Train on **Google Colab for free** (T4 GPU) via Chrome DevTools Protocol:
- Auto-detects Chromium browsers, uploads dataset, runs training
- Real-time progress with pause / resume / cancel

Query LLMs without API keys through the user's browser: Kimi, Qwen, DeepSeek, HuggingChat.

### Export & Import

**17 export formats:** YOLO Detection, YOLO Segmentation, COCO JSON, Pascal VOC,
CSV (Detection / Classification / Keypoints / Landmarks), Folders by Class, U-Net Masks,
TIX (native), rasterized preview (with and without labels), HuggingFace ASR, LJSpeech,
CSV Audio Classification, CSV Sound Events.

**8 import formats** with automatic detection: YOLO (detection & segmentation), COCO, Pascal VOC,
CSV (4 variants), U-Net Masks, Folders by Class, TIX. Multiple `.tix` files can be **merged**,
homogenizing class sets.

### Inspector & Filters

Annotation inspector reachable from the project gallery, with debug/observation filters over marks,
classes and gallery, per-class counters, and multi-project comparison.

### Keyboard Shortcuts

All shortcuts are **fully customizable** from Settings with per-context conflict detection.

<details>
<summary><strong>Default shortcuts</strong></summary>

#### Image Tools
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
| `Enter` | Confirm drawing |
| `Esc` | Cancel drawing |

SAM assist is toggled from the canvas toolbar; while active, `Tab` cycles candidates,
`Esc` exits refine mode and the class keys accept the hovered mask.

#### Navigation
| Shortcut | Action |
|----------|--------|
| `PageUp` / `PageDown` | Previous / Next sample |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Zoom to fit |

#### General
| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Del` / `Backspace` | Delete selection |
| `Esc` | Deselect |

#### Quick Class Selection
| Keys | Classes |
|------|---------|
| `1` - `0` | Classes 1 to 10 |
| `Q` - `P` | Classes 11 to 20 |

#### Video
| Shortcut | Action |
|----------|--------|
| `T` | New track |

#### Time Series
| Shortcut | Action |
|----------|--------|
| `V` | Select |
| `P` | Point |
| `R` | Range |
| `E` | Event |
| `A` | Anomaly |

#### Audio
| Shortcut | Action |
|----------|--------|
| `F2` | Play / Pause |
| `F3` / `F4` | Replay / Rewind |
| `Left` / `Right` | Scrub |
| `Enter` | Split |
| `Tab` | Save & next |

#### TTS Recording
| Shortcut | Action |
|----------|--------|
| `Space` | Record |
| `Enter` | Accept take |
| `R` | Repeat |
| `S` | Skip sentence |

</details>

### Languages

10 languages across 47 namespaces, with lazy loading and English fallback:

`de` Deutsch &middot; `en` English &middot; `es` Espanol &middot; `fr` Francais &middot; `it` Italiano &middot; `ja` Japanese &middot; `ko` Korean &middot; `pt` Portugues &middot; `ru` Russian &middot; `zh` Chinese

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
|             194 registered commands                   |
+-----------------------------------------------------+
|                  Backend (Rust)                       |
|   +------------+ +-----------+ +-----------------+   |
|   |   Store    | | Commands  | | Export/Import   |   |
|   | (JSON+RAM) | | (24 mod)  | | (17+8 formats)  |   |
|   +------------+ +-----------+ +-----------------+   |
|   +------------+ +-----------+ +-----------------+   |
|   |  Training  | | Browser   | | P2P (Iroh)      |   |
|   | (19 backs) | | Automat.  | | QUIC mesh       |   |
|   +------------+ +-----------+ +-----------------+   |
|   +------------+ +-----------+ +-----------------+   |
|   | Inference  | |    SAM    | | Serve (axum)    |   |
|   | (ONNX/ort) | | enc/dec   | | LAN web UI      |   |
|   +------------+ +-----------+ +-----------------+   |
+-----------------------------------------------------+
|               External Integrations                   |
|   Python (micromamba) . FFmpeg . pdfium . Chromium    |
|   Cloud APIs . Iroh P2P network                      |
+-----------------------------------------------------+
```

### Storage

All data stored as JSON + raw assets on disk. No database.

```
~/.local/share/annotix/config.json        -> global configuration
~/.local/share/annotix/sam_models/        -> SAM encoder/decoder ONNX (app-level)
{projects_dir}/{uuid}/project.json        -> project (metadata + classes + annotations)
{projects_dir}/{uuid}/images/             -> original images
{projects_dir}/{uuid}/thumbnails/         -> generated thumbnails
{projects_dir}/{uuid}/videos/             -> video files
{projects_dir}/{uuid}/audio/              -> audio files
{projects_dir}/{uuid}/models/             -> trained models
```

In-memory cache with dirty-flag tracking, atomic writes (`.tmp` + `rename`).

---

## Tech Stack

<details>
<summary><strong>Frontend</strong></summary>

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| TypeScript | 5.7 | Static typing |
| Vite | 6 | Bundler and dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| shadcn/ui | &mdash; | Component library (Radix UI) |
| Zustand | 5 | Global state with persistence |
| React Router | 7 | SPA routing |
| Konva | 10 | 2D annotation canvas |
| Chart.js | 4 | Metrics visualization |
| jsPDF / html2canvas | 4 / 1.4 | Training report PDF |
| TanStack Virtual | 3 | Virtualized gallery |
| i18next | 24 | Internationalization |

</details>

<details>
<summary><strong>Backend (Rust)</strong></summary>

| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2 | Desktop application framework |
| serde / serde_json | 1 | JSON serialization |
| image / imageproc | 0.25 | Image processing |
| fast_image_resize | 5 | SIMD resizing |
| rayon | 1.10 | Data parallelism |
| geo | 0.29 | Polygon simplification |
| webp | 0.3 | WebP encoding |
| ort | 2.0-rc | ONNX Runtime (inference + SAM) |
| ffmpeg-the-third | 4.1 | Video frame extraction |
| pdfium-render | 0.8 | PDF page rasterization |
| zip | 2 | Export/import packaging |
| quick-xml | 0.37 | Pascal VOC XML |
| csv | 1.3 | CSV import/export |
| reqwest | 0.12 | HTTP client (cloud providers) |
| jsonwebtoken | 9 | GCP service-account auth |
| axum | 0.8 | LAN serve HTTP server |
| chacha20poly1305 / subtle | 0.10 / 2 | Session secret encryption |
| headless_chrome | 1.0 | Browser automation (CDP) |
| iroh + blobs/gossip/docs | 0.96&ndash;0.98 | P2P networking (QUIC) |
| tokio | 1 | Async runtime |
| blake3 | 1 | Hashing |

</details>

<details>
<summary><strong>Python (via micromamba)</strong></summary>

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

</details>

---

## System Requirements

- **OS**: Windows 10+, macOS 12+, Linux (glibc 2.31+)
- **RAM**: 4 GB minimum, 8 GB recommended
- **Disk**: ~500 MB for the app + space for datasets
- **GPU** (optional): NVIDIA with CUDA or Apple Silicon with MPS for accelerated training
- **FFmpeg**: required for video annotation (bundled in release builds)
- **Chromium browser** (optional): for browser automation (Chrome, Brave, Edge)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18 (CI uses Node 24)
- [pnpm](https://pnpm.io/) (the repo ships `pnpm-lock.yaml`)
- [Rust](https://rustup.rs/) >= 1.89
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Build & Run

```bash
git clone https://github.com/Debaq/Annotix.git
cd Annotix
pnpm install
pnpm tauri:dev       # development (hot-reload)
pnpm tauri:build     # production build
```

### Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Frontend only (Vite dev server) |
| `pnpm build` | Build frontend (TypeScript check + Vite) |
| `pnpm tauri:dev` | Full dev (frontend + Rust backend) |
| `pnpm tauri:build` | Production build with installers |
| `pnpm lint` | ESLint (flat config) |

CI runs `cargo fmt`/`clippy`, `cargo nextest` and the frontend build on every push.

---

## Project Structure

```
annotix/
├── src/                         # React frontend (~46k LOC)
│   ├── App.tsx                  # Router and providers
│   ├── lib/
│   │   ├── db.ts                # Type definitions (mirrors Rust structs)
│   │   ├── tauriDb.ts           # Centralized Tauri invoke bridge
│   │   └── i18n.ts              # i18next configuration
│   ├── components/ui/           # shadcn/ui components
│   └── features/
│       ├── canvas/              # Annotation canvas (7 tools)
│       ├── sam/                 # SAM assist (overlay, panel, store)
│       ├── gallery/             # Virtualized gallery + filters
│       ├── video/               # Video annotation
│       ├── audio/               # Audio annotation + TTS recording
│       ├── timeseries/          # Time series annotation
│       ├── tabular/             # Tabular data editor
│       ├── classification/      # Classification workflow
│       ├── training/            # ML training panel + monitor + PDF report
│       ├── export/              # 17 export formats
│       ├── import/              # 8 import formats
│       ├── inference/           # Model inference
│       ├── p2p/                 # P2P collaboration
│       ├── serve/               # LAN sharing dialog
│       ├── browser-automation/  # Chrome automation
│       ├── setup/               # First-run setup
│       └── settings/            # App settings
├── src-tauri/                   # Rust backend (~41k LOC)
│   └── src/
│       ├── lib.rs               # 194 Tauri command registrations
│       ├── store/               # Storage layer (state, IO, cache)
│       ├── commands/            # 24 command modules
│       ├── export/              # Export format modules
│       ├── import/              # Import + auto-detector + merge
│       ├── training/            # Multi-backend ML pipeline + cloud providers
│       ├── browser_automation/  # Headless Chrome (Colab, LLM chat)
│       ├── p2p/                 # Iroh P2P networking
│       ├── serve/               # axum LAN server + web UI
│       └── inference/           # ONNX inference + SAM (encoder/decoder/AMG)
├── docs/                        # Roadmaps and backend references
├── wiki/                        # User documentation
└── public/locales/              # 10 languages x 47 namespaces
```

---

## Citation

If you use Annotix in your research, please cite:

```bibtex
@article{annotix2026,
  title     = {Annotix: An Open-Source Desktop Platform for Comprehensive Machine Learning Dataset Annotation},
  year      = {2026},
  publisher = {Preprints.org},
  url       = {https://www.preprints.org/manuscript/202604.0919}
}
```

> Full paper: [https://www.preprints.org/manuscript/202604.0919](https://www.preprints.org/manuscript/202604.0919)

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

---

## License

MIT License &mdash; [TecMedHub](https://github.com/tecmedhub), Universidad Austral de Chile, Campus Puerto Montt.
