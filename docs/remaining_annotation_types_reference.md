# Backends de Entrenamiento — Tipos Restantes de Anotación
## Referencia Completa: Polygon, Keypoints, Landmarks, OBB, Clasificación, Series Temporales

Cubre todos los tipos de anotación de tu app que NO fueron cubiertos en los documentos anteriores (detección de objetos con bbox, y segmentación semántica con mask).

**Documentos anteriores:**
- `training_backends_reference.md` → **bbox** (RT-DETR, RF-DETR, MMDetection)
- `segmentation_backends_reference.md` → **mask** (SMP, HuggingFace, MMSegmentation)

**Este documento cubre:**
1. **polygon** → Segmentación de Instancias
2. **keypoints** → Estimación de Pose / Puntos Clave
3. **landmarks** → Landmarks Faciales / Puntos de Referencia
4. **obb** → Oriented Bounding Boxes (cajas rotadas)
5. **classification** → Clasificación de Imagen
6. **multi-label-classification** → Clasificación Multi-etiqueta
7. **Series Temporales (9 tipos)** → Forecasting, Clasificación, Anomalías, etc.

---

# PARTE A — ANOTACIONES EN IMÁGENES

---

## 1. Polygon → Segmentación de Instancias

### 1.1 Qué es

A diferencia de la segmentación semántica (mask) donde cada píxel tiene una clase pero no se distinguen instancias individuales, la **segmentación de instancias** detecta cada objeto individual con su contorno preciso (polígono). El output es: clase + bounding box + máscara/polígono por cada instancia detectada.

**Tu app genera polígonos** → estos se convierten directamente al formato COCO JSON (`"segmentation": [[x1,y1,x2,y2,...]]`), que es el estándar universal.

### 1.2 Formato de Anotación

**COCO Instance Segmentation JSON (estándar universal):**

```json
{
  "images": [
    {"id": 1, "file_name": "img_001.jpg", "width": 640, "height": 480}
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "segmentation": [[210.5, 100.2, 230.1, 105.3, 245.0, 120.8, ...]],
      "area": 1250.5,
      "bbox": [200.0, 95.0, 60.0, 45.0],
      "iscrowd": 0
    }
  ],
  "categories": [
    {"id": 1, "name": "car", "supercategory": "vehicle"}
  ]
}
```

- `segmentation`: Lista de polígonos. Cada polígono es una lista plana `[x1,y1,x2,y2,...,xn,yn]`
- `bbox`: Bounding box derivado del polígono `[x, y, width, height]`
- `area`: Área del polígono en píxeles²
- `iscrowd`: 0 = polígono normal, 1 = RLE para crowds

**YOLO Segmentation TXT (alternativa para Ultralytics):**

```
# class_id x1 y1 x2 y2 ... xn yn (normalizado 0-1)
0 0.328 0.208 0.359 0.219 0.383 0.252 ...
1 0.150 0.400 0.200 0.450 0.180 0.500 ...
```

**Desde tu app Rust:**

```rust
// Cada polígono es Vec<(f64, f64)> con coordenadas absolutas
fn export_coco_segmentation(polygons: &[AnnotatedPolygon]) -> serde_json::Value {
    // Aplanar cada polígono a [x1,y1,x2,y2,...] 
    // Calcular bbox como min/max del polígono
    // Calcular area con fórmula del Shoelace
}
```

### 1.3 Frameworks

| Framework | Modelo Principal | mAP (COCO) | Velocidad | Notas |
|-----------|-----------------|------------|-----------|-------|
| **Ultralytics YOLO** | YOLO26-seg, YOLO11-seg | ~44-46% mask | Muy rápido | El más fácil de usar |
| **Detectron2** | Mask R-CNN, Mask2Former | ~40-56% | Medio-Lento | Facebook Research, SOTA |
| **MMDetection** | Mask R-CNN, Mask2Former, SOLOv2 | ~40-56% | Variable | OpenMMLab, más modelos |
| **RF-DETR Seg** | RF-DETR Segmentation | ~47%+ | Rápido | Roboflow, nuevo SOTA RT |
| **torchvision** | Mask R-CNN (ResNet-50-FPN) | ~37% | Medio | Incluido en PyTorch |

---

#### 1.3.1 Ultralytics YOLO Segmentation

**Instalación:** `pip install ultralytics`

**Entrenamiento:**

```python
from ultralytics import YOLO

model = YOLO("yolo11n-seg.pt")  # nano, small, medium, large, xlarge
results = model.train(
    data="my_dataset.yaml",
    epochs=100,
    imgsz=640,
    batch=16,
    lr0=0.01,
    lrf=0.01,
    optimizer="AdamW",
    device=0,
)
```

**Dataset YAML:**

```yaml
path: /path/to/dataset
train: images/train
val: images/val
names:
  0: car
  1: person
  2: bicycle
```

Las anotaciones van en formato YOLO-seg TXT (una línea por instancia con clase + polígono normalizado).

**Exportar ONNX:**

```python
model = YOLO("runs/segment/train/weights/best.pt")
model.export(format="onnx", dynamic=True, simplify=True)
```

**Output ONNX:** `(batch, 116, num_detections)` + proto masks `(batch, 32, mask_h, mask_w)`. Requiere post-proceso complejo (NMS + mask assembly).

**Hiperparámetros clave:** Idénticos a YOLO detección — `epochs=100-300`, `imgsz=640`, `lr0=0.01`, `batch=16`, `optimizer=AdamW`.

---

#### 1.3.2 Detectron2 (Facebook Research)

**Instalación:**

```bash
pip install 'git+https://github.com/facebookresearch/detectron2.git'
# O para CUDA específico:
pip install detectron2 -f https://dl.fbaipublicfiles.com/detectron2/wheels/cu118/torch2.0/index.html
```

**Modelos disponibles:**
- **Mask R-CNN** (R50-FPN, R101-FPN, X101-FPN): El clásico, bien balanceado
- **Mask2Former** (Swin-L): SOTA absoluto ~56% mAP
- **PointRend**: Bordes más precisos que Mask R-CNN
- **Cascade Mask R-CNN**: Mayor precisión que Mask R-CNN básico

**Entrenamiento con dataset COCO custom:**

```python
from detectron2.config import get_cfg
from detectron2.engine import DefaultTrainer
from detectron2 import model_zoo
from detectron2.data import DatasetCatalog, MetadataCatalog
from detectron2.data.datasets import register_coco_instances

# Registrar dataset
register_coco_instances("my_train", {}, "annotations/train.json", "images/train")
register_coco_instances("my_val", {}, "annotations/val.json", "images/val")

cfg = get_cfg()
cfg.merge_from_file(model_zoo.get_config_file(
    "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
))
cfg.DATASETS.TRAIN = ("my_train",)
cfg.DATASETS.TEST = ("my_val",)
cfg.DATALOADER.NUM_WORKERS = 4
cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url(
    "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
)
cfg.SOLVER.IMS_PER_BATCH = 4
cfg.SOLVER.BASE_LR = 0.0025
cfg.SOLVER.MAX_ITER = 10000
cfg.SOLVER.STEPS = (7000, 9000)
cfg.MODEL.ROI_HEADS.NUM_CLASSES = 3  # tus clases
cfg.OUTPUT_DIR = "./output"

trainer = DefaultTrainer(cfg)
trainer.resume_or_load(resume=False)
trainer.train()
```

**Exportar ONNX:** Vía `detectron2.export` o `torch.onnx.export` con wrapper. Detectron2 no tiene export nativo tan limpio; se recomienda usar scripting o tracing.

**Hiperparámetros:**

| Parámetro | Default | Rango | Notas |
|-----------|---------|-------|-------|
| BASE_LR | 0.0025 | 0.001-0.01 | Escalar por batch size |
| MAX_ITER | 10000 | 5000-50000 | Depende del dataset |
| IMS_PER_BATCH | 4 | 2-8 | Por VRAM |
| STEPS | (7000, 9000) | ~70%, 90% de MAX_ITER | LR decay steps |
| ROI_HEADS.BATCH_SIZE_PER_IMAGE | 512 | 128-512 | Proposals por imagen |
| ANCHOR_GENERATOR.SIZES | [[32,64,128,256,512]] | | Tamaños de anchor |

---

#### 1.3.3 MMDetection (Instance Segmentation)

Mismo framework que para detección de objetos (tu primer doc), pero con modelos de segmentación de instancias.

**Modelos adicionales para instance seg:**

| Modelo | Config | mAP mask | Notas |
|--------|--------|----------|-------|
| Mask R-CNN | `mask-rcnn_r50_fpn` | ~35% | Clásico |
| Cascade Mask R-CNN | `cascade-mask-rcnn_r50_fpn` | ~37% | Más preciso |
| SOLOv2 | `solov2_r50_fpn` | ~38% | Sin anchor, sin NMS |
| Mask2Former | `mask2former_swin-l` | ~50%+ | SOTA |
| QueryInst | `queryinst_r50_fpn` | ~40% | Query-based |
| CondInst | `condinst_r50_fpn` | ~35% | Conditional |
| HTC | `htc_r50_fpn` | ~39% | Hybrid Task Cascade |

La instalación, formato de datos (COCO JSON), y entrenamiento siguen exactamente el mismo patrón que MMDetection para bbox (tu primer documento), solo cambiando el config file por uno de segmentación.

---

## 2. Keypoints → Estimación de Pose

### 2.1 Qué es

Detecta puntos clave anatómicos (articulaciones, etc.) en personas, animales u objetos. El output es un conjunto de coordenadas (x, y) + confianza para cada keypoint definido en un esqueleto.

### 2.2 Formato de Anotación

**COCO Keypoints JSON (estándar):**

```json
{
  "images": [...],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "keypoints": [
        229, 256, 2,   // x, y, visibility (0=no, 1=ocluido, 2=visible)
        252, 235, 2,   // nariz
        267, 240, 1,   // ojo izquierdo (ocluido)
        ...            // 17 keypoints para COCO person
      ],
      "num_keypoints": 15,
      "bbox": [200, 220, 120, 300],
      "area": 25000
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "person",
      "supercategory": "person",
      "keypoints": ["nose", "left_eye", "right_eye", "left_ear", "right_ear",
                     "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
                     "left_wrist", "right_wrist", "left_hip", "right_hip",
                     "left_knee", "right_knee", "left_ankle", "right_ankle"],
      "skeleton": [[16,14],[14,12],[17,15],[15,13],[12,13],[6,12],[7,13],
                    [6,7],[6,8],[7,9],[8,10],[9,11],[2,3],[1,2],[1,3],[2,4],[3,5]]
    }
  ]
}
```

- `keypoints`: Array plano de `[x1,y1,v1, x2,y2,v2, ...]` con 3 valores por punto
- `visibility`: 0 = no etiquetado, 1 = etiquetado pero ocluido, 2 = etiquetado y visible
- `skeleton`: Pares de índices que definen las conexiones del esqueleto
- El esqueleto es **personalizable** — puedes definir cualquier conjunto de keypoints

**YOLO Pose TXT (Ultralytics):**

```
# class_id cx cy w h x1 y1 v1 x2 y2 v2 ... (normalizado 0-1)
0 0.5 0.4 0.3 0.6 0.45 0.2 2 0.48 0.19 2 0.52 0.19 2 ...
```

**Desde tu app Rust:**

```rust
struct KeypointAnnotation {
    class_id: u32,
    bbox: [f64; 4],          // x, y, w, h
    keypoints: Vec<(f64, f64, u8)>,  // (x, y, visibility)
}
// Exportar como COCO Keypoints JSON
```

### 2.3 Frameworks

| Framework | Modelos Principales | AP (COCO) | Velocidad | Notas |
|-----------|-------------------|-----------|-----------|-------|
| **Ultralytics YOLO-Pose** | YOLO11-pose, YOLO26-pose | ~50-57% | Muy rápido | Single-stage, el más simple |
| **MMPose** | RTMPose, HRNet, ViTPose | ~55-81% | Variable | El más completo |
| **HuggingFace** | ViTPose, ViTPose++ | ~75-81% | Medio | Fácil fine-tuning |

---

#### 2.3.1 Ultralytics YOLO Pose

**Instalación:** `pip install ultralytics`

**Entrenamiento:**

```python
from ultralytics import YOLO

model = YOLO("yolo11n-pose.pt")  # n/s/m/l/x
results = model.train(
    data="my_keypoints.yaml",
    epochs=100,
    imgsz=640,
    batch=16,
)
```

**Dataset YAML:**

```yaml
path: /path/to/dataset
train: images/train
val: images/val
kpt_shape: [17, 3]  # [num_keypoints, dims] — dims=3 si incluye visibility
flip_idx: [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15]
names:
  0: person
```

- `kpt_shape`: Personalizable. Para un esqueleto custom de 10 puntos: `[10, 3]`
- `flip_idx`: Mapeo de keypoints para augmentation horizontal flip

**Exportar ONNX:**

```python
model.export(format="onnx", dynamic=True, simplify=True)
```

**Output ONNX:** `(batch, 56, num_detections)` — incluye bbox(4) + conf(1) + class(1) + keypoints(17×3=51). Post-proceso: NMS + reshape keypoints.

---

#### 2.3.2 MMPose (OpenMMLab)

El framework más completo para pose estimation. 

**Instalación:**

```bash
pip install -U openmim
mim install "mmengine>=0.6.0"
mim install "mmcv>=2.0.0rc4"
mim install "mmpose>=1.0.0"
mim install "mmdet>=3.0.0"    # para detección de personas (top-down)
```

**Modelos principales:**

| Modelo | Enfoque | AP (COCO) | FPS | Notas |
|--------|---------|-----------|-----|-------|
| **RTMPose-t/s/m/l** | Top-down | 67-76% | 90-400+ | Tiempo real, ideal producción |
| **HRNet-w32/w48** | Top-down | 74-76% | ~30 | Alta resolución, preciso |
| **ViTPose-B/L/H** | Top-down | 76-81% | ~20-40 | SOTA con ViT |
| **ViTPose++** | Top-down | ~81% | ~20 | SOTA absoluto, MoE |
| **SimpleBaseline** | Top-down | ~71-73% | ~50 | Baseline sólido |
| **DEKR** | Bottom-up | ~68% | ~30 | Sin detector previo |
| **CID** | Bottom-up | ~70% | ~20 | Contextual, sin detector |
| **LiteHRNet** | Top-down | ~65% | Alto | Ultra ligero, edge |

**Tipos de pose soportados:**
- Body (17 kpts COCO, 16 kpts MPII)
- Whole-body (133 kpts: body + face + hands + feet)
- Hand (21 kpts)
- Face (68/98 kpts)
- Animal (varias especies)
- Fashion landmarks

**Entrenamiento custom:**

```bash
# Descargar config
mim download mmpose --config rtmpose-m_8xb256-420e_coco-256x192 --dest checkpoints

# Entrenar con config custom
python tools/train.py mi_pose_config.py
```

**Config custom (mi_pose_config.py):**

```python
_base_ = ['mmpose/configs/body_2d_keypoint/rtmpose/coco/rtmpose-m_8xb256-420e_coco-256x192.py']

# Dataset custom
dataset_type = 'CocoDataset'
data_root = '/path/to/my_dataset/'

# Definir tu esqueleto custom
dataset_info = dict(
    dataset_name='my_custom_pose',
    keypoint_info={
        0: dict(name='point_a', id=0, color=[255, 0, 0], swap='point_b'),
        1: dict(name='point_b', id=1, color=[0, 255, 0], swap='point_a'),
        # ... más keypoints
    },
    skeleton_info={
        0: dict(link=('point_a', 'point_b'), id=0, color=[255, 255, 0]),
    },
)

model = dict(
    head=dict(
        out_channels=10,  # tu número de keypoints
    ),
)
```

**ONNX Export:** Vía MMDeploy (idéntico a MMSegmentation).

```bash
python tools/deploy.py \
    deploy_cfg.py mi_pose_config.py checkpoint.pth test_img.jpg \
    --work-dir onnx_output
```

**Output ONNX (top-down):**
- Input: `(batch, 3, 256, 192)` persona recortada y normalizada
- Output: Heatmaps `(batch, num_keypoints, 64, 48)` o coordenadas directas
- Post-proceso: Encontrar pico en cada heatmap → coordenada (x,y)

---

#### 2.3.3 HuggingFace ViTPose

**Instalación:**

```bash
pip install transformers torch torchvision
```

**Inferencia / Fine-tuning:**

```python
from transformers import VitPoseForPoseEstimation, VitPoseImageProcessor

processor = VitPoseImageProcessor.from_pretrained("usyd-community/vitpose-base-simple")
model = VitPoseForPoseEstimation.from_pretrained("usyd-community/vitpose-base-simple")

# Fine-tuning requiere preparar dataset COCO keypoints y training loop manual
# HuggingFace Trainer no soporta directamente pose — usar PyTorch loop
```

**Checkpoints disponibles:**
- `usyd-community/vitpose-base-simple` (ViT-B, COCO 17kpts)
- `usyd-community/vitpose-plus-base` (ViTPose++, multi-dataset)
- Variantes: small, base, large, huge

**Nota:** ViTPose en HuggingFace aún no tiene training support nativo. Para fine-tuning completo, usar MMPose es más práctico.

---

## 3. Landmarks → Puntos de Referencia

### 3.1 Qué es

Landmarks son conceptualmente idénticos a keypoints pero el término se usa típicamente para:
- **Facial landmarks** (68, 98, o 106 puntos en la cara)
- **Fashion landmarks** (puntos en ropa)
- **Landmarks genéricos** en objetos (ej: esquinas de un PCB, puntos de un producto)

El formato de anotación es **exactamente igual** al de keypoints (COCO format con `keypoints` array).

### 3.2 Frameworks

**Los mismos que keypoints, pero con configuraciones especializadas:**

| Framework | Uso para Landmarks | Modelos específicos |
|-----------|-------------------|-------------------|
| **MMPose** | Face landmarks | WFLW (98 kpts), 300W (68 kpts), COCO-WholeBody face |
| **MMPose** | Fashion landmarks | DeepFashion (8 kpts upper, 14 lower) |
| **Ultralytics YOLO-Pose** | Custom landmarks | Configurable via `kpt_shape` |
| **InsightFace** | Face landmarks | 5-point, 68-point, 106-point face alignment |
| **dlib** | Face landmarks | 68-point predictor (shape_predictor) |
| **MediaPipe** | Face mesh | 468 puntos faciales (solo inferencia, no entrena) |

### 3.3 Entrenamiento Custom

Para landmarks personalizados, usa exactamente el mismo pipeline que keypoints:

**Con YOLO-Pose:**

```yaml
# dataset.yaml para landmarks de un producto con 6 puntos
kpt_shape: [6, 3]  # 6 landmarks, con visibility
flip_idx: [1, 0, 3, 2, 5, 4]  # pares simétricos para flip augmentation
names:
  0: product
```

**Con MMPose:** Definir `dataset_info` con tus landmarks personalizados (ver sección 2.3.2).

**Recomendación:** Para landmarks faciales, usa los configs predefinidos de MMPose (WFLW, 300W). Para landmarks custom, YOLO-Pose es lo más directo.

---

## 4. OBB → Oriented Bounding Boxes

### 4.1 Qué es

Cajas delimitadoras rotadas que se ajustan a la orientación del objeto. Útil para: imágenes aéreas/satelitales, detección de texto, objetos en escenas rotadas, vehículos vistos desde arriba.

### 4.2 Formato de Anotación

**DOTA Format (estándar para OBB):**

```
# x1 y1 x2 y2 x3 y3 x4 y4 category difficulty
288 192 413 197 406 276 281 271 car 0
```

Cada OBB se define por 4 puntos (esquinas) en orden. Alternativamente: `cx, cy, w, h, angle`.

**YOLO OBB TXT:**

```
# class_id x1 y1 x2 y2 x3 y3 x4 y4 (normalizado 0-1)
0 0.45 0.40 0.65 0.42 0.63 0.58 0.43 0.56
```

**Desde tu app Rust:**

```rust
struct OBBAnnotation {
    class_id: u32,
    // 4 esquinas del rectángulo rotado
    corners: [(f64, f64); 4],  // (x1,y1), (x2,y2), (x3,y3), (x4,y4)
    // O alternativamente:
    // center: (f64, f64), size: (f64, f64), angle: f64
}
```

### 4.3 Frameworks

| Framework | Modelos | mAP (DOTA v1.0) | Velocidad | Notas |
|-----------|---------|-----------------|-----------|-------|
| **Ultralytics YOLO-OBB** | YOLO26-obb, YOLO11-obb | ~78-80% | Muy rápido | El más fácil |
| **MMRotate** | Oriented R-CNN, R3Det, S2A-Net, ReDet | ~75-80% | Variable | El más completo, OpenMMLab |

---

#### 4.3.1 Ultralytics YOLO OBB

**Instalación:** `pip install ultralytics`

**Entrenamiento:**

```python
from ultralytics import YOLO

model = YOLO("yolo11n-obb.pt")  # n/s/m/l/x
results = model.train(
    data="my_obb_dataset.yaml",
    epochs=100,
    imgsz=1024,       # OBB típicamente usa imágenes más grandes
    batch=8,
)
```

**Dataset YAML:**

```yaml
path: /path/to/dataset
train: images/train
val: images/val
names:
  0: plane
  1: ship
  2: storage-tank
  3: vehicle
```

Labels en TXT con 4 esquinas normalizadas por línea.

**Exportar ONNX:**

```python
model.export(format="onnx", dynamic=True, simplify=True)
```

**Output ONNX:** `(batch, 20, num_detections)` — incluye las 4 esquinas + clase + conf. Ángulos están restringidos a 0-90°.

**Hiperparámetros:** Similares a detección estándar pero `imgsz=1024` es más común para imágenes aéreas.

---

#### 4.3.2 MMRotate (OpenMMLab)

**Instalación:**

```bash
pip install -U openmim
mim install mmengine mmcv
mim install mmdet
pip install mmrotate
```

**Nota:** MMRotate está en mantenimiento reducido desde 2023. Para nuevos proyectos, se recomienda YOLO-OBB o usar MMDetection 3.x con soporte OBB integrado.

**Modelos disponibles:**

| Modelo | mAP (DOTA v1.0) | Notas |
|--------|-----------------|-------|
| Oriented R-CNN (R50-FPN) | ~75% | Buen balance |
| ReDet (ReR50-ReFPN) | ~76% | Rotation-equivariant |
| S2A-Net (R50-FPN) | ~74% | Single-shot, rápido |
| R3Det (R50-FPN) | ~71% | Feature refinement |
| Rotated FCOS | ~73% | Anchor-free |
| CSL (R50-FPN) | ~68% | Classification angle |
| Oriented RepPoints | ~76% | Point-based |
| KFIoU | ~75% | IoU-based loss |

**Entrenamiento:**

```bash
python tools/train.py configs/oriented_rcnn/oriented-rcnn_r50_fpn_1x_dota_le90.py
```

**ONNX Export:** Vía MMDeploy con config de rotated detection.

---

## 5. Classification → Clasificación de Imagen

### 5.1 Qué es

Asignar una etiqueta (clase) a toda la imagen. El tipo de anotación más simple: una imagen → una clase.

### 5.2 Formato de Anotación

**ImageFolder (el más simple y universal):**

```
dataset/
├── train/
│   ├── cat/
│   │   ├── img_001.jpg
│   │   ├── img_002.jpg
│   │   └── ...
│   ├── dog/
│   │   ├── img_100.jpg
│   │   └── ...
│   └── bird/
│       └── ...
└── val/
    ├── cat/
    ├── dog/
    └── bird/
```

Simplemente organiza imágenes en carpetas con nombre de la clase. Todos los frameworks lo soportan.

**CSV / JSON alternativo:**

```csv
image_path,label
images/img_001.jpg,cat
images/img_002.jpg,dog
```

**Desde tu app Rust:**

```rust
// Exportar: mover/copiar imágenes a carpetas por clase
fn export_classification(annotations: &[ImageLabel], output_dir: &Path) {
    for ann in annotations {
        let class_dir = output_dir.join(&ann.split).join(&ann.class_name);
        std::fs::create_dir_all(&class_dir).ok();
        std::fs::copy(&ann.image_path, class_dir.join(&ann.filename)).ok();
    }
}
```

### 5.3 Frameworks

| Framework | Modelos | Top-1 (ImageNet) | Velocidad | Notas |
|-----------|---------|-------------------|-----------|-------|
| **timm** | 1000+ modelos | Hasta ~91%+ | Variable | El más completo, PyTorch |
| **HuggingFace Transformers** | ViT, DeiT, BEiT, Swin, ConvNeXt | Hasta ~90%+ | Variable | Fine-tune fácil con Trainer |
| **Ultralytics YOLO-cls** | YOLO11-cls | ~83% | Muy rápido | El más simple |
| **torchvision** | ResNet, EfficientNet, ViT, ConvNeXt | Hasta ~85%+ | Variable | Incluido en PyTorch |

---

#### 5.3.1 timm (PyTorch Image Models)

La librería de referencia para clasificación. 1000+ modelos con pesos preentrenados.

**Instalación:** `pip install timm torch torchvision`

**Modelos principales para fine-tuning:**

| Modelo | Top-1 ImageNet | Params | Velocidad | Uso recomendado |
|--------|---------------|--------|-----------|-----------------|
| `mobilenetv3_large_100` | ~75% | 5.5M | Muy rápido | Edge/mobile |
| `efficientnet_b0` | ~77% | 5.3M | Rápido | Balance ligero |
| `resnet50` | ~80% | 25.6M | Medio | Baseline sólido |
| `efficientnet_b3` | ~82% | 12M | Medio | Buen balance |
| `convnext_tiny` | ~82% | 28.6M | Medio | CNN moderno |
| `vit_base_patch16_224` | ~85% | 86M | Medio | Transformer |
| `swin_base_patch4_window7_224` | ~84% | 88M | Medio | Swin Transformer |
| `eva02_large_patch14_448` | ~90%+ | 304M | Lento | SOTA |

**Entrenamiento:**

```python
import timm
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

# 1. Crear modelo con cabeza custom
model = timm.create_model(
    "efficientnet_b3",
    pretrained=True,
    num_classes=10,        # tu número de clases
)

# 2. Data (ImageFolder)
data_config = timm.data.resolve_model_data_config(model)
transform_train = timm.data.create_transform(**data_config, is_training=True)
transform_val = timm.data.create_transform(**data_config, is_training=False)

train_dataset = datasets.ImageFolder("dataset/train", transform=transform_train)
val_dataset = datasets.ImageFolder("dataset/val", transform=transform_val)

train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True, num_workers=4)
val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False, num_workers=4)

# 3. Entrenamiento
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=0.01)
criterion = nn.CrossEntropyLoss()
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=30)

device = torch.device("cuda")
model.to(device)

for epoch in range(30):
    model.train()
    for images, labels in train_loader:
        images, labels = images.to(device), labels.to(device)
        outputs = model(images)
        loss = criterion(outputs, labels)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    scheduler.step()
```

**O usar el script de entrenamiento incluido en timm:**

```bash
python train.py /path/to/dataset \
    --model efficientnet_b3 \
    --pretrained \
    --num-classes 10 \
    --epochs 30 \
    --batch-size 32 \
    --lr 1e-4 \
    --opt adamw \
    --sched cosine \
    --amp
```

**Exportar ONNX:**

```python
model.eval()
dummy = torch.randn(1, 3, 300, 300)  # input_size del modelo
torch.onnx.export(model, dummy, "classifier.onnx",
    input_names=["input"], output_names=["logits"],
    dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
    opset_version=17)
```

**Output ONNX:**
- Input: `(batch, 3, H, W)` normalizado con stats del modelo
- Output: `(batch, num_classes)` logits
- Post-proceso: `softmax → argmax` para clase, o `softmax` para probabilidades

**Hiperparámetros:**

| Parámetro | Recomendado | Rango | Notas |
|-----------|-------------|-------|-------|
| lr | 1e-4 (AdamW) | 5e-5 a 5e-4 | Para fine-tuning |
| epochs | 30 | 10-100 | Con pretrained, converge rápido |
| batch_size | 32 | 8-128 | Según VRAM |
| weight_decay | 0.01 | 0.0-0.05 | Regularización |
| scheduler | Cosine | Cosine, Step | Cosine más usado |
| img_size | Depende del modelo | 224-448 | Revisar `data_config` |
| augmentation | RandAugment, Mixup | | timm tiene todo integrado |
| label_smoothing | 0.1 | 0.0-0.2 | Regulariza predicciones |

---

#### 5.3.2 HuggingFace Transformers (Clasificación)

**Instalación:** `pip install transformers datasets evaluate torch`

**Entrenamiento:**

```python
from transformers import AutoModelForImageClassification, AutoImageProcessor
from transformers import TrainingArguments, Trainer
from datasets import load_dataset
import evaluate
import numpy as np

# Dataset
dataset = load_dataset("imagefolder", data_dir="dataset/")
# Automáticamente detecta train/val por carpetas

processor = AutoImageProcessor.from_pretrained("google/vit-base-patch16-224")

def transform(examples):
    examples["pixel_values"] = [processor(img.convert("RGB"), return_tensors="pt")["pixel_values"][0]
                                 for img in examples["image"]]
    return examples

dataset = dataset.with_transform(transform)

model = AutoModelForImageClassification.from_pretrained(
    "google/vit-base-patch16-224",
    num_labels=10,
    ignore_mismatched_sizes=True,
)

metric = evaluate.load("accuracy")
def compute_metrics(eval_pred):
    preds = np.argmax(eval_pred.predictions, axis=-1)
    return metric.compute(predictions=preds, references=eval_pred.label_ids)

training_args = TrainingArguments(
    output_dir="vit-finetuned",
    num_train_epochs=10,
    per_device_train_batch_size=16,
    learning_rate=2e-5,
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    fp16=True,
)

trainer = Trainer(model=model, args=training_args,
                  train_dataset=dataset["train"], eval_dataset=dataset["validation"],
                  compute_metrics=compute_metrics)
trainer.train()
```

**Checkpoints populares:**
- `google/vit-base-patch16-224`, `google/vit-large-patch16-224`
- `facebook/convnext-base-224`, `facebook/convnext-large-224`
- `microsoft/swin-base-patch4-window7-224`
- `facebook/deit-base-distilled-patch16-224`
- `microsoft/beit-base-patch16-224`

---

#### 5.3.3 Ultralytics YOLO Classification

**La opción más simple de todas:**

```python
from ultralytics import YOLO

model = YOLO("yolo11n-cls.pt")  # n/s/m/l/x
results = model.train(data="dataset/", epochs=30, imgsz=224)
model.export(format="onnx")
```

Dataset: estructura ImageFolder estándar. Sin configuración adicional.

---

## 6. Multi-Label Classification → Clasificación Multi-etiqueta

### 6.1 Qué es

Cada imagen puede tener **múltiples etiquetas** simultáneamente (ej: una foto puede ser "outdoor", "sunny", "people", "dogs" todo a la vez).

### 6.2 Formato de Anotación

**CSV (más directo):**

```csv
image_path,outdoor,sunny,people,dogs,cars
img_001.jpg,1,1,1,0,0
img_002.jpg,0,0,0,1,1
img_003.jpg,1,0,1,1,0
```

**JSON alternativo:**

```json
[
  {"image": "img_001.jpg", "labels": ["outdoor", "sunny", "people"]},
  {"image": "img_002.jpg", "labels": ["dogs", "cars"]}
]
```

**Desde tu app Rust:**

```rust
struct MultiLabelAnnotation {
    image_path: String,
    labels: Vec<String>,  // múltiples etiquetas por imagen
}
// Exportar como CSV con columnas binarias o JSON con lista de labels
```

### 6.3 Frameworks

Se usan los **mismos frameworks que clasificación** pero con cambios clave:

| Aspecto | Single-label | Multi-label |
|---------|-------------|-------------|
| Última capa | Softmax | Sigmoid (por clase) |
| Loss | CrossEntropyLoss | BCEWithLogitsLoss |
| Activación output | softmax → argmax (1 clase) | sigmoid → threshold (múltiples) |
| Threshold | N/A | 0.5 (ajustable por clase) |

### 6.4 Entrenamiento con timm

```python
import timm
import torch
import torch.nn as nn

# Modelo con sigmoid output
model = timm.create_model("efficientnet_b3", pretrained=True, num_classes=20)

# Loss: BCE, NO CrossEntropy
criterion = nn.BCEWithLogitsLoss()

# En el training loop:
outputs = model(images)           # (B, 20) logits
labels_onehot = labels.float()    # (B, 20) one-hot float
loss = criterion(outputs, labels_onehot)

# Inferencia:
probs = torch.sigmoid(outputs)    # (B, 20) probabilidades
predictions = (probs > 0.5).int() # (B, 20) predicciones binarias
```

**Dataset custom:**

```python
class MultiLabelDataset(torch.utils.data.Dataset):
    def __init__(self, csv_path, img_dir, transform, num_classes):
        self.df = pd.read_csv(csv_path)
        self.img_dir = img_dir
        self.transform = transform
        self.num_classes = num_classes
        self.label_cols = self.df.columns[1:]  # columnas de labels
        
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        image = Image.open(os.path.join(self.img_dir, row["image_path"])).convert("RGB")
        image = self.transform(image)
        labels = torch.tensor(row[self.label_cols].values.astype(float), dtype=torch.float32)
        return image, labels
```

**Métricas:** mAP (mean Average Precision), F1 por clase, Hamming Loss, Subset Accuracy.

**ONNX Export:** Idéntico a clasificación single-label. Output: `(batch, num_classes)` logits → aplicar sigmoid en Rust.

---

# PARTE B — SERIES TEMPORALES

---

## 7. Series Temporales — Visión General

Tus 9 tipos de series temporales comparten frameworks y modelos comunes. La diferencia principal está en cómo se formula la tarea (cabeza del modelo, loss function, formato de datos).

### 7.1 Frameworks Principales

| Framework | Tareas Soportadas | Modelos | Backend | Notas |
|-----------|------------------|---------|---------|-------|
| **tsai** | Clasificación, Regresión, Forecasting, Imputation | PatchTST, InceptionTime, TST, LSTM, GRU, etc. | PyTorch + fastai | El más completo para DL en TS |
| **pytorch-forecasting** | Forecasting | TFT, N-BEATS, NHiTS, DeepAR | PyTorch Lightning | Enfocado en forecasting |
| **GluonTS** | Forecasting, Anomaly Detection | DeepAR, Transformer, WaveNet | PyTorch/MXNet | Amazon, probabilístico |
| **Darts** | Forecasting, Anomaly Detection | TFT, N-BEATS, TCN, ARIMA, Prophet | PyTorch | Unificado, fácil de usar |
| **sktime** | Clasificación, Forecasting, Clustering, Anomaly | Rocket, HIVE-COTE, ML clásico + DL | sklearn-compatible | ML clásico + DL |
| **PyOD** | Anomaly Detection | AutoEncoder, VAE, ECOD, IForest, etc. | Varios | Especializado anomalías |
| **Flow Forecast** | Forecasting, Classification, Anomaly | Transformers, LSTM, GRU | PyTorch | Multi-tarea |
| **NeuralForecast** | Forecasting | NBEATS, NHITS, PatchTST, TimesNet | PyTorch | Nixtla, producción |

### 7.2 Formato de Datos Universal

Todas las tareas de series temporales comparten una estructura base:

```
# Formato tabular (CSV/Parquet)
timestamp, feature_1, feature_2, ..., feature_n, target
2024-01-01 00:00, 1.5, 3.2, ..., 0.8, class_A   # clasificación
2024-01-01 00:00, 1.5, 3.2, ..., 0.8, 42.5       # regresión/forecasting
2024-01-01 00:00, 1.5, 3.2, ..., 0.8, 0           # anomaly (0=normal, 1=anomalía)
```

**Para tsai (formato tensor):**

```python
# X: (num_samples, num_features, seq_length) — tensor 3D
# y: (num_samples,) para clasificación
# y: (num_samples, horizon) para forecasting
```

**Desde tu app Rust:**

```rust
struct TimeSeriesDataset {
    timestamps: Vec<DateTime<Utc>>,
    features: Vec<Vec<f64>>,      // (num_timestamps, num_features)
    labels: Vec<String>,          // o Vec<f64> para regresión
    metadata: DatasetMetadata,
}
// Exportar como CSV o Parquet (crate arrow2/polars)
```

---

### 7.3 tsai — El Framework Principal para DL en Series Temporales

**Instalación:**

```bash
pip install tsai
# O con todas las dependencias:
pip install tsai[extras]
```

**Modelos disponibles en tsai:**

| Modelo | Tipo | Año | Tareas | Notas |
|--------|------|-----|--------|-------|
| **PatchTST** | Transformer | 2023 | Forecasting, Classification | ICLR 2023, SOTA |
| **TSTPlus** | Transformer | 2020 | Todas | Adaptable a cualquier tarea |
| **InceptionTimePlus** | CNN | 2020 | Clasificación, Regresión | Muy rápido, competitivo |
| **TSiTPlus** | Transformer | 2022 | Clasificación | TS Image Transformer |
| **ROCKET/MiniRocket** | Random kernels | 2020 | Clasificación | Ultra rápido |
| **XceptionTimePlus** | CNN | 2020 | Clasificación, Regresión | Basado en Xception |
| **ResNetPlus** | CNN | 2019 | Clasificación | ResNet para TS |
| **LSTM/GRU/RNN** | RNN | — | Todas | Clásicos |
| **LSTMAttention** | RNN + Attention | — | Todas | LSTM mejorado |
| **TCN** | CNN | 2018 | Todas | Temporal Convolutional |
| **TabFusionTransformer** | Transformer | — | Todas | Fusión tabular + TS |
| **OmniScaleCNN** | CNN | 2022 | Clasificación | Multi-escala |

---

### 7.4 Tarea: Clasificación de Series Temporales (`timeseries-classification`)

**Objetivo:** Asignar una clase a cada secuencia temporal completa.

**Con tsai:**

```python
from tsai.all import *

# Cargar dataset UCR (128 datasets de benchmark)
dsid = 'ECG200'
X, y, splits = get_UCR_data(dsid, return_split=False)

# O datos propios:
# X shape: (num_samples, num_channels, seq_length)
# y shape: (num_samples,) con labels de clase

tfms = [None, TSCategorize()]
batch_tfms = TSStandardize(by_sample=True)

learn = TSClassifier(X, y, splits=splits, 
                     arch="InceptionTimePlus",
                     batch_tfms=batch_tfms,
                     metrics=accuracy,
                     bs=64)

learn.fit_one_cycle(25, 1e-3)
learn.export("ts_classifier.pkl")
```

**Modelos recomendados:** InceptionTimePlus (rápido), PatchTST (SOTA), ROCKET (ultra rápido para datasets grandes).

---

### 7.5 Tarea: Forecasting / Pronóstico (`timeseries-forecasting`)

**Objetivo:** Predecir valores futuros de una serie temporal.

**Con tsai:**

```python
from tsai.all import *

ts = get_forecasting_time_series("Sunspots").values
X, y = SlidingWindow(window_len=60, horizon=12)(ts)  # 60 pasos input, 12 pasos output
splits = TimeSplitter(valid_size=0.2)(y)

tfms = [None, TSForecasting()]
batch_tfms = TSStandardize()

fcst = TSForecaster(X, y, splits=splits,
                    arch="PatchTST",       # o TSTPlus, LSTMPlus, etc.
                    batch_tfms=batch_tfms,
                    metrics=mae,
                    bs=128)

fcst.fit_one_cycle(50, 1e-3)
```

**Con pytorch-forecasting (para datos tabulares complejos):**

```bash
pip install pytorch-forecasting pytorch-lightning
```

```python
from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
from pytorch_forecasting.data import NaNLabelEncoder

# Preparar datos en formato de panel (long format)
training = TimeSeriesDataSet(
    data_train,
    time_idx="time_idx",
    target="target_value",
    group_ids=["group"],
    max_encoder_length=60,
    max_prediction_length=12,
    time_varying_known_reals=["time_idx"],
    time_varying_unknown_reals=["target_value"],
)

train_dataloader = training.to_dataloader(batch_size=64, num_workers=4)

tft = TemporalFusionTransformer.from_dataset(
    training, learning_rate=0.03, hidden_size=16,
    attention_head_size=2, dropout=0.1,
    loss=QuantileLoss(),
)

trainer = pl.Trainer(max_epochs=30, accelerator="gpu")
trainer.fit(tft, train_dataloaders=train_dataloader)
```

**Modelos recomendados:**
- **PatchTST** (tsai): SOTA para forecasting univariado/multivariado
- **TFT** (pytorch-forecasting): Mejor para datos tabulares con covariables
- **N-BEATS / NHiTS** (NeuralForecast/Darts): Eficientes, interpretables

---

### 7.6 Tarea: Detección de Anomalías (`anomaly-detection`)

**Objetivo:** Identificar puntos o segmentos anómalos en una serie temporal.

**Enfoques principales:**
1. **Forecasting-based:** Predecir siguiente valor, marcar como anomalía si error > threshold
2. **Reconstruction-based:** Autoencoder reconstruye señal normal; alta reconstrucción error = anomalía
3. **Density-based:** Modelar distribución normal; outliers = anomalías

**Con PyOD (más simple):**

```bash
pip install pyod
```

```python
from pyod.models.auto_encoder import AutoEncoder
from pyod.models.vae import VAE
from pyod.models.ecod import ECOD

# X shape: (num_samples, num_features)
model = AutoEncoder(hidden_neurons=[64, 32, 16, 32, 64],
                    epochs=50, batch_size=32, contamination=0.05)
model.fit(X_train)
labels = model.predict(X_test)         # 0=normal, 1=anomalía
scores = model.decision_function(X_test)  # anomaly scores
```

**Con tsai (autoencoder):**

```python
from tsai.all import *

# Entrenar solo con datos normales
X_normal = ...  # (num_samples, num_features, seq_length)

# Usar TSRegressor con target = input (autoencoder)
learn = TSRegressor(X_normal, X_normal, splits=splits,
                    arch="TSTPlus", bs=64, metrics=mse)
learn.fit_one_cycle(30, 1e-3)

# Inferencia: calcular reconstruction error
preds = learn.get_preds(X_test)
errors = ((preds - X_test) ** 2).mean(dim=-1)
anomalies = errors > threshold
```

---

### 7.7 Tarea: Segmentación Temporal (`timeseries-segmentation`)

**Objetivo:** Dividir una serie temporal en segmentos con diferentes estados/regímenes.

**Similar a segmentación semántica pero en 1D:** Cada timestamp recibe una etiqueta de estado.

```python
# X: (num_samples, num_features, seq_length)
# y: (num_samples, seq_length) — una etiqueta por timestamp

from tsai.all import *

# Usar TSClassifier con output por timestamp
learn = TSClassifier(X, y, splits=splits,
                     arch="TSTPlus",
                     metrics=accuracy)
```

**Alternativa clásica:** Hidden Markov Models (HMM) con `hmmlearn`, change point detection con `ruptures`.

```bash
pip install ruptures hmmlearn
```

```python
import ruptures as rpt
signal = ...  # (seq_length, num_features)
algo = rpt.Pelt(model="rbf").fit(signal)
change_points = algo.predict(pen=10)
```

---

### 7.8 Tarea: Reconocimiento de Patrones (`pattern-recognition`)

**Objetivo:** Detectar patrones específicos (motifs) recurrentes en la serie temporal.

**Herramientas principales:**
- **Matrix Profile** (`stumpy`): Detección de motifs y discords
- **tsai clasificación**: Entrenar clasificador en ventanas deslizantes

```bash
pip install stumpy
```

```python
import stumpy
import numpy as np

ts = np.array([...])  # serie temporal 1D
mp = stumpy.stump(ts, m=100)  # matrix profile con ventana de 100

# Encontrar top-k motifs
motif_idx = np.argsort(mp[:, 0])[:3]  # 3 patrones más frecuentes

# Encontrar discords (anomalías)
discord_idx = np.argsort(mp[:, 0])[-3:]  # 3 más inusuales
```

---

### 7.9 Tarea: Detección de Eventos (`event-detection`)

**Objetivo:** Detectar cuándo ocurren eventos específicos dentro de una serie temporal.

**Enfoques:**
1. **Clasificación en ventana deslizante:** Clasificar cada ventana como "evento" / "no evento"
2. **Sequence labeling:** Etiquetar cada timestamp (similar a segmentación temporal)
3. **Change point detection:** Detectar cambios abruptos

Con tsai, se formula como clasificación de ventanas:

```python
from tsai.all import *

# Extraer ventanas con labels de evento
X, y = SlidingWindow(window_len=100, stride=10)(ts)
# y: 0=no_event, 1=event_type_A, 2=event_type_B

learn = TSClassifier(X, y, splits=splits,
                     arch="InceptionTimePlus",
                     metrics=accuracy)
learn.fit_one_cycle(25, 1e-3)
```

---

### 7.10 Tarea: Regresión Temporal (`timeseries-regression`)

**Objetivo:** Predecir un valor continuo a partir de una secuencia temporal (no un valor futuro, sino una propiedad).

**Ejemplo:** Dada una secuencia de sensores, predecir la vida útil restante (RUL) de un componente.

```python
from tsai.all import *

# X: (num_samples, num_features, seq_length)
# y: (num_samples,) — valor continuo target

learn = TSRegressor(X, y, splits=splits,
                    arch="InceptionTimePlus",
                    metrics=[mae, rmse],
                    bs=64)

learn.fit_one_cycle(30, 1e-3)
```

La diferencia con forecasting es que aquí el target NO es el siguiente valor de la serie, sino un valor externo.

---

### 7.11 Tarea: Clustering (`clustering`)

**Objetivo:** Agrupar series temporales similares sin labels previos.

**Enfoques:**
1. **Feature extraction + clustering clásico:** Extraer features → K-Means/DBSCAN
2. **Deep clustering:** Autoencoder + clustering en espacio latente
3. **DTW + clustering:** Dynamic Time Warping como medida de distancia

```bash
pip install tslearn scikit-learn
```

```python
from tslearn.clustering import TimeSeriesKMeans
from tslearn.preprocessing import TimeSeriesScalerMeanVariance

# X: (num_samples, seq_length, num_features)
X_scaled = TimeSeriesScalerMeanVariance().fit_transform(X)

# K-Means con DTW
model = TimeSeriesKMeans(n_clusters=5, metric="dtw",
                         max_iter=50, random_state=42)
labels = model.fit_predict(X_scaled)
```

**Con tsai (deep clustering):**

```python
from tsai.all import *

# 1. Entrenar autoencoder para representación
# 2. Extraer embeddings del encoder
# 3. Aplicar K-Means en embeddings
```

---

### 7.12 Tarea: Imputación (`imputation`)

**Objetivo:** Rellenar datos faltantes en una serie temporal.

**Con tsai:**

```python
from tsai.all import *

# X con NaN en posiciones faltantes
# El modelo aprende a reconstruir los valores faltantes

# Usar masked approach: ocultar valores conocidos, predecirlos
learn = TSRegressor(X_masked, X_original, splits=splits,
                    arch="PatchTST",
                    metrics=mse)

learn.fit_one_cycle(30, 1e-3)
```

**Alternativas simples:**
- **Interpolación:** `pandas.DataFrame.interpolate(method='linear'/'spline')`
- **KNN Imputer:** `sklearn.impute.KNNImputer`
- **MICE:** `sklearn.experimental.enable_iterative_imputer; IterativeImputer`
- **SAITS** (SOTA DL): Self-Attention based Imputation for Time Series

```bash
pip install pypots  # framework para imputación DL
```

```python
from pypots.imputation import SAITS

model = SAITS(n_steps=48, n_features=10, n_layers=2, d_model=256,
              n_heads=4, d_ffn=128, dropout=0.1,
              epochs=100, batch_size=32, device="cuda")
model.fit(X_train_with_nans)
X_imputed = model.impute(X_test_with_nans)
```

---

## 8. Resumen de Instalación por Tipo

```bash
# ============================================
# INSTANCE SEGMENTATION (polygon)
# ============================================
pip install ultralytics                     # YOLO-Seg (más fácil)
pip install 'git+https://github.com/facebookresearch/detectron2.git'  # Detectron2
# MMDetection (ver doc anterior)

# ============================================
# KEYPOINTS / LANDMARKS
# ============================================
pip install ultralytics                     # YOLO-Pose (más fácil)
pip install -U openmim && mim install mmpose mmdet  # MMPose (más completo)
pip install transformers                    # ViTPose HuggingFace

# ============================================
# OBB (Oriented Bounding Boxes)
# ============================================
pip install ultralytics                     # YOLO-OBB (recomendado)
pip install mmrotate                        # MMRotate (legacy)

# ============================================
# CLASSIFICATION
# ============================================
pip install timm                            # 1000+ modelos (recomendado)
pip install transformers datasets           # HuggingFace ViT/Swin/etc.
pip install ultralytics                     # YOLO-cls (más simple)

# ============================================
# MULTI-LABEL CLASSIFICATION
# ============================================
# Mismos que clasificación: timm / transformers / ultralytics
# Cambia loss a BCEWithLogitsLoss, activation a Sigmoid

# ============================================
# SERIES TEMPORALES (todos los 9 tipos)
# ============================================
pip install tsai                            # DL principal (clasificación, forecasting, etc.)
pip install pytorch-forecasting             # Forecasting con TFT, N-BEATS
pip install darts                           # Forecasting unificado
pip install neuralforecast                  # Forecasting producción (Nixtla)
pip install pyod                            # Anomaly detection
pip install pypots                          # Imputación DL (SAITS)
pip install stumpy                          # Pattern recognition (Matrix Profile)
pip install ruptures                        # Change point detection
pip install tslearn                         # Clustering temporal
pip install hmmlearn                        # Hidden Markov Models
pip install gluonts                         # Forecasting probabilístico (Amazon)
```

---

## 9. ONNX Export — Resumen por Tipo

| Tipo | Input ONNX | Output ONNX | Post-proceso en Rust |
|------|-----------|-------------|---------------------|
| **polygon** (YOLO-seg) | `(B,3,640,640)` | detections + proto masks | NMS + mask assembly (complejo) |
| **polygon** (Mask R-CNN) | `(B,3,H,W)` | boxes + masks + classes | Filter by score |
| **keypoints** (YOLO-pose) | `(B,3,640,640)` | detections + keypoints | NMS + reshape kpts |
| **keypoints** (MMPose) | `(B,3,256,192)` crop | heatmaps `(B,K,64,48)` | Argmax por heatmap |
| **landmarks** | Idéntico a keypoints | Idéntico a keypoints | Idéntico a keypoints |
| **obb** (YOLO-obb) | `(B,3,1024,1024)` | rotated boxes + classes | NMS rotado |
| **classification** | `(B,3,H,W)` | `(B,num_classes)` logits | Softmax → argmax |
| **multi-label** | `(B,3,H,W)` | `(B,num_classes)` logits | Sigmoid → threshold |
| **timeseries** | `(B,features,seq_len)` | Varía por tarea | Depende de la tarea |

**Para series temporales la exportación ONNX depende del framework:**
- tsai/PyTorch: `torch.onnx.export` estándar funciona
- Input típico: `(batch, num_features, sequence_length)` float32
- Output: `(batch, num_classes)` para clasificación, `(batch, horizon)` para forecasting

---

## 10. Arquitectura General — Tu App Rust

```
┌─────────────────────────────────────────────────────┐
│              App Rust (UI de Anotación)              │
│                                                     │
│  Imagen:                    Series Temporales:      │
│  ├─ bbox    → COCO/YOLO    ├─ ts-classify → CSV    │
│  ├─ mask    → PNG indexed   ├─ ts-forecast → CSV    │
│  ├─ polygon → COCO JSON     ├─ anomaly-det → CSV    │
│  ├─ keypoints → COCO kpts   ├─ ts-segment  → CSV    │
│  ├─ landmarks → COCO kpts   ├─ pattern-rec → CSV    │
│  ├─ obb     → DOTA/YOLO     ├─ event-det   → CSV    │
│  ├─ classify → ImageFolder   ├─ ts-regress  → CSV    │
│  └─ multi-label → CSV       ├─ clustering  → CSV    │
│                              └─ imputation  → CSV    │
│                                                     │
│  ONNX Inference (producción): crate `ort`           │
└──────────────────┬──────────────────────────────────┘
                   │ subprocess / REST / pyo3
                   ▼
┌─────────────────────────────────────────────────────┐
│            Python Training Bridge                    │
│                                                     │
│  Imagen:                    Series Temporales:      │
│  ├─ bbox    → Ultralytics/MMDet   ├─ tsai          │
│  ├─ mask    → SMP/HF/MMSeg       ├─ pytorch-fcst   │
│  ├─ polygon → Ultralytics/D2     ├─ Darts/GluonTS  │
│  ├─ keypoints → YOLO-Pose/MMPose ├─ PyOD           │
│  ├─ landmarks → YOLO-Pose/MMPose ├─ stumpy/ruptures│
│  ├─ obb     → YOLO-OBB           ├─ tslearn        │
│  ├─ classify → timm/HF           ├─ pypots         │
│  └─ multi-label → timm           └─ etc.           │
│                                                     │
│  Output: checkpoint → ONNX → devolver a Rust       │
└─────────────────────────────────────────────────────┘
```
