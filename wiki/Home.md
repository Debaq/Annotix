<p align="center">
  <img src="https://raw.githubusercontent.com/tecmedhub/annotix/main/public/logo.png" alt="Annotix Logo" width="120" />
</p>

<h1 align="center">Annotix Wiki</h1>

<p align="center">
  <strong>Desktop annotation platform for Machine Learning datasets</strong><br/>
  Images &middot; Video &middot; Time Series &middot; Tabular Data
</p>

---

Welcome to the Annotix documentation. Annotix is a cross-platform desktop application for creating, managing, and exporting annotated ML datasets. It pairs a React 19 frontend with a high-performance Rust backend through Tauri 2.

## Quick Navigation

### Getting Started
- **[[Getting Started]]** — Installation, prerequisites, first run, and development setup.

### Annotation
- **[[Annotation Tools]]** — The 7 canvas tools (BBox, OBB, Polygon, Mask, Keypoints, Landmarks, Select), zoom, pan, class selection, undo/redo, and image adjustments.
- **[[Video Annotation]]** — Frame extraction, tracks, keyframes, interpolation, bake, and timeline controls.
- **[[Time Series]]** — CSV import, visualization, and the 5 annotation types (point, range, classification, event, anomaly).
- **[[Tabular Data]]** — Data editor, column selection, and classical ML training.

### ML Pipeline
- **[[Integrated ML Training]]** — 19 ML backends, 4 execution modes, presets, real-time metrics, cloud providers, and model export.
- **[[Inference]]** — ONNX and PyTorch model inference, batch processing, NMS, and confidence thresholds.
- **[[Export and Import]]** — 11 export formats, 8 import formats with auto-detection, coordinate systems, and file structures.

### Collaboration & Automation
- **[[P2P Collaboration]]** — Real-time annotation with Iroh (QUIC), roles, permissions, image locking, work distribution, and CRDT sync.
- **[[Browser Automation]]** — Free Google Colab training and LLM queries without API keys via Chrome DevTools Protocol.

### Reference
- **[[Keyboard Shortcuts]]** — Full shortcut reference, customization system, and conflict detection.
- **[[Languages]]** — 10 supported languages with lazy loading.
- **[[Architecture]]** — Storage model, IPC layer, state management, handler pattern, and project structure.

---

## At a Glance

| Feature | Details |
|---------|---------|
| **Annotation Tools** | 7 tools on high-performance Konva canvas |
| **Data Types** | Images, Video, Time Series, Tabular |
| **ML Backends** | 19 (YOLO, RT-DETR, MMDetection, Detectron2, timm, SMP, etc.) |
| **Execution Modes** | Local, Download Package, Cloud, Browser Automation |
| **Export Formats** | 11 with real-time progress |
| **Import Formats** | 8 with automatic format detection |
| **P2P Collaboration** | Iroh QUIC, no central server |
| **Languages** | 10 (de, en, es, fr, it, ja, ko, pt, ru, zh) |
| **Platforms** | Windows, macOS, Linux |
| **Tech Stack** | React 19 + Rust + Tauri 2 |
| **Version** | 2.3.1 |
