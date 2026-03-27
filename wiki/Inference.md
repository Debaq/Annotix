# Inference

Annotix can run trained ML models on your images directly within the application. It supports both ONNX (native Rust execution) and PyTorch (`.pt`) models.

## Overview

The inference system:

1. Loads a trained model (uploaded to the project).
2. Runs predictions on selected images (single or batch).
3. Displays predictions as AI annotations with confidence scores.
4. Lets you accept, reject, or edit predictions.

---

## Supported Model Formats

| Format | Extension | Execution |
|--------|-----------|-----------|
| **ONNX** | `.onnx` | Native Rust via `ort` crate (fast) |
| **PyTorch** | `.pt` | Python subprocess via ultralytics |

ONNX models run natively without Python and are recommended for speed.

---

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `confidence_threshold` | 0.5 | Minimum confidence to keep a prediction |
| `iou_threshold` | 0.45 | NMS IoU threshold for overlapping boxes |
| `input_size` | 640 | Model input resolution |
| `device` | `cpu` | `"cpu"`, `"0"` (CUDA GPU 0), `"cuda:0"`, or `"mps"` |

---

## ONNX Inference Pipeline

The native ONNX runner processes images entirely in Rust:

### Pipeline

1. **Load model** — `Session::from_file()` creates a reusable ONNX session.
2. **Load image** — `image::open()` reads and resizes the image to `input_size`.
3. **Preprocess** — Convert RGB to NCHW float32 tensor normalized to [0, 1].
4. **Forward pass** — Run the model on the input tensor.
5. **Parse output** — Extract detections from the output tensor.
6. **NMS** — Apply Non-Maximum Suppression per class.

### Input Tensor

- **Shape:** `[1, 3, input_size, input_size]` (batch, channels, height, width)
- **Values:** float32, normalized [0.0, 1.0]
- **Color order:** RGB

### Output Parsing

The runner auto-detects the output tensor orientation:

| Orientation | Shape | Condition |
|-------------|-------|-----------|
| **Transposed** | `[batch, features, anchors]` | shape[1] < shape[2] and shape[1] >= 5 |
| **Standard** | `[batch, anchors, features]` | shape[2] >= 5 |

**Features per detection:** `[x, y, width, height, score_class_0, score_class_1, ...]`

- Automatically detects if scores are logits (> 1.0) or probabilities.
- Applies sigmoid to logits if needed.

### NMS (Non-Maximum Suppression)

Applied per-class to remove overlapping detections:

1. Sort detections by confidence (descending).
2. For each detection, compute IoU with all lower-confidence detections of the same class.
3. Remove detections with IoU above `iou_threshold`.

---

## PyTorch Inference

For `.pt` models, Annotix generates a Python script and runs it as a subprocess:

```python
from ultralytics import YOLO

model = YOLO('model.pt')
results = model.predict(
    source='image.jpg',
    conf=0.5,
    device=0,
)
```

Results are parsed from stdout and returned to the frontend.

---

## Batch Inference

Run inference on multiple images at once:

1. Select images in the gallery (or select all).
2. Choose a model and configure thresholds.
3. Start batch inference.
4. Progress is tracked per-image via `inference:progress` events.

### Progress Event

```json
{
  "job_id": "uuid",
  "current": 5,
  "total": 100,
  "image_id": "uuid",
  "predictions_count": 3
}
```

### Cancellation

Batch inference can be cancelled at any time. The process manager uses a shared cancel flag.

---

## Working with Predictions

After inference, predictions appear as **AI annotations** on each image:

| Property | Value |
|----------|-------|
| `source` | `"ai"` |
| `confidence` | 0.0 - 1.0 |
| `modelClassName` | Class name from the model |

### AI Annotation Styling

- **Dashed border** to visually distinguish from manual annotations.
- **Confidence badge** showing "AI 85%" above the annotation.

### Actions

| Action | Description |
|--------|-------------|
| **Accept** | Convert to user annotation (removes AI badge, keeps geometry) |
| **Reject** | Delete the prediction |
| **Edit** | Move, resize, or change class (auto-converts to user annotation) |

### Model Storage

Uploaded models are stored in the project directory:

```
{projects_dir}/{uuid}/models/{uuid}_{filename}
```

Model metadata (name, format, class mapping) is stored in `project.json` under `inference_models`.

---

## Process Management

The inference system manages concurrent jobs:

- **Multiple concurrent jobs** supported.
- **Per-job cancellation** via shared atomic cancel flag.
- **ONNX sessions are reused** across batch — loaded once, applied to all images.
- **Python processes** — one per job, spawned and monitored.
- **CUDA OOM detection** — reports error with suggestion to reduce batch size or input resolution.
