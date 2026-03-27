# Integrated ML Training

Annotix ships with a complete training pipeline supporting 19 ML backends, 4 execution modes, real-time metrics monitoring, and model export. Training is configured and launched entirely within the app.

## Architecture

```
Frontend (Training Panel)
    |
    v
Tauri IPC (invoke)
    |
    v
Rust Training Runner
    |
    +---> Dataset Preparation (format-specific)
    +---> Python Script Generation
    +---> Process Spawn (stdout capture)
    +---> Real-time Metric Parsing ("ANNOTIX_EVENT:" JSON)
    +---> Tauri Event Emission ("training:progress")
    |
    v
Python Environment (micromamba)
    |
    +---> Backend-specific training
    +---> Model checkpoint saving
    +---> Final model export
```

---

## Backends by Task

### Object Detection

#### YOLO (Ultralytics)

| Model | Sizes | Parameters (nano) |
|-------|-------|-------------------|
| YOLO26 | n, s, m, l, x | ~2.5M |
| YOLO12 | n, s, m, l, x | ~2.6M |
| YOLO11 | n, s, m, l, x | ~2.6M |
| YOLOv10 | n, s, m, l, x | ~2.3M |
| YOLOv9 | n, s, m, l, x | — |
| YOLOv8 | n, s, m, l, x | ~3.2M |
| YOLOv5u | n, s, m, l, x | ~2.5M |

**Tasks:** detect, segment, classify, pose, obb

**Key Hyperparameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `epochs` | 100 | Training epochs |
| `batch` | -1 | Batch size (-1 = auto) |
| `imgsz` | 640 | Input image size |
| `lr0` | 0.01 | Initial learning rate |
| `lrf` | 0.01 | Final LR ratio |
| `optimizer` | auto | SGD, Adam, AdamW, NAdam, RAdam, RMSProp |
| `momentum` | 0.937 | SGD momentum |
| `weight_decay` | 0.0005 | L2 regularization |
| `warmup_epochs` | 3.0 | Warmup period |
| `patience` | 50 | Early stopping patience |
| `pretrained` | true | Use pretrained weights |
| `freeze` | 0 | Layers to freeze |

**Augmentation:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `mosaic` | 1.0 | Mosaic probability |
| `mixup` | 0.0 | Mixup probability |
| `hsv_h` | 0.015 | Hue augmentation |
| `hsv_s` | 0.7 | Saturation augmentation |
| `hsv_v` | 0.4 | Value augmentation |
| `flipud` | 0.0 | Vertical flip probability |
| `fliplr` | 0.5 | Horizontal flip probability |
| `degrees` | 0.0 | Rotation degrees |
| `scale` | 0.5 | Scale range |
| `shear` | 0.0 | Shear degrees |
| `perspective` | 0.0 | Perspective transform |
| `copy_paste` | 0.0 | Copy-paste augmentation |
| `erasing` | 0.4 | Random erasing |

**Loss Weights:** box=7.5, cls=0.5, dfl=1.5

---

#### RT-DETR (Real-Time DETR)

| Model | Parameters |
|-------|-----------|
| RT-DETR-L | 32M |
| RT-DETR-X | 67M |
| RT-DETRv2-S | 20M |
| RT-DETRv2-M | 36M |
| RT-DETRv2-L | 42M |
| RT-DETRv2-X | 76M |

**Tasks:** detect only. End-to-end transformer, no NMS required.

**Defaults:** epochs=72, batch=8, lr=0.0002

---

#### RF-DETR (Roboflow)

| Model | Parameters |
|-------|-----------|
| RFDETRNano | 2.4M |
| RFDETRSmall | 8.3M |
| RFDETRMedium | 22M |
| RFDETRBase | 29M |
| RFDETRLarge | 128M |
| RFDETRBaseSeg | 31M (preview) |

**Tasks:** detect, segment

**Defaults:** epochs=50, batch=8, lr=0.0004, resolution=560

**Special Parameters:** `lr_encoder`, `grad_accum_steps`, `use_ema`, `early_stopping`, `gradient_checkpointing`

---

#### MMDetection (OpenMMLab)

| Category | Models |
|----------|--------|
| **Two-Stage** | Faster R-CNN (41M), Cascade R-CNN (69M) |
| **One-Stage** | RetinaNet (37M), FCOS (32M), RTMDet-L (52M) |
| **Transformer** | DETR (41M), Deformable DETR (40M), DINO (47M), Co-DETR (56M) |

**Tasks:** detect. 30+ architectures total.

**Defaults:** epochs=12, batch=4, lr=0.02

---

### Semantic Segmentation

#### SMP (Segmentation Models PyTorch)

| Architecture | Encoders |
|-------------|----------|
| U-Net | ResNet-34, ResNet-50, etc. |
| U-Net++ | Various |
| MA-Net | Various |
| LinkNet | Various |
| FPN | Various |
| PSPNet | Various |
| PAN | Various |
| DeepLabV3 | Various |
| DeepLabV3+ | Various |
| SegFormer | Various |
| UPerNet | Various |

11 architectures total with multiple encoder options.

**Defaults:** epochs=50, batch=8, lr=0.0001

**Special Parameters:** `loss_type`, `scheduler`, `encoder_depth`, `freeze_encoder`

---

#### HuggingFace Segmentation

| Model | Parameters |
|-------|-----------|
| SegFormer-B0 to B5 | 3.7M - 84M |
| Mask2Former (Swin-L) | 216M |
| MaskFormer (Swin-B) | 102M |
| DPT (ViT-Large) | 343M |
| BEiT (Large) | 441M |
| UPerNet (Swin-L) | 234M |
| MobileViT DeepLabV3 | 6M |

**Defaults:** epochs=50, batch=4, lr=0.00006

---

#### MMSegmentation (OpenMMLab)

| Category | Models |
|----------|--------|
| **CNN Classic** | FCN, PSPNet, DeepLabV3/V3+, UNet, UPerNet, OCRNet, PointRend |
| **Fast/Real-Time** | BiSeNetV1/V2, STDC1/2, Fast-SCNN, CGNet, ERFNet, PIDNet, ICNet, DDRNet |
| **Transformer** | SegFormer, Segmenter, SETR, DPT, Mask2Former, MaskFormer, K-Net, SAN, SegNeXt |

Full OpenMMLab catalog. **Defaults:** epochs=40, batch=4, lr=0.0001

---

### Instance Segmentation

#### Detectron2 (Meta)

| Model | Parameters |
|-------|-----------|
| Mask R-CNN (R50/R101) | 44M/63M |
| Cascade Mask R-CNN | 77M |
| Mask2Former (Swin-L) | 216M |
| PointRend | 45M |

**Defaults:** epochs=50, batch=4, lr=0.0025

---

### Keypoints & Pose Estimation

#### MMPose (OpenMMLab)

| Model | Parameters |
|-------|-----------|
| RTMPose-T | 3.3M |
| RTMPose-S | 5.5M |
| RTMPose-M | 13M |
| RTMPose-L | 28M |
| HRNet-W32 | 29M |
| HRNet-W48 | 64M |
| ViTPose-B | 86M |
| ViTPose-L | 307M |
| SimpleBaseline-R50 | 34M |
| LiteHRNet-30 | 1.8M |

**Defaults:** epochs=210, batch=32, lr=0.0005

---

### Oriented Object Detection (OBB)

#### MMRotate (OpenMMLab)

| Model | Parameters |
|-------|-----------|
| Oriented R-CNN | 41M |
| Rotated Faster R-CNN | 41M |
| Rotated RetinaNet | 37M |
| RoI Transformer | 55M |
| Gliding Vertex | 41M |

**Defaults:** epochs=12, batch=4, lr=0.01

---

### Image Classification

#### timm (PyTorch Image Models)

| Model | Parameters |
|-------|-----------|
| MobileNetV3-Large | 5.5M |
| EfficientNet-B0 | 5.3M |
| EfficientNet-B3 | 12M |
| ResNet-50 | 25M |
| ConvNeXt-Tiny | 28M |
| ViT-Base | 86M |
| Swin-Base | 88M |
| EVA-02-Large | 305M |

700+ models available. **Tasks:** classify, multi_classify

**Defaults:** epochs=100, batch=32, size=224, lr=0.001

**Special Parameters:** `mixup`, `cutmix`, `label_smoothing`, `drop_rate`

---

#### HuggingFace Classification

| Model | Parameters |
|-------|-----------|
| ViT-Base/Large | 86M/307M |
| ConvNeXt-Base | 89M |
| Swin-Base | 88M |
| DeiT-Base | 86M |
| BEiT-Base | 86M |

**Defaults:** epochs=30, batch=16, size=224, lr=0.00005

---

### Time Series

See [[Time Series]] for annotation details.

| Backend | Task | Key Models |
|---------|------|------------|
| **tsai** | classify, forecast, regress, anomaly, segment, event | InceptionTime+, PatchTST, TST+, ROCKET, MiniRocket, LSTM+, GRU+, TCN |
| **PyTorch Forecasting** | forecast | TFT (5M), N-BEATS (4M), N-HiTS (3M), DeepAR (2M) |
| **PyOD** | anomaly | AutoEncoder, VAE, ECOD, Isolation Forest, LOF |
| **tslearn** | cluster | K-Means-DTW, K-Means-Euclidean, K-Shape |
| **PyPOTS** | impute | SAITS (1M), BRITS (0.5M), US-GAN (1.5M) |
| **STUMPY** | pattern | Matrix Profile, MPdist |

### Tabular

See [[Tabular Data]] for details. Uses scikit-learn, XGBoost, and LightGBM.

---

## Execution Modes

### 1. Local Training

Training runs in an isolated Python environment managed by Annotix.

**Flow:**
1. Check/create Python environment (micromamba).
2. Detect GPU (CUDA or MPS).
3. Install backend-specific packages.
4. Prepare dataset in the required format.
5. Generate training script with all hyperparameters.
6. Spawn Python process with stdout/stderr capture.
7. Parse real-time metrics from `ANNOTIX_EVENT:` JSON lines.
8. Emit `training:progress` events to the frontend.
9. On completion: save model, record final metrics.

**Python Environment:**
- Managed via **micromamba** (preferred), mamba, or conda.
- Environment path: `~/.annotix/python-env/`
- Search order: system micromamba/mamba/conda, then bundled micromamba.
- Micromamba is automatically downloaded if not found.

**GPU Detection:**
```
NVIDIA CUDA: torch.cuda.is_available()
Apple MPS:   torch.backends.mps.is_available()
```

Returns GPU name, VRAM total/free, CUDA version.

---

### 2. Download Package

Generates a self-contained ZIP with everything needed to train externally:

- Dataset in the backend's required format.
- Training script (`train.py`).
- Requirements file (`requirements.txt`).
- Configuration file.

Run the package on any machine with Python installed.

---

### 3. Cloud Training

Train on remote infrastructure. Annotix handles dataset upload, job creation, status polling, and model download.

| Provider | Auth | GPU Options | Polling |
|----------|------|-------------|---------|
| **Vertex AI** (GCP) | Service Account JSON | T4, V100, A100 | 30s |
| **Colab Enterprise** | GCP Service Account | Managed | 30s |
| **Kaggle** | Username + API Key | GPU, TPU | 30s |
| **Lightning AI** | API Key | T4, A100, etc. | 30s |
| **HuggingFace** | API Token + Username | Managed | 30s |
| **Saturn Cloud** | API Token | Configurable | 30s |

**Common Flow:**
1. Upload dataset to provider's storage.
2. Upload/generate training script or notebook.
3. Create and submit training job.
4. Poll job status every 30 seconds (queued -> running -> succeeded/failed).
5. Download trained model on success.

---

### 4. Browser Automation (Free Colab)

Train on Google Colab's free T4 GPU using Chrome DevTools Protocol automation. See [[Browser Automation]] for full details.

---

## Training Presets

6 optimized presets for common scenarios:

| Preset | Model Size | Image Size | Epochs | LR | Key Settings |
|--------|-----------|------------|--------|-----|--------------|
| **Small Objects** | nano | 320 | 250 | 0.015 | Strong augmentation, freeze 8 layers |
| **Industrial** | small | 640 | 300 | 0.01 | Conservative augmentation, freeze 10 |
| **Traffic** | small | 640 | 200 | 0.01 | Very strong augmentation, multi-scale |
| **Edge/Mobile** | nano | 256 | 300 | 0.02 | RAM cache, max 10 detections |
| **Medical** | medium | 640 | 500 | 0.005 | Spatial transforms, patience 80, freeze 12 |
| **Aerial** | medium | 960 | 200 | 0.01 | 180-degree rotation, max 1000 detections |

---

## Real-Time Metrics

Training progress is monitored via live charts. The Python training process emits structured JSON events:

```
ANNOTIX_EVENT:{"type":"epoch","epoch":5,"totalEpochs":100,"progress":5.0,"metrics":{"mAP50":0.45}}
```

### Metrics by Task

| Task | Metrics |
|------|---------|
| **Object Detection** | box_loss, cls_loss, dfl_loss, precision, recall, mAP50, mAP50-95, lr |
| **Segmentation** | mean_IoU, mean_accuracy, dice_loss, seg_loss |
| **Instance Seg** | mask_AP, box_AP |
| **Keypoints** | keypoint_AP |
| **Classification** | accuracy, f1_score, loss |
| **Time Series** | MAE, RMSE, AUC-ROC, silhouette_score |
| **Tabular** | R2, MSE, ROC-AUC |

---

## Model Export

After training, models can be exported to deployment formats:

| Format | Extension | Use Case |
|--------|-----------|----------|
| PyTorch | `.pt` | Default, full model |
| ONNX | `.onnx` | Cross-platform deployment |
| TorchScript | `.torchscript` | C++ inference |
| TFLite | `.tflite` | Mobile (Android/iOS) |
| CoreML | `.mlmodel` | Apple devices |
| TensorRT | `.engine` | NVIDIA optimized inference |
| OpenVINO | `.xml` | Intel hardware |

---

## Dataset Preparation

Each backend requires a specific dataset format. Annotix prepares the dataset automatically:

| Format | Structure | Used By |
|--------|-----------|---------|
| **YOLO TXT** | `images/` + `labels/` with normalized coords | YOLO |
| **COCO JSON** | `annotations.json` + `images/` with pixel coords | RT-DETR, RF-DETR, MMDetection, Detectron2 |
| **Mask PNG** | `images/` + `masks/` with indexed pixel values | SMP, HF Segmentation, MMSegmentation |
| **Image Folder** | `{class_name}/image.jpg` | timm, HF Classification |
| **Multi-Label CSV** | `filename, label1, label2, ...` | timm, HF Classification |
| **COCO Keypoints** | COCO JSON with keypoints array | MMPose |
| **DOTA TXT** | Rotated bbox format | MMRotate |
| **Time Series CSV** | `timestamp, value1, ..., target` | tsai, PyTorch Forecasting, PyOD, tslearn, PyPOTS, STUMPY |
| **Tabular CSV** | Standard CSV with features + target | scikit-learn |

**Train/Val Split:** Deterministic shuffle with project ID as seed. Default 80/20 split, configurable. Always at least 1 sample per split.
