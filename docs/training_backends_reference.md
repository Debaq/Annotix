# Guía de Backends de Entrenamiento para Detección de Objetos

> Referencia para integración con app Rust + Python bridge.
> Se omiten modelos YOLO (ya resueltos). Se cubren: RT-DETR (Ultralytics), RF-DETR (Roboflow) y MMDetection (OpenMMLab).

---

## 1. Formatos de Anotación

### 1.1 Formato YOLO TXT (usado por Ultralytics RT-DETR)

Cada imagen tiene un archivo `.txt` con el mismo nombre. Una línea por objeto:

```
<class_id> <x_center> <y_center> <width> <height>
```

- Todos los valores de coordenadas están **normalizados** entre 0.0 y 1.0 relativos al tamaño de la imagen.
- `class_id` es un entero empezando en 0.
- Requiere un archivo `dataset.yaml` que define rutas y clases:

```yaml
path: /ruta/al/dataset
train: images/train
val: images/val
test: images/test
nc: 3
names: ['clase_a', 'clase_b', 'clase_c']
```

Estructura de directorios:

```
dataset/
├── images/
│   ├── train/
│   │   ├── img001.jpg
│   │   └── ...
│   └── val/
│       └── ...
├── labels/
│   ├── train/
│   │   ├── img001.txt
│   │   └── ...
│   └── val/
│       └── ...
└── dataset.yaml
```

### 1.2 Formato COCO JSON (usado por RF-DETR y MMDetection)

Un único archivo JSON por split con la siguiente estructura:

```json
{
  "images": [
    {
      "id": 1,
      "file_name": "img001.jpg",
      "width": 1920,
      "height": 1080
    }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [x_min, y_min, width, height],
      "area": 12345.0,
      "iscrowd": 0
    }
  ],
  "categories": [
    {
      "id": 1,
      "name": "clase_a",
      "supercategory": "none"
    }
  ]
}
```

- `bbox` está en **píxeles absolutos**, formato `[x_min, y_min, ancho, alto]` (esquina superior izquierda).
- `category_id` empieza en **1** (el 0 se reserva para background en algunos frameworks).
- `area` = ancho × alto del bbox.

Estructura para RF-DETR:

```
dataset/
├── train/
│   ├── _annotations.coco.json
│   ├── img001.jpg
│   └── ...
├── valid/
│   ├── _annotations.coco.json
│   └── ...
└── test/
    ├── _annotations.coco.json
    └── ...
```

Estructura para MMDetection:

```
data/
├── coco/
│   ├── annotations/
│   │   ├── instances_train.json
│   │   └── instances_val.json
│   ├── train/
│   │   └── (imágenes)
│   └── val/
│       └── (imágenes)
```

### 1.3 Nota sobre RF-DETR y YOLO format

RF-DETR soporta **ambos formatos** (COCO y YOLO). Detecta automáticamente cuál usas según la estructura del directorio. Sin embargo, COCO JSON es el formato principal y recomendado.

### 1.4 Conversión entre formatos

Para tu app, lo ideal es que soporte exportar en **ambos formatos** desde Rust. La conversión es directa:

- **YOLO → COCO**: desnormalizar coordenadas (multiplicar por w/h de la imagen), convertir de center a esquina, generar JSON.
- **COCO → YOLO**: normalizar coordenadas, convertir de esquina a center, generar archivos .txt individuales.

---

## 2. RT-DETR (vía Ultralytics)

### 2.1 Descripción

Real-Time Detection Transformer, desarrollado por Baidu. Usa Vision Transformers con un encoder híbrido eficiente. Elimina NMS nativamente (end-to-end). Integrado en Ultralytics, comparte la misma API que YOLO.

### 2.2 Instalación

```bash
pip install ultralytics
```

No requiere instalación adicional. RT-DETR viene incluido en el paquete `ultralytics`.

Requisito: `torch >= 1.11`

### 2.3 Variantes disponibles

| Modelo | Params | mAP (COCO val) | FPS T4 GPU |
|-----------|--------|----------------|------------|
| rtdetr-l | ~32M | 53.0% | 114 |
| rtdetr-x | ~67M | 54.8% | 74 |
| rtdetrv2-s | — | — | — |
| rtdetrv2-m | — | — | — |
| rtdetrv2-l | — | — | — |
| rtdetrv2-x | — | — | — |

### 2.4 Formato de anotación

**YOLO TXT** — idéntico al formato usado por los modelos YOLO en Ultralytics (ver sección 1.1).

### 2.5 Entrenamiento (fine-tuning)

```python
from ultralytics import RTDETR

model = RTDETR("rtdetr-l.pt")  # Carga pesos preentrenados COCO

results = model.train(
    data="dataset.yaml",
    epochs=100,
    imgsz=640,
    batch=16,
    lr0=0.0002,          # learning rate inicial
    lrf=0.01,            # learning rate final (fracción de lr0)
    weight_decay=0.0001,
    warmup_epochs=3,
    warmup_momentum=0.8,
    optimizer="AdamW",
    device=0,             # GPU index, o "cpu"
    workers=8,
    patience=50,          # early stopping patience
    save_period=10,       # guardar checkpoint cada N epochs
    resume=False,         # resumir desde último checkpoint
)
```

### 2.6 Hiperparámetros principales

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| `epochs` | 100 | Número de epochs de entrenamiento |
| `imgsz` | 640 | Tamaño de imagen de entrada |
| `batch` | 16 | Batch size |
| `lr0` | 0.01 | Learning rate inicial (para RT-DETR se recomienda ~0.0002) |
| `lrf` | 0.01 | Learning rate final como fracción de lr0 |
| `optimizer` | "auto" | Optimizador: SGD, Adam, AdamW, NAdam, RAdam, RMSProp |
| `weight_decay` | 0.0005 | Weight decay para regularización |
| `warmup_epochs` | 3.0 | Epochs de warmup |
| `warmup_momentum` | 0.8 | Momentum inicial en warmup |
| `cos_lr` | False | Usar scheduler cosine |
| `patience` | 100 | Epochs sin mejora para early stopping (0=deshabilitado) |
| `device` | "" | Dispositivo: "cpu", 0, [0,1], etc. |
| `workers` | 8 | Número de workers para data loading |
| `amp` | True | Mixed precision training |
| `resume` | False | Resumir entrenamiento desde checkpoint |
| `freeze` | None | Número de capas a congelar (desde el inicio) |

### 2.7 Entrenamiento desde cero vs Fine-tuning

- **Fine-tuning**: Sí. Cargas `rtdetr-l.pt` (preentrenado en COCO) y entrenas con tu dataset.
- **Desde cero**: Técnicamente posible usando un archivo `.yaml` de configuración en vez de `.pt`, pero no es lo recomendado ni bien soportado para RT-DETR en Ultralytics.
- **Hyperparameter tuning**: `model.tune()` existe pero internamente usa el CLI de YOLO, no es 100% compatible con RT-DETR todavía.

### 2.8 Exportación

```python
model.export(format="onnx")    # También: torchscript, tflite, coreml, engine (TensorRT)
```

### 2.9 Notas importantes

- `F.grid_sample` usado en RT-DETR no soporta `deterministic=True`.
- AMP puede generar NaN en algunos casos — monitorear durante entrenamiento.
- Las losses reportadas son: `giou_loss`, `cls_loss`, `l1_loss`.

---

## 3. RF-DETR (Roboflow)

### 3.1 Descripción

Transformer-based detector de Roboflow. Usa DINOv2 como backbone y un decoder tipo LW-DETR/Deformable DETR. Primer modelo real-time en superar 60 mAP en COCO. No necesita NMS. Licencia Apache 2.0.

### 3.2 Instalación

```bash
pip install rfdetr

# Con soporte de métricas (TensorBoard/W&B):
pip install "rfdetr[metrics]"

# Desde source (features más recientes):
pip install git+https://github.com/roboflow/rf-detr.git
```

Requisito: `Python >= 3.9` (recomendado `>= 3.10`)

### 3.3 Variantes disponibles

**Detección:**

| Clase Python | Alias | Params | Descripción |
|---|---|---|---|
| `RFDETRNano` | rfdetr-nano | ~3M | Ultra liviano, edge |
| `RFDETRSmall` | rfdetr-small | ~10M | Liviano |
| `RFDETRMedium` | rfdetr-medium | ~18M | Balance |
| `RFDETRBase` | rfdetr-base | ~29M | Base, buen balance |
| `RFDETRLarge` | rfdetr-large | ~128M | Máxima precisión |

**Segmentación (Preview):**

| Clase Python | Descripción |
|---|---|
| `RFDETRSegNano` | Segmentación nano |
| `RFDETRSegSmall` | Segmentación small |
| `RFDETRSegMedium` | Segmentación medium |
| `RFDETRSegLarge` | Segmentación large |

### 3.4 Formato de anotación

**COCO JSON** (principal) o **YOLO TXT** (auto-detectado). Ver sección 1.2 y 1.3.

### 3.5 Entrenamiento (fine-tuning)

```python
from rfdetr import RFDETRBase

model = RFDETRBase()  # Carga automáticamente pesos COCO

model.train(
    dataset_dir="path/to/dataset",
    epochs=100,
    batch_size=4,
    grad_accum_steps=4,      # effective batch = batch_size × grad_accum_steps
    lr=1e-4,
    lr_encoder=1e-5,          # LR separado para el encoder (backbone)
    weight_decay=1e-4,
    resolution=560,           # debe ser divisible por 56
    output_dir="output",
    device="cuda",
    use_ema=True,
    amp=True,
    checkpoint_interval=10,
    resume=None,              # path a checkpoint.pth para resumir

    # Early stopping
    early_stopping=True,
    early_stopping_patience=10,
    early_stopping_min_delta=0.001,
    early_stopping_use_ema=True,

    # Logging
    tensorboard=True,
    # wandb=True,             # requiere rfdetr[metrics] + wandb login
    # project="mi_proyecto",  # nombre de proyecto W&B
    # run="run_001",          # nombre del run
)
```

### 3.6 Hiperparámetros principales

| Parámetro | Default | Descripción |
|-----------|---------|-------------|
| `epochs` | 10 | Número de epochs |
| `batch_size` | 4 | Batch size por GPU |
| `grad_accum_steps` | 4 | Steps de acumulación de gradientes. Effective batch = batch_size × grad_accum_steps. Objetivo: mantener effective batch ≈ 16 |
| `lr` | 1e-4 | Learning rate global |
| `lr_encoder` | 1.5e-4 | Learning rate para el encoder/backbone (puede ser diferente al global) |
| `weight_decay` | 1.25e-4 | Regularización weight decay |
| `resolution` | 560 | Resolución de entrada. **Debe ser divisible por 56**. Mayor resolución = mejor precisión pero más lento |
| `use_ema` | True | Usar Exponential Moving Average de pesos |
| `ema_decay` | 0.993 | Tasa de decay del EMA |
| `ema_tau` | 100 | Parámetro tau del EMA |
| `lr_drop` | 100 | Epoch en el que baja el LR |
| `lr_vit_layer_decay` | 0.8 | Decay del LR por capa del ViT |
| `lr_component_decay` | 0.7 | Decay del LR por componente |
| `warmup_epochs` | 0 | Epochs de warmup |
| `drop_path` | 0.0 | Drop path rate |
| `num_classes` | 90 | Número de clases (se auto-detecta del dataset) |
| `num_queries` | 300 | Número de queries del transformer |
| `device` | "cuda" | Dispositivo de entrenamiento |
| `amp` | True | Mixed precision |
| `checkpoint_interval` | 10 | Guardar checkpoint cada N epochs |
| `early_stopping` | False | Habilitar early stopping |
| `early_stopping_patience` | 10 | Epochs sin mejora para parar |
| `early_stopping_min_delta` | 0.001 | Mejora mínima para considerar mejora |
| `resume` | None | Path a checkpoint para continuar |
| `gradient_checkpointing` | False | Reduce memoria a costo de velocidad |

### 3.7 Entrenamiento desde cero vs Fine-tuning

- **Fine-tuning**: Sí, es el modo principal. Los pesos COCO se cargan automáticamente.
- **Desde cero**: No es el uso previsto. El modelo depende fuertemente del backbone DINOv2 preentrenado.
- **Multi-GPU (DDP)**: Soportado. Crear un `main.py` y ejecutar con `torchrun`.

### 3.8 Checkpoints generados

| Archivo | Descripción |
|---------|-------------|
| `checkpoint.pth` | Último checkpoint completo (pesos + optimizer + scheduler) |
| `checkpoint_best_ema.pth` | Mejor modelo EMA por mAP de validación |
| `checkpoint_best_regular.pth` | Mejor modelo no-EMA por mAP de validación |
| `checkpoint_best_total.pth` | Mejor general (EMA vs regular), solo pesos, listo para deploy |

### 3.9 Exportación

```python
model = RFDETRBase(pretrain_weights="checkpoint_best_total.pth")
model.export(output_dir="onnx")
```

Salidas ONNX: `dets [batch, num_queries, 4]` (cxcywh normalizado) + `labels [batch, num_queries, num_classes]` (logits).

### 3.10 Callbacks para monitoreo

```python
history = []

def on_epoch_end(data):
    history.append(data)

model.callbacks["on_fit_epoch_end"].append(on_epoch_end)
# data contiene: epoch, train_loss, test_loss, test_coco_eval_bbox, etc.
```

---

## 4. MMDetection (OpenMMLab)

### 4.1 Descripción

Framework modular de detección de objetos más completo del ecosistema. Soporta docenas de arquitecturas con una API unificada basada en archivos de configuración `.py`. Parte del ecosistema OpenMMLab.

### 4.2 Instalación

```bash
# Instalar el gestor de paquetes de OpenMMLab
pip install -U openmim

# Instalar dependencias core
mim install "mmengine>=0.6.0"
mim install "mmcv>=2.0.0rc4,<2.1.0"

# Instalar mmdetection
mim install "mmdet>=3.0.0"

# O desde source (para tener acceso a todos los configs)
git clone https://github.com/open-mmlab/mmdetection.git
cd mmdetection
pip install -v -e .
```

### 4.3 Modelos disponibles (detección con bboxes)

Esta es la gran ventaja de MMDetection: la variedad. Los más relevantes para tu app:

**Two-stage (alta precisión):**

| Modelo | Config prefix | Tipo | mAP COCO aprox. |
|--------|--------------|------|-----------------|
| Faster R-CNN | `faster-rcnn_r50_fpn` | Two-stage | ~37-40% |
| Cascade R-CNN | `cascade-rcnn_r50_fpn` | Two-stage cascade | ~40-44% |
| HTC (Hybrid Task Cascade) | `htc_r50_fpn` | Two-stage + mask | ~43-47% |

**One-stage (velocidad):**

| Modelo | Config prefix | Tipo | mAP COCO aprox. |
|--------|--------------|------|-----------------|
| RetinaNet | `retinanet_r50_fpn` | One-stage anchor | ~36-38% |
| SSD | `ssd300` / `ssd512` | One-stage anchor | ~25-29% |
| FCOS | `fcos_r50-caffe_fpn` | One-stage anchor-free | ~36-42% |
| CenterNet | `centernet_r18` | Anchor-free keypoint | ~25-30% |
| RTMDet | `rtmdet_l` | One-stage (rápido) | ~42-51% |
| YOLOX | `yolox_l` | One-stage | ~48-50% |

**Transformer-based:**

| Modelo | Config prefix | Tipo | mAP COCO aprox. |
|--------|--------------|------|-----------------|
| DETR | `detr_r50` | Transformer E2E | ~42% |
| Deformable DETR | `deformable-detr_r50` | Transformer mejorado | ~44-46% |
| DINO | `dino-4scale_r50` | SOTA transformer | ~49-51% |
| Co-DETR | `co_dino` (projects/) | SOTA | ~52-56% |
| Grounding DINO | `grounding_dino` | Open-vocab | variable |
| RTMDet | `rtmdet` | Transformer-like | ~42-51% |

### 4.4 Formato de anotación

**COCO JSON** (principal). También soporta Pascal VOC XML, pero COCO es lo estándar. Ver sección 1.2.

### 4.5 Cómo descargar modelos preentrenados

```bash
# Descargar un modelo específico con mim
mim download mmdet --config faster-rcnn_r50_fpn_1x_coco --dest ./checkpoints
mim download mmdet --config retinanet_r50_fpn_1x_coco --dest ./checkpoints
mim download mmdet --config cascade-rcnn_r50_fpn_1x_coco --dest ./checkpoints
mim download mmdet --config deformable-detr_r50_16xb2-50e_coco --dest ./checkpoints
```

### 4.6 Entrenamiento (fine-tuning)

El entrenamiento en MMDetection se controla mediante archivos de configuración `.py` que heredan de configs base.

**Ejemplo: crear config personalizado para Faster R-CNN:**

```python
# mi_config.py
_base_ = [
    'mmdetection/configs/faster_rcnn/faster-rcnn_r50_fpn_1x_coco.py'
]

# Cambiar número de clases
model = dict(
    roi_head=dict(
        bbox_head=dict(num_classes=3)  # Tu número de clases
    )
)

# Cambiar dataset
data_root = '/ruta/a/tu/dataset/'

train_dataloader = dict(
    batch_size=4,
    num_workers=4,
    dataset=dict(
        data_root=data_root,
        ann_file='annotations/instances_train.json',
        data_prefix=dict(img='train/'),
        metainfo=dict(classes=('clase_a', 'clase_b', 'clase_c')),
    )
)

val_dataloader = dict(
    dataset=dict(
        data_root=data_root,
        ann_file='annotations/instances_val.json',
        data_prefix=dict(img='val/'),
        metainfo=dict(classes=('clase_a', 'clase_b', 'clase_c')),
    )
)

val_evaluator = dict(ann_file=data_root + 'annotations/instances_val.json')

# Cargar pesos preentrenados
load_from = 'checkpoints/faster_rcnn_r50_fpn_1x_coco.pth'

# Hiperparámetros de entrenamiento
train_cfg = dict(max_epochs=50)

optim_wrapper = dict(
    optimizer=dict(
        type='SGD',
        lr=0.005,       # Suele reducirse para fine-tuning (original: 0.02)
        momentum=0.9,
        weight_decay=0.0001
    )
)

param_scheduler = [
    dict(type='LinearLR', start_factor=0.001, by_epoch=False, begin=0, end=500),
    dict(type='MultiStepLR', milestones=[30, 40], gamma=0.1, by_epoch=True)
]

default_hooks = dict(
    checkpoint=dict(interval=5),  # Guardar cada 5 epochs
)
```

**Ejecutar entrenamiento:**

```bash
# Single GPU
python tools/train.py mi_config.py

# Multi-GPU (4 GPUs)
bash tools/dist_train.sh mi_config.py 4

# Resumir entrenamiento
python tools/train.py mi_config.py --resume
```

**Entrenamiento programático (desde Python):**

```python
from mmdet.apis import init_detector, inference_detector
from mmengine.config import Config
from mmengine.runner import Runner

cfg = Config.fromfile('mi_config.py')
runner = Runner.from_cfg(cfg)
runner.train()
```

### 4.7 Hiperparámetros principales

Los hiperparámetros se definen en el config `.py`. Estos son los más importantes:

| Sección | Parámetro | Default típico | Descripción |
|---------|-----------|----------------|-------------|
| `train_cfg` | `max_epochs` | 12 (1x), 24 (2x) | Epochs totales |
| `train_dataloader` | `batch_size` | 2 | Batch size por GPU |
| `train_dataloader` | `num_workers` | 4 | Workers de data loading |
| `optim_wrapper.optimizer` | `type` | "SGD" | Optimizador: SGD, Adam, AdamW |
| `optim_wrapper.optimizer` | `lr` | 0.02 | Learning rate base (escalar con GPUs) |
| `optim_wrapper.optimizer` | `momentum` | 0.9 | Momentum (SGD) |
| `optim_wrapper.optimizer` | `weight_decay` | 0.0001 | Weight decay |
| `param_scheduler` | `milestones` | [8, 11] (1x) | Epochs donde baja el LR |
| `param_scheduler` | `gamma` | 0.1 | Factor de reducción del LR |
| `param_scheduler` | `warmup` | LinearLR | Tipo de warmup |
| `model.data_preprocessor` | `mean/std` | ImageNet | Normalización de imagen |
| `train_pipeline` | `scale` | (1333, 800) | Escala de resize |
| `default_hooks.checkpoint` | `interval` | 1 | Frecuencia de guardado |
| `load_from` | — | None | Path a pesos preentrenados para fine-tune |
| `resume` | — | False | Resumir entrenamiento completo |

**Nota sobre LR scaling**: MMDetection usa por defecto `lr=0.02` para 8 GPUs × batch_size=2 = effective batch 16. Si usas 1 GPU con batch 4, escalar: `lr = 0.02 × (4/16) = 0.005`.

### 4.8 Entrenamiento desde cero vs Fine-tuning

- **Fine-tuning**: Sí. Usa `load_from` para cargar pesos COCO preentrenados. Es lo más común.
- **Desde cero**: Sí, todos los modelos pueden entrenarse from scratch. Simplemente no defines `load_from`. Requiere muchos más epochs y datos.
- **Congelar capas**: Configurable por modelo, generalmente se puede freeze el backbone.

### 4.9 Exportación a ONNX

Requiere MMDeploy:

```bash
pip install mmdeploy

# Exportar Faster R-CNN a ONNX
python tools/deploy.py \
    configs/mmdet/detection/detection_onnxruntime_dynamic.py \
    mi_config.py \
    checkpoint.pth \
    imagen_test.jpg \
    --work-dir onnx_output \
    --device cpu
```

---

## 5. Comparativa rápida

| Aspecto | RT-DETR (Ultralytics) | RF-DETR (Roboflow) | MMDetection |
|---------|----------------------|-------------------|-------------|
| **Instalación** | `pip install ultralytics` | `pip install rfdetr` | `mim install mmdet` + deps |
| **Formato principal** | YOLO TXT | COCO JSON (o YOLO) | COCO JSON |
| **API de entrenamiento** | `model.train(data=...)` | `model.train(dataset_dir=...)` | `python train.py config.py` |
| **Complejidad de config** | Baja (args directos) | Baja (args directos) | Alta (archivos .py con herencia) |
| **Modelos disponibles** | RT-DETR L/X + v2 | Nano/S/M/Base/Large | 30+ arquitecturas |
| **Fine-tuning** | Sí | Sí (principal) | Sí |
| **Training from scratch** | Limitado | No recomendado | Sí (completo) |
| **Multi-GPU** | Sí | Sí (DDP) | Sí (DDP nativo) |
| **Exportación ONNX** | Directa | Directa | Vía MMDeploy |
| **NMS requerido** | No (end-to-end) | No (end-to-end) | Depende del modelo |
| **Licencia** | AGPL-3.0 | Apache 2.0 | Apache 2.0 |

---

## 6. Entrenamiento desde Rust: ¿es viable?

### 6.1 Estado actual del ecosistema Rust ML

Existen frameworks de deep learning en Rust, pero **ninguno tiene soporte maduro para entrenar modelos de detección de objetos con bounding boxes**:

- **Burn** (`burn` crate): Framework más prometedor. Soporta entrenamiento genérico con autodiff, múltiples backends (WGPU, CUDA, LibTorch, NdArray). Pero no tiene implementaciones de detectores de objetos (no hay Faster R-CNN, DETR, etc.).

- **tch-rs**: Bindings de LibTorch para Rust. Podrías teóricamente portar un detector, pero tendrías que reimplementar toda la lógica de entrenamiento, losses, data augmentation, etc. No es práctico.

- **Candle** (Hugging Face): Enfocado en inferencia de LLMs y transformers. Tiene un ejemplo de YOLO para inferencia pero no para entrenamiento de detección.

### 6.2 Recomendación

**Python sigue siendo la mejor opción para entrenamiento** por las siguientes razones:

- Todos los frameworks de detección están en Python
- Los pipelines de data augmentation (albumentations, etc.) están en Python
- Las métricas de evaluación (COCO eval, mAP) están en Python
- La comunidad y documentación están en Python

### 6.3 Qué sí puedes hacer en Rust

- **Inferencia con ONNX Runtime**: Usa `ort` crate para cargar modelos ONNX y hacer inferencia en producción. Esto sí es maduro y rápido.
- **Pre/post procesamiento**: Resize, normalización, NMS, parsing de resultados — todo esto puede hacerse eficientemente en Rust.
- **Orquestación**: Tu app Rust puede llamar a Python via `pyo3` o como subproceso para entrenar, y manejar todo lo demás nativamente.
- **Interfaz de anotación**: Toda la UI de marcado y gestión de datasets en Rust.

### 6.4 Bridge Rust → Python recomendado

```
┌─────────────────────────────────┐
│         App Rust (UI)           │
│  - Anotación/marcado            │
│  - Gestión de datasets          │
│  - Exportación YOLO/COCO        │
│  - Inferencia ONNX (producción) │
└──────────┬──────────────────────┘
           │ subprocess / pyo3
           ▼
┌─────────────────────────────────┐
│      Python Training Bridge     │
│  - Recibe: dataset_path,        │
│    model_type, hyperparams      │
│  - Ejecuta entrenamiento        │
│  - Retorna: checkpoint_path,    │
│    métricas, logs               │
└─────────────────────────────────┘
```

---

## 7. Resumen de comandos pip por backend

```bash
# RT-DETR (Ultralytics) — incluye YOLO también
pip install ultralytics

# RF-DETR (Roboflow)
pip install rfdetr
pip install "rfdetr[metrics]"     # con TensorBoard/W&B

# MMDetection (OpenMMLab)
pip install -U openmim
mim install "mmengine>=0.6.0"
mim install "mmcv>=2.0.0rc4,<2.1.0"
mim install "mmdet>=3.0.0"

# Dependencias compartidas útiles
pip install supervision           # visualización de detecciones
pip install onnxruntime           # inferencia ONNX en CPU
pip install onnxruntime-gpu       # inferencia ONNX en GPU
```
