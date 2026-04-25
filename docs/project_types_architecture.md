# Annotix — Arquitectura por Tipo de Proyecto

> Referencia maestra que define qué tiene cada tipo de proyecto: herramientas, backends de
> entrenamiento, formatos de exportación/importación, presets, hiperparámetros y scripts.
>
> **Regla de oro**: al agregar o modificar un tipo de proyecto, actualizar TODAS las capas
> descritas aquí. Si una capa no aparece, el tipo no está completo.

---

## 1. Taxonomía de Tipos de Proyecto

Definido en `src/lib/db.ts` → `ProjectType`.

| # | Categoría | ProjectType | Task (backend) | Estado |
|---|-----------|-------------|----------------|--------|
| 1 | Imágenes | `bbox` | `detect` | Implementado |
| 2 | Imágenes | `mask` | `segment` | Implementado |
| 3 | Imágenes | `polygon` | `instance_segment` | Implementado |
| 4 | Imágenes | `keypoints` | `pose` | Implementado |
| 5 | Imágenes | `landmarks` | `landmarks` | Implementado |
| 6 | Imágenes | `obb` | `obb` | Implementado |
| 7 | Clasificación | `classification` | `classify` | Implementado |
| 8 | Clasificación | `multi-label-classification` | `multi_classify` | Implementado |
| 9 | Imágenes | `instance-segmentation` | `instance_segment` | Implementado |
| 10 | Series Temporales | `timeseries-classification` | `ts_classify` | Implementado |
| 11 | Series Temporales | `timeseries-forecasting` | `ts_forecast` | Implementado |
| 12 | Series Temporales | `anomaly-detection` | `ts_anomaly` | Implementado |
| 13 | Series Temporales | `timeseries-segmentation` | `ts_segment` | Implementado |
| 14 | Series Temporales | `pattern-recognition` | `ts_pattern` | Implementado |
| 15 | Series Temporales | `event-detection` | `ts_event` | Implementado |
| 16 | Series Temporales | `timeseries-regression` | `ts_regress` | Implementado |
| 17 | Series Temporales | `clustering` | `ts_cluster` | Implementado |
| 18 | Series Temporales | `imputation` | `ts_impute` | Implementado |
| 19 | Audio | `audio-classification` | — | Futuro |
| 20 | Audio | `speech-recognition` | — | Futuro |
| 21 | Audio | `sound-event-detection` | — | Futuro |

**Mapeo canónico** (`src-tauri/src/training/backends.rs` → `project_type_to_task`):

```
bbox / object-detection        → detect
mask / semantic-segmentation   → segment
instance-segmentation / polygon → instance_segment
classification                 → classify
multi-label-classification     → multi_classify
keypoints                      → pose
landmarks                      → landmarks
obb                            → obb
timeseries-classification      → ts_classify
timeseries-forecasting         → ts_forecast
anomaly-detection              → ts_anomaly
timeseries-segmentation        → ts_segment
pattern-recognition            → ts_pattern
event-detection                → ts_event
timeseries-regression          → ts_regress
clustering                     → ts_cluster
imputation                     → ts_impute
```

---

## 2. Capas por Tipo de Proyecto

Cada tipo de proyecto tiene exactamente estas **7 capas**. Todas deben estar presentes para
considerar el tipo completo.

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Metadata UI       → icono, color, nombre, descripción i18n  │
│  2. Herramientas      → tools de canvas disponibles              │
│  3. Formato de datos  → cómo se almacena la anotación            │
│  4. Export            → formatos de exportación válidos           │
│  5. Import            → detección automática + importador         │
│  6. Training          → backends + modelos + hiperparámetros      │
│  7. Dataset prep      → conversión de anotaciones → formato ML    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Capa 1 — Metadata UI

**Archivos**:
- `src/features/projects/components/ProjectTypeSelector.tsx` — categorías + iconos del selector
- `src/features/projects/data/wizardConfig.ts` → `PROJECT_TYPE_META` — iconos/colores maestros
- `public/locales/{lang}.json` → `project.types.{type}.name/description`

| ProjectType | Icono FA | Color Tailwind | Categoría UI |
|-------------|----------|----------------|--------------|
| `bbox` | `fa-vector-square` | `bg-blue-100 text-blue-600` | Imágenes |
| `mask` | `fa-paintbrush` | `bg-purple-100 text-purple-600` | Imágenes |
| `polygon` | `fa-draw-polygon` | `bg-green-100 text-green-600` | Imágenes |
| `keypoints` | `fa-sitemap` | `bg-orange-100 text-orange-600` | Imágenes |
| `landmarks` | `fa-location-dot` | `bg-red-100 text-red-600` | Imágenes |
| `obb` | `fa-rotate` | `bg-indigo-100 text-indigo-600` | Imágenes |
| `classification` | `fa-tag` | `bg-yellow-100 text-yellow-600` | Clasificación |
| `multi-label-classification` | `fa-tags` | `bg-amber-100 text-amber-600` | Clasificación |
| `instance-segmentation` | `fa-object-ungroup` | `bg-fuchsia-100 text-fuchsia-600` | Imágenes |
| `timeseries-classification` | `fa-chart-line` | `bg-cyan-100 text-cyan-600` | Series Temporales |
| `timeseries-forecasting` | `fa-chart-area` | `bg-teal-100 text-teal-600` | Series Temporales |
| `anomaly-detection` | `fa-exclamation-triangle` | `bg-rose-100 text-rose-600` | Series Temporales |
| `timeseries-segmentation` | `fa-layer-group` | `bg-emerald-100 text-emerald-600` | Series Temporales |
| `pattern-recognition` | `fa-wave-square` | `bg-violet-100 text-violet-600` | Series Temporales |
| `event-detection` | `fa-bolt` | `bg-fuchsia-100 text-fuchsia-600` | Series Temporales |
| `timeseries-regression` | `fa-chart-simple` | `bg-sky-100 text-sky-600` | Series Temporales |
| `clustering` | `fa-circle-nodes` | `bg-lime-100 text-lime-600` | Series Temporales |
| `imputation` | `fa-fill-drip` | `bg-pink-100 text-pink-600` | Series Temporales |

---

## 4. Capa 2 — Herramientas de Canvas

**Archivo**: `src/features/canvas/config/toolsConfig.ts`

### 4.1 Herramientas disponibles

| ToolId | Icono | Hotkey | Handler | Renderer |
|--------|-------|--------|---------|----------|
| `select` | `fa-mouse-pointer` | `V` | — | — |
| `pan` | `fa-hand` | `H` | — | — |
| `bbox` | `fa-vector-square` | `B` | `BBoxHandler` | `BBoxRenderer` (Konva `<Rect>`) |
| `mask` | `fa-paintbrush` | `M` | `MaskHandler` | `MaskRenderer` (Konva `<Image>` base64 PNG) |
| `polygon` | `fa-draw-polygon` | `P` | `PolygonHandler` | `PolygonRenderer` (Konva `<Line>`) |
| `keypoints` | `fa-user-circle` | `K` | `KeypointsHandler` | `KeypointsRenderer` (circles + lines) |
| `landmarks` | `fa-map-marker-alt` | `L` | `LandmarksHandler` | `LandmarksRenderer` (points) |
| `obb` | `fa-rotate` | `O` | `OBBHandler` | `OBBRenderer` (Konva `<Group>` rotado) |

### 4.2 Mapeo ProjectType → Tools

| ProjectType | Tools | Notas |
|-------------|-------|-------|
| `bbox` | select, pan, **bbox** | Herramienta única de dibujo |
| `mask` | select, pan, **mask** | Pincel rasterizado |
| `polygon` | select, pan, **polygon** | Click secuencial, cierre auto |
| `keypoints` | select, pan, **keypoints** | Con preset de esqueleto |
| `landmarks` | select, pan, **landmarks** | Puntos libres |
| `obb` | select, pan, **obb** | Drag + rotación |
| `classification` | select, pan | Sin herramientas de dibujo |
| `multi-label-classification` | select, pan | Sin herramientas de dibujo |
| `instance-segmentation` | select, pan, **mask**, **polygon** | Combinación |
| `timeseries-*` (todos) | `[]` | Usan Chart.js, no Konva |

### 4.3 Series temporales — herramientas propias

Los proyectos de series temporales no usan el canvas Konva. Tienen su propio sistema:
- **Archivo**: `src/features/timeseries/components/TimeSeriesCanvas.tsx`
- **Tools TS**: `select`, `point`, `range`, `event`, `anomaly`

### 4.4 Routing por tipo

**Archivo**: `src/App.tsx`

```
isTimeSeriesProject(type) → TimeSeriesGallery + TimeSeriesCanvas
isClassificationProject(type) → AnnotationCanvas + ClassificationPanel
default → AnnotationCanvas (con tools según tipo)
```

---

## 5. Capa 3 — Formato de Datos de Anotación

**Archivo**: `src/lib/db.ts`

### 5.1 Imagen — tipos de anotación

| ProjectType | Estructura de datos |
|-------------|---------------------|
| `bbox` | `{ x, y, width, height }` |
| `obb` | `{ x, y, width, height, rotation }` (centro + ángulo 0-360) |
| `mask` | `{ base64png, instanceId? }` |
| `polygon` | `{ points: [{x, y}], closed? }` |
| `keypoints` | `{ points: [{x, y, visible, name?}], skeletonType, instanceId? }` |
| `landmarks` | `{ points: [{x, y, name}] }` |
| `classification` | `{ labels: [classId] }` (single: 1 elemento, multi: N) |
| `instance-segmentation` | Usa `mask` y/o `polygon` con `instanceId` |

### 5.2 Series temporales — tipos de anotación

| Tipo | Estructura |
|------|------------|
| Point | `{ timestamp, value?, label? }` |
| Range | `{ startTimestamp, endTimestamp, label? }` |
| Classification | `{ classId }` |
| Event | `{ timestamp, eventType, confidence? }` |
| Anomaly | `{ timestamp, score, threshold? }` |

---

## 6. Capa 4 — Formatos de Exportación

**Archivo**: `src/features/export/utils/formatMapping.ts`

### 6.1 Formatos disponibles (11 total)

| Formato | ID | Archivos generados |
|---------|----|--------------------|
| YOLO Detection | `yolo-detection` | `labels/*.txt` + `images/` + `classes.txt` + `data.yaml` |
| YOLO Segmentation | `yolo-segmentation` | `labels/*.txt` (polígonos) + `images/` |
| COCO JSON | `coco` | `annotations.json` + `images/` |
| Pascal VOC | `pascal-voc` | `Annotations/*.xml` + `JPEGImages/` |
| CSV Detection | `csv-detection` | `annotations.csv` (filename,w,h,class,xmin,ymin,xmax,ymax) |
| CSV Classification | `csv-classification` | `annotations.csv` (filename,class) |
| CSV Keypoints | `csv-keypoints` | `annotations.csv` (filename,...,kp1_x,kp1_y,kp1_visible,...) |
| CSV Landmarks | `csv-landmarks` | `annotations.csv` (filename,...,landmark1_x,landmark1_y,...) |
| Folders by Class | `folders-by-class` | `{className}/image.jpg` |
| U-Net Masks | `unet-masks` | `images/` + `masks/` (PNG greyscale) + `classes.txt` |
| TIX | `tix` | `annotations.json` (formato propio) + `images/` |

### 6.2 Mapeo ProjectType → Export Formats

| ProjectType | Formatos válidos |
|-------------|-----------------|
| `bbox` | yolo-detection, pascal-voc, coco, csv-detection, tix |
| `obb` | yolo-detection, pascal-voc, coco |
| `mask` | unet-masks, coco, tix |
| `polygon` | coco, unet-masks, tix |
| `instance-segmentation` | yolo-segmentation, coco, unet-masks, tix |
| `classification` | folders-by-class, csv-classification |
| `multi-label-classification` | folders-by-class, csv-classification |
| `keypoints` | yolo-detection, coco, csv-keypoints |
| `landmarks` | csv-landmarks, coco |
| `timeseries-*` | `[]` (sin exportación de imágenes) |
| `audio-*` | `[]` (futuro) |

**Backend Rust**: `src-tauri/src/export/` — un archivo `.rs` por formato.

---

## 7. Capa 5 — Importación

**Archivo**: `src-tauri/src/import/`

### 7.1 Formatos soportados (8 + auto-detección)

| Formato | Detector | Confianza | Genera ProjectType |
|---------|----------|-----------|-------------------|
| YOLO Detection | `classes.txt` + `labels/*.txt` (5 cols) | 0.95 | `bbox` |
| YOLO Segmentation | `classes.txt` + `labels/*.txt` (>5 cols) | 0.95 | `polygon` |
| COCO JSON | `annotations.json` con `{images, annotations, categories}` | 0.95 | `bbox` / `polygon` |
| TIX | `annotations.json` con `{project, images}` | 0.95 | (original) |
| Pascal VOC | `Annotations/*.xml` | 0.90 | `bbox` |
| U-Net Masks | `masks/` + `images/` PNG | 0.90 | `mask` |
| CSV | `annotations.csv` + header analysis | 0.85-0.90 | varía |
| Folders by Class | múltiples carpetas con imágenes | 0.85 | `classification` |

### 7.2 Flujo

```
1. detect_import_format(path) → { format, project_type, confidence }
2. import_dataset(path, name) → crea proyecto + imágenes + anotaciones
```

---

## 8. Capa 6 — Backends de Entrenamiento

**Archivos**:
- `src-tauri/src/training/backends.rs` — definición Rust de backends y modelos
- `src/features/settings/data/backendsData.ts` — catálogo TypeScript (UI settings)
- `src/features/settings/data/defaultParams.ts` — parámetros y valores por defecto

### 8.1 Mapeo ProjectType → Task → Backends

| Task | ProjectTypes | Backends disponibles |
|------|-------------|---------------------|
| `detect` | bbox | **YOLO**, RT-DETR, RF-DETR, MMDetection |
| `segment` | mask | **YOLO**, RF-DETR, SMP, HF Segmentation, MMSegmentation |
| `instance_segment` | instance-segmentation, polygon | **YOLO**, Detectron2, MMDetection Instance |
| `classify` | classification | **YOLO**, timm, HF Classification |
| `multi_classify` | multi-label-classification | **timm**, HF Classification |
| `pose` | keypoints | **YOLO**, MMPose |
| `landmarks` | landmarks | **MMPose** |
| `obb` | obb | **YOLO**, MMRotate |
| `ts_classify` | timeseries-classification | **tsai** |
| `ts_forecast` | timeseries-forecasting | **tsai**, PyTorch Forecasting |
| `ts_anomaly` | anomaly-detection | **tsai**, PyOD |
| `ts_segment` | timeseries-segmentation | **tsai** |
| `ts_pattern` | pattern-recognition | **STUMPY** |
| `ts_event` | event-detection | **tsai** |
| `ts_regress` | timeseries-regression | **tsai** |
| `ts_cluster` | clustering | **tslearn** |
| `ts_impute` | imputation | **PyPOTS** |

**Negrita** = backend recomendado / principal.

### 8.2 Catálogo de Backends (18 total)

| Backend | Pip packages | Dataset Format | Tareas |
|---------|-------------|---------------|--------|
| YOLO | `ultralytics` | YOLO TXT | detect, segment, classify, pose, obb |
| RT-DETR | `ultralytics` | YOLO TXT | detect |
| RF-DETR | `rfdetr` | COCO JSON | detect, segment |
| MMDetection | `openmim mmengine mmcv mmdet` | COCO JSON | detect, instance_segment |
| SMP | `segmentation-models-pytorch torch torchvision albumentations` | PNG Masks | segment |
| HF Segmentation | `transformers datasets evaluate torch torchvision` | PNG Masks | segment |
| MMSegmentation | `openmim mmengine mmcv mmsegmentation` | PNG Masks | segment |
| Detectron2 | `detectron2` | COCO Instance JSON | instance_segment |
| MMPose | `openmim mmengine mmcv mmpose mmdet` | COCO Keypoints JSON | pose, landmarks |
| MMRotate | `openmim mmengine mmcv mmrotate` | DOTA TXT | obb |
| timm | `timm torch torchvision` | ImageFolder | classify, multi_classify |
| HF Classification | `transformers datasets evaluate torch torchvision` | ImageFolder | classify, multi_classify |
| tsai | `tsai` | TimeSeries CSV | ts_classify, ts_forecast, ts_regress, ts_segment, ts_event |
| PyTorch Forecasting | `pytorch-forecasting pytorch-lightning torch` | TimeSeries CSV | ts_forecast |
| PyOD | `pyod torch` | TimeSeries CSV | ts_anomaly |
| tslearn | `tslearn scikit-learn` | TimeSeries CSV | ts_cluster |
| PyPOTS | `pypots torch` | TimeSeries CSV | ts_impute |
| STUMPY | `stumpy numpy` | TimeSeries CSV | ts_pattern |

### 8.3 Modelos por Backend

| Backend | Cant. Modelos | Modelos destacados |
|---------|---------------|-------------------|
| YOLO | 7 | YOLO26★, YOLO12, YOLO11, YOLOv10, YOLOv9, YOLOv8, YOLOv5u |
| RT-DETR | 6 | RT-DETR-L★, RT-DETR-X, RT-DETRv2-S/M/L/X |
| RF-DETR | 6 | RFDETRBase★, Nano, Small, Medium, Large, BaseSeg |
| MMDetection | 9 | RTMDet-L★, DINO, Faster R-CNN, Cascade R-CNN, DETR, etc. |
| SMP | 12 | U-Net★, U-Net++, FPN, DeepLabV3+, SegFormer, etc. |
| HF Segmentation | 12 | SegFormer B0-B5, Mask2Former, DPT, BEiT, etc. |
| MMSegmentation | 30 | DeepLabV3+★, FCN, PSPNet, UNet, SegFormer, SETR, etc. |
| Detectron2 | 5 | Mask R-CNN R50★, R101, Cascade, Mask2Former, PointRend |
| MMPose | 9 | RTMPose-M★, HRNet, ViTPose, SimpleBaseline, LiteHRNet |
| MMRotate | 5 | Oriented R-CNN★, Rotated Faster R-CNN, RoI Transformer, etc. |
| timm | 8 | EfficientNet-B0★, MobileNetV3, ResNet50, ConvNeXt, ViT, Swin, EVA-02 |
| HF Classification | 6 | ViT-B★, ViT-L, ConvNeXt, Swin, DeiT, BEiT |
| tsai | 11 | InceptionTime+★, PatchTST, TST+, ROCKET, MiniRocket, etc. |
| PyTorch Forecasting | 4 | TFT★, N-BEATS, N-HiTS, DeepAR |
| PyOD | 5 | AutoEncoder★, VAE, ECOD, Isolation Forest, LOF |
| tslearn | 4 | K-Means DTW★, Euclidean, Soft-DTW, K-Shape |
| PyPOTS | 3 | SAITS★, BRITS, US-GAN |
| STUMPY | 2 | Matrix Profile★, MPdist |

**Total: 144 modelos** (★ = recomendado)

### 8.4 Parámetros comunes a todos los backends

```
epochs          int     1-10000
batchSize       int     -1 (auto) a 256
imageSize       int     32-4096 (step 32)
lr              float   0.000001-1
patience        int     0-1000  (0 = sin early stopping)
valSplit        slider  0.05-0.5
workers         int     0-32
amp             bool    Automatic Mixed Precision
```

### 8.5 Parámetros específicos (resumen)

| Backend | Parámetros extras clave |
|---------|------------------------|
| YOLO | optimizer, lrf, cos_lr, warmup_epochs, momentum, weight_decay, freeze, augmentation (14 params) |
| RT-DETR | optimizer, lrf, warmup_epochs, weight_decay, freeze |
| RF-DETR | resolution, lr_encoder, grad_accum_steps, use_ema, early_stopping, gradient_checkpointing |
| MMDetection | optimizer_type, momentum, weight_decay, lr_schedule, milestones, warmup_iters, checkpoint_interval |
| SMP | loss_type (dice+ce/dice/ce/focal/jaccard), scheduler, encoder_depth, freeze_encoder |
| HF Segmentation | do_reduce_labels, warmup_ratio, weight_decay, lr_scheduler_type |
| MMSegmentation | optimizer_type, lr_schedule, crop_size, warmup_iters, checkpoint_interval |
| Detectron2 | optimizer_type, momentum, lr_schedule, warmup_iters, checkpoint_interval, mask_head |
| MMPose | optimizer_type, lr_schedule, warmup_iters, input_size_h/w, checkpoint_interval |
| MMRotate | optimizer_type, momentum, lr_schedule, warmup_iters, angle_version (le90/le135/oc) |
| timm | optimizer_type, scheduler, mixup, cutmix, label_smoothing, drop_rate |
| HF Classification | warmup_ratio, weight_decay, lr_scheduler_type, label_smoothing |
| tsai | optimizer_type, scheduler (one_cycle/cosine/step), window_size, stride |
| PyTorch Forecasting | max_prediction_length, max_encoder_length, gradient_clip_val, hidden_size, dropout |
| PyOD | contamination, n_estimators |
| tslearn | n_clusters, metric (dtw/euclidean/softdtw), max_iter |
| PyPOTS | n_layers, d_model, d_ffn, n_heads |
| STUMPY | window_size, normalize |

Referencia completa en `src/features/settings/data/defaultParams.ts`.

---

## 9. Capa 7 — Preparación de Dataset para Training

**Archivos**:
- `src-tauri/src/training/dataset.rs` — preparación del dataset
- `src-tauri/src/training/scripts.rs` — generación de scripts Python
- `src-tauri/src/training/notebook.rs` — conversión a Jupyter notebooks
- `src-tauri/src/training/package.rs` — generación de ZIP descargable

### 9.1 Formatos de dataset ML

| Formato | Backends que lo usan | Estructura |
|---------|---------------------|------------|
| YOLO TXT | YOLO, RT-DETR | `train/images/` + `train/labels/` + `val/...` + `data.yaml` |
| COCO JSON | RF-DETR, MMDetection | `train/_annotations.coco.json` + `valid/...` |
| Mask PNG | SMP, HF Seg, MMSeg | `train/images/` + `train/masks/` + `val/...` |
| COCO Instance JSON | Detectron2 | `annotations/instances_train.json` + `images/` |
| COCO Keypoints JSON | MMPose | `annotations/keypoints_train.json` + `images/` |
| DOTA TXT | MMRotate | Similar a YOLO con coordenadas rotadas |
| ImageFolder | YOLO classify, timm, HF Cls | `train/{class_name}/image.jpg` |
| MultiLabel CSV | timm, HF Cls multi | `train/images/` + `labels.csv` |
| TimeSeries CSV | tsai, PyTorch Forecasting, PyOD, tslearn, PyPOTS, STUMPY | CSV con timestamps |

### 9.2 Conversión de anotaciones

```
ProjectType     → Task      → Dataset Format        → Conversión
bbox            → detect    → YOLO TXT              → class x_center y_center w h (norm 0-1)
bbox            → detect    → COCO JSON              → x, y, w, h (absolutos)
mask            → segment   → Mask PNG               → PNG greyscale (pixel = class_id)
polygon         → inst_seg  → YOLO TXT               → class x1 y1 x2 y2 ... xn yn (norm)
keypoints       → pose      → COCO Keypoints JSON    → x, y, v por cada keypoint
obb             → obb       → YOLO TXT               → convierte OBB → AABB
classification  → classify  → ImageFolder            → copia imagen a carpeta de clase
timeseries-*    → ts_*      → TimeSeries CSV          → timestamp, value, label
```

### 9.3 Estructura del paquete descargable

```
training_package.zip/
├── dataset/
│   ├── train/ (images + labels/masks)
│   ├── val/   (images + labels/masks)
│   └── data.yaml
├── train.py          ← Script Python ejecutable
├── train.ipynb       ← Jupyter Notebook equivalente
├── requirements.txt  ← Dependencias pip
└── README.md         ← Instrucciones
```

### 9.4 Comunicación script ↔ Annotix

Los scripts Python emiten eventos en stdout con formato:

```
ANNOTIX_EVENT:{"type":"epoch","epoch":1,"totalEpochs":100,"progress":1.0,"metrics":{...}}
ANNOTIX_EVENT:{"type":"completed","bestModelPath":"...","finalMetrics":{...}}
```

Métricas por tipo de tarea:
- **detect**: box_loss, cls_loss, dfl_loss, precision, recall, mAP50, mAP50_95
- **segment**: meanIoU, meanAccuracy, diceLoss
- **classify**: accuracy, f1Score
- **pose**: keypointAP
- **ts_***: mae, rmse, aucRoc, silhouetteScore

---

## 10. Presets de Escenario (solo YOLO)

**Archivo**: `src/features/training/utils/presets.ts`

| Preset | ImageSize | Epochs | LR | Model Size | Uso |
|--------|-----------|--------|-----|------------|-----|
| Small Objects | 320 | 250 | 0.01 | nano | Objetos pequeños |
| Industrial | 640 | 300 | 0.01 | small | Inspección industrial |
| Traffic | 640 | 200 | 0.01 | small | Tráfico, vehículos |
| Edge Mobile | 256 | 300 | 0.01 | nano | Deploy en móvil |
| Medical | 640 | 500 | 0.005 | medium | Imágenes médicas |
| Aerial | 960 | 200 | 0.01 | medium | Vista aérea/satelital |

Referencia completa en `DOCS/yolo_training_presets.md`.

---

## 11. Modos de Ejecución

| Modo | Descripción |
|------|-------------|
| **Local** | Ejecuta en venv Python local. Requiere setup previo (Python + pip packages). Monitoreo en tiempo real. |
| **Download Package** | Genera ZIP con dataset + script + notebook + requirements. Para ejecutar en Colab, servidor remoto, etc. |

### 11.1 Flujo local

```
1. Verificar Python env → setup_python_env() si necesario
2. Seleccionar backend → getAvailableBackends(projectType)
3. Configurar parámetros → TrainingRequest
4. start_training_v2() → prepara dataset → genera script → spawn Python
5. Lee stdout → parsea ANNOTIX_EVENT → emite eventos Tauri al frontend
6. Frontend grafica métricas en tiempo real
7. Completado → best.pt disponible para fine-tuning
```

### 11.2 Fine-tuning desde modelo previo

```typescript
TrainingRequest { baseModelPath: "/ruta/a/best.pt" }
```

---

## 12. Tabla Maestra — Vista Completa por Tipo

### 12.1 Tipos de Imagen

| | bbox | mask | polygon | keypoints | landmarks | obb | classification | multi-label | instance-seg |
|---|---|---|---|---|---|---|---|---|---|
| **Tools** | bbox | mask | polygon | keypoints | landmarks | obb | (ninguna) | (ninguna) | mask+polygon |
| **Export** | yolo-det, voc, coco, csv-det, tix | unet, coco, tix | coco, unet, tix | yolo-det, coco, csv-kp | csv-lm, coco | yolo-det, voc, coco | folders, csv-cls | folders, csv-cls | yolo-seg, coco, unet, tix |
| **Task** | detect | segment | instance_segment | pose | landmarks | obb | classify | multi_classify | instance_segment |
| **Backends** | YOLO, RT-DETR, RF-DETR, MMDet | YOLO, RF-DETR, SMP, HF-Seg, MMSeg | YOLO, Detectron2, MMDet-Inst | YOLO, MMPose | MMPose | YOLO, MMRotate | YOLO, timm, HF-Cls | timm, HF-Cls | YOLO, Detectron2, MMDet-Inst |
| **Dataset** | YOLO TXT / COCO | Mask PNG | YOLO TXT / COCO Inst | COCO KP | COCO KP | YOLO TXT / DOTA | ImageFolder | ImageFolder / CSV | YOLO TXT / COCO Inst |

### 12.2 Tipos de Series Temporales

| | ts-classification | ts-forecasting | anomaly-det | ts-segmentation | pattern-recog | event-det | ts-regression | clustering | imputation |
|---|---|---|---|---|---|---|---|---|---|
| **Tools** | Chart.js TS | Chart.js TS | Chart.js TS | Chart.js TS | Chart.js TS | Chart.js TS | Chart.js TS | Chart.js TS | Chart.js TS |
| **Export** | — | — | — | — | — | — | — | — | — |
| **Task** | ts_classify | ts_forecast | ts_anomaly | ts_segment | ts_pattern | ts_event | ts_regress | ts_cluster | ts_impute |
| **Backends** | tsai | tsai, PyTorch-F | tsai, PyOD | tsai | STUMPY | tsai | tsai | tslearn | PyPOTS |
| **Dataset** | TS CSV | TS CSV | TS CSV | TS CSV | TS CSV | TS CSV | TS CSV | TS CSV | TS CSV |

---

## 13. Checklist para Agregar un Nuevo Tipo de Proyecto

Al agregar un nuevo `ProjectType` (ej: `audio-classification`), se deben modificar **estos archivos en orden**:

### Paso 1 — Definición del tipo
- [ ] `src/lib/db.ts` → agregar al union `ProjectType`

### Paso 2 — Metadata UI
- [ ] `src/features/projects/components/ProjectTypeSelector.tsx` → agregar en categoría
- [ ] `src/features/projects/data/wizardConfig.ts` → agregar a `PROJECT_TYPE_META` + opciones/reglas de wizard
- [ ] `public/locales/*.json` (10 archivos) → `project.types.{type}.name/description` + `wizard.*`

### Paso 3 — Herramientas
- [ ] `src/features/canvas/config/toolsConfig.ts` → agregar a `PROJECT_TOOLS`
- [ ] Si necesita nuevo handler: crear `src/features/canvas/handlers/{Type}Handler.ts`
- [ ] Si necesita nuevo renderer: crear `src/features/canvas/components/renderers/{Type}Renderer.tsx`

### Paso 4 — Routing
- [ ] `src/App.tsx` → agregar lógica de routing si necesita vista especial

### Paso 5 — Exportación
- [ ] `src/features/export/utils/formatMapping.ts` → agregar a `getValidFormats()`
- [ ] Si necesita nuevo formato: crear `src-tauri/src/export/{format}.rs`

### Paso 6 — Importación
- [ ] `src-tauri/src/import/format_detector.rs` → agregar detección
- [ ] Si necesita nuevo importador: crear `src-tauri/src/import/{format}.rs`

### Paso 7 — Training
- [ ] `src-tauri/src/training/backends.rs` → agregar a `project_type_to_task()` + `get_available_backends()`
- [ ] `src-tauri/src/training/scripts.rs` → agregar generador de script si backend nuevo
- [ ] `src-tauri/src/training/dataset.rs` → agregar preparación de dataset si formato nuevo
- [ ] `src/features/settings/data/backendsData.ts` → agregar al catálogo UI
- [ ] `src/features/settings/data/defaultParams.ts` → agregar parámetros y defaults
- [ ] `src/features/training/types.ts` → agregar al tipo `TrainingBackend` si backend nuevo

### Paso 8 — Verificación
- [ ] Compilar (`npx tsc --noEmit`)
- [ ] Probar flujo completo: crear proyecto → anotar → exportar → training → descargar paquete
- [ ] Verificar todos los idiomas

---

## 14. Archivos Clave del Proyecto (Mapa de Referencia)

```
src/lib/db.ts                                    ← Tipos (ProjectType, interfaces)
src/App.tsx                                      ← Routing por tipo

src/features/projects/
├── components/
│   ├── ProjectTypeSelector.tsx                  ← Selector con categorías + iconos
│   ├── CreateProjectDialog.tsx                  ← Diálogo de creación + wizard
│   └── ProjectTypeWizard.tsx                    ← Asistente de recomendación
└── data/
    └── wizardConfig.ts                          ← Config del wizard + PROJECT_TYPE_META

src/features/canvas/
├── config/toolsConfig.ts                        ← Mapeo ProjectType → Tools
├── handlers/                                    ← 6 handlers de anotación
├── components/renderers/                        ← 6 renderers Konva
└── components/AnnotationCanvas.tsx              ← Canvas principal

src/features/export/
└── utils/formatMapping.ts                       ← Mapeo ProjectType → Export Formats

src-tauri/src/export/                            ← Exportadores Rust (1 por formato)
src-tauri/src/import/                            ← Importadores Rust + auto-detección

src-tauri/src/training/
├── backends.rs                                  ← Definición de 18 backends + modelos
├── scripts.rs                                   ← Generación de scripts Python
├── dataset.rs                                   ← Preparación de datasets
├── runner.rs                                    ← Ejecución + monitoreo
├── notebook.rs                                  ← Conversión a Jupyter
├── package.rs                                   ← ZIP descargable
├── python_env.rs                                ← Gestión del venv
└── mod.rs                                       ← Tipos compartidos

src/features/settings/
├── data/
│   ├── backendsData.ts                          ← Catálogo UI (18 backends, 144 modelos)
│   └── defaultParams.ts                         ← Parámetros + defaults por backend
└── components/training-models/                  ← UI de exploración de modelos

src/features/training/
├── types.ts                                     ← Tipos TypeScript (TrainingRequest, etc.)
└── utils/presets.ts                             ← Presets de escenario YOLO

public/locales/{de,en,es,fr,it,ja,ko,pt,ru,zh}.json  ← i18n (10 idiomas)
```

---

## 15. Convenciones

1. **IDs**: siempre `string` (UUID v4) en todo el stack
2. **Nombres de tipo**: kebab-case en `ProjectType` (`multi-label-classification`), snake_case en tasks de backend (`multi_classify`)
3. **Iconos**: FontAwesome 6 Solid (`fas fa-*`)
4. **Colores**: Tailwind `bg-{color}-100 text-{color}-600`
5. **i18n**: `project.types.{type}.name/description`, `wizard.questions.{qId}.*`
6. **Cache**: `with_project(id, |pf| ...)` lectura, `with_project_mut(id, |pf| ...)` escritura
7. **Training IO**: `store::io::read/write_project` directamente desde threads de training
8. **Comunicación Python→Rust**: `ANNOTIX_EVENT:{json}` en stdout
9. **Eventos Tauri→Frontend**: `training:progress`, `training:completed`, `training:error`, `export:progress`
