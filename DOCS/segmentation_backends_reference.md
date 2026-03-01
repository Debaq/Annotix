# Backends de Entrenamiento para Segmentación Semántica — Referencia Completa

Documento de referencia para integrar entrenamiento de modelos de segmentación semántica desde una aplicación Rust de anotación. Cubre formatos de anotación, instalación, hiperparámetros, fine-tuning, exportación ONNX y viabilidad en Rust.

**Backends cubiertos:**

1. Segmentation Models PyTorch (SMP) — qubvel
2. HuggingFace Transformers (SegFormer, Mask2Former, DPT, etc.)
3. MMSegmentation (OpenMMLab)

**No cubierto:** YOLO-Seg (ya resuelto por separado).

---

## 1. Formatos de Anotación para Segmentación Semántica

A diferencia de la detección de objetos (bounding boxes), la segmentación semántica requiere **máscaras por píxel** donde cada píxel tiene asignado un ID de clase.

### 1.1 Máscara PNG Indexada (Formato Universal)

El formato más común y universal. Cada imagen tiene una máscara PNG correspondiente del mismo tamaño donde el valor de cada píxel es el `class_id`.

**Características:**

- Imagen PNG de 1 canal (grayscale/indexed), mismo ancho y alto que la imagen original
- Valor del píxel = ID de clase (0, 1, 2, ..., N)
- Valor 255 = píxel ignorado (bordes, regiones ambiguas)
- Clase 0 = generalmente "background"
- Formato nativo de: Pascal VOC, Cityscapes, ADE20K, SMP, MMSegmentation, HuggingFace

**Estructura de directorios típica:**

```
dataset/
├── images/
│   ├── train/
│   │   ├── img_0001.jpg
│   │   ├── img_0002.jpg
│   │   └── ...
│   └── val/
│       ├── img_0100.jpg
│       └── ...
├── masks/          # o "annotations/", "labels/", "SegmentationClass/"
│   ├── train/
│   │   ├── img_0001.png    ← máscara indexada
│   │   ├── img_0002.png
│   │   └── ...
│   └── val/
│       ├── img_0100.png
│       └── ...
└── classes.txt     # o dataset.yaml, id2label.json, etc.
```

**Cómo generar desde tu app Rust:**

```rust
// Cada píxel del canvas de anotación tiene un class_id u8
// Guardar como PNG grayscale de 8 bits
fn save_mask(mask: &[u8], width: u32, height: u32, path: &Path) {
    // mask[y * width + x] = class_id (0..N)
    // Usar image crate para guardar como PNG grayscale
    let img = image::GrayImage::from_raw(width, height, mask.to_vec()).unwrap();
    img.save(path).unwrap();
}
```

**Notas importantes:**

- NO usar compresión JPEG para máscaras (altera los valores de píxel)
- Siempre PNG con compresión lossless
- Los valores deben ser enteros exactos (0, 1, 2...), no aproximados
- Para >255 clases, usar PNG de 16 bits (raro en la práctica)

### 1.2 Máscara PNG a Color (Color Map)

Variante visual donde cada clase tiene un color RGB asignado. Se usa para visualización pero algunos frameworks lo aceptan directamente.

**Características:**

- Imagen PNG de 3 canales (RGB)
- Cada color único = una clase
- Requiere un `labelmap.txt` o `colormap` que mapee colores a clases
- Formato usado por: Pascal VOC (SegmentationClass con paleta), Cityscapes (color), CVAT export

**Ejemplo labelmap.txt:**

```
# label:color_r,color_g,color_b
background:0,0,0
road:128,64,128
sidewalk:244,35,232
building:70,70,70
vegetation:107,142,35
sky:70,130,180
person:220,20,60
car:0,0,142
```

**Conversión a máscara indexada (para entrenamiento):**

```python
import numpy as np
from PIL import Image

colormap = {
    (0, 0, 0): 0,        # background
    (128, 64, 128): 1,    # road
    (244, 35, 232): 2,    # sidewalk
    # ...
}

color_mask = np.array(Image.open("mask_color.png"))  # (H, W, 3)
indexed_mask = np.zeros((color_mask.shape[0], color_mask.shape[1]), dtype=np.uint8)
for color, class_id in colormap.items():
    match = np.all(color_mask == color, axis=-1)
    indexed_mask[match] = class_id

Image.fromarray(indexed_mask).save("mask_indexed.png")
```

### 1.3 COCO-Stuff JSON (para segmentación semántica)

Extensión del formato COCO que incluye anotaciones de "stuff" (clases sin forma definida como cielo, carretera, pasto).

**Características:**

- Un JSON por split con imágenes y anotaciones
- Las anotaciones usan RLE (Run-Length Encoding) o polígonos
- Más complejo que máscaras PNG, pero estándar en benchmarks
- Formato nativo de: COCO-Stuff, usado por MMSegmentation

**Estructura:**

```json
{
  "images": [
    {"id": 1, "file_name": "img_0001.jpg", "width": 640, "height": 480}
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 3,
      "segmentation": {
        "counts": [5, 10, 20, 15, ...],
        "size": [480, 640]
      },
      "area": 25000,
      "iscrowd": 1
    }
  ],
  "categories": [
    {"id": 0, "name": "background"},
    {"id": 1, "name": "road"},
    {"id": 2, "name": "building"},
    {"id": 3, "name": "vegetation"}
  ]
}
```

**Nota:** Para segmentación semántica pura, la mayoría de frameworks prefieren máscaras PNG directas. COCO-Stuff JSON es más relevante para instance/panoptic segmentation.

### 1.4 Cityscapes Format

Formato específico del dataset Cityscapes, ampliamente adoptado en conducción autónoma.

**Estructura:**

```
cityscapes/
├── leftImg8bit/
│   ├── train/
│   │   └── city_name/
│   │       └── city_000001_000001_leftImg8bit.png
│   └── val/
├── gtFine/
│   ├── train/
│   │   └── city_name/
│   │       ├── city_000001_000001_gtFine_labelIds.png      ← máscara con label IDs
│   │       ├── city_000001_000001_gtFine_color.png          ← visualización a color
│   │       ├── city_000001_000001_gtFine_instanceIds.png    ← IDs de instancia
│   │       └── city_000001_000001_gtFine_polygons.json      ← polígonos originales
│   └── val/
```

- `_labelIds.png`: Máscara indexada con IDs de clase (0-33)
- `_color.png`: Visualización a color (no para entrenamiento)
- MMSegmentation y la mayoría de frameworks soportan este formato directamente

### 1.5 Resumen de Formatos por Framework

| Framework | Formato Principal | Formatos Alternativos |
|-----------|------------------|----------------------|
| SMP (qubvel) | Máscara PNG indexada (custom Dataset) | Cualquiera (tú defines el Dataset) |
| HuggingFace Transformers | Máscara PNG indexada (vía HF Datasets) | Cualquiera (custom transform) |
| MMSegmentation | Máscara PNG indexada (Pascal VOC style) | Cityscapes, COCO-Stuff, ADE20K |

**Recomendación para tu app Rust:** Exportar siempre en **máscara PNG indexada** (formato 1.1). Es el más universal y simple. Todos los frameworks lo aceptan. Tu app solo necesita generar un PNG grayscale de 8 bits donde cada píxel = class_id.

---

## 2. Segmentation Models PyTorch (SMP)

### 2.1 Descripción

Librería de alto nivel que provee 12 arquitecturas de segmentación con 800+ encoders (backbones) preentrenados. Es la opción más flexible y modular: cualquier combinación de arquitectura + encoder. API extremadamente simple (2 líneas para crear un modelo). No incluye training loop propio — tú lo escribes con PyTorch, PyTorch Lightning, o lo que prefieras.

**Licencia:** MIT

**Repositorio:** https://github.com/qubvel-org/segmentation_models.pytorch

### 2.2 Instalación

```bash
pip install segmentation-models-pytorch

# Dependencias típicas para entrenamiento
pip install torch torchvision
pip install albumentations          # data augmentation
pip install pytorch-lightning       # training loop (opcional)
pip install torchmetrics            # métricas (IoU, F1, etc.)
```

Requiere: Python >= 3.9, PyTorch >= 1.8

### 2.3 Arquitecturas Disponibles

| Arquitectura | Clase SMP | Descripción | Uso recomendado |
|-------------|-----------|-------------|-----------------|
| U-Net | `smp.Unet` | Encoder-decoder con skip connections. El clásico. | General, médico, satélite |
| U-Net++ | `smp.UnetPlusPlus` | U-Net con dense skip connections anidadas | Mayor precisión que U-Net |
| MAnet | `smp.MAnet` | Multi-scale Attention Net | Objetos de múltiples tamaños |
| LinkNet | `smp.Linknet` | Encoder-decoder ligero con conexiones residuales | Tiempo real, edge |
| FPN | `smp.FPN` | Feature Pyramid Network para segmentación | Multi-escala |
| PSPNet | `smp.PSPNet` | Pyramid Scene Parsing Network | Escenas complejas |
| PAN | `smp.PAN` | Pyramid Attention Network | Balance velocidad/precisión |
| DeepLabV3 | `smp.DeepLabV3` | Atrous convolutions + ASPP | Estado del arte CNN |
| DeepLabV3+ | `smp.DeepLabV3Plus` | DeepLabV3 con decoder mejorado | Estado del arte CNN |
| SegFormer | `smp.Segformer` | Transformer encoder + MLP decoder | Estado del arte Transformer |
| DPT | `smp.DPT` | Dense Prediction Transformer | Segmentación densa |
| UPerNet | `smp.UPerNet` | Unified Perceptual Parsing Network | Escenas complejas |

### 2.4 Encoders (Backbones) Principales

800+ encoders disponibles vía integración con `timm`. Los más comunes:

**CNN Ligeros (edge/tiempo real):**
- `mobilenet_v2`: ~3.5M params
- `mobileone_s0` a `mobileone_s4`: Apple, sub-milisegundo
- `efficientnet-b0` a `efficientnet-b7`: balance escalable
- `timm-efficientnet-lite0` a `lite4`: optimizados para mobile

**CNN Medianos (balance):**
- `resnet18`, `resnet34`, `resnet50`, `resnet101`, `resnet152`
- `resnext50_32x4d`, `resnext101_32x8d`
- `se_resnet50`, `se_resnext50_32x4d`: con squeeze-excitation
- `dpn68`, `dpn92`, `dpn131`: Dual Path Networks

**CNN Pesados (máxima precisión):**
- `efficientnet-b6`, `efficientnet-b7`
- `timm-resnest50d`, `timm-resnest200e`
- `senet154`

**Transformer:**
- `mit_b0` a `mit_b5`: Mix Transformer (SegFormer backbone)
- `tu-convnext_tiny` a `tu-convnext_xlarge`: ConvNeXt vía timm
- `tu-swin_tiny_patch4_window7_224`: Swin Transformer vía timm
- Cualquier encoder de timm con `features_only` support

### 2.5 Formato de Datos

SMP no impone formato. Tú creas tu propio `torch.utils.data.Dataset`. Lo que necesitas:

```python
import torch
from torch.utils.data import Dataset
from PIL import Image
import numpy as np
import albumentations as A
from albumentations.pytorch import ToTensorV2

class SegmentationDataset(Dataset):
    def __init__(self, image_paths, mask_paths, transform=None):
        self.image_paths = image_paths
        self.mask_paths = mask_paths
        self.transform = transform

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        # Cargar imagen RGB
        image = np.array(Image.open(self.image_paths[idx]).convert("RGB"))
        # Cargar máscara indexada (1 canal, valores = class_id)
        mask = np.array(Image.open(self.mask_paths[idx]).convert("L"))  # grayscale

        if self.transform:
            augmented = self.transform(image=image, mask=mask)
            image = augmented["image"]
            mask = augmented["mask"]

        return image, mask.long()

# Transforms recomendados
train_transform = A.Compose([
    A.RandomCrop(512, 512),
    A.HorizontalFlip(p=0.5),
    A.VerticalFlip(p=0.1),
    A.RandomBrightnessContrast(p=0.3),
    A.HueSaturationValue(p=0.3),
    A.GaussianBlur(blur_limit=(3, 5), p=0.2),
    A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ToTensorV2(),
])

val_transform = A.Compose([
    A.Resize(512, 512),
    A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ToTensorV2(),
])
```

### 2.6 Entrenamiento

SMP no incluye training loop. Tienes dos opciones: PyTorch puro o PyTorch Lightning.

**Opción A: PyTorch puro**

```python
import segmentation_models_pytorch as smp
import torch
import torch.nn as nn

# 1. Crear modelo
model = smp.Unet(
    encoder_name="resnet34",
    encoder_weights="imagenet",
    in_channels=3,
    classes=5,                    # número de clases
    activation=None,              # logits crudos (softmax en loss)
)

# 2. Loss y optimizer
loss_fn = smp.losses.DiceLoss(mode="multiclass")
# Alternativas:
# loss_fn = smp.losses.FocalLoss(mode="multiclass")
# loss_fn = smp.losses.JaccardLoss(mode="multiclass")
# loss_fn = nn.CrossEntropyLoss(ignore_index=255)
# Combinada:
# loss_fn = smp.losses.DiceLoss(mode="multiclass") + nn.CrossEntropyLoss(ignore_index=255)

optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=100)

# 3. Training loop
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

for epoch in range(100):
    model.train()
    for images, masks in train_loader:
        images = images.to(device)     # (B, 3, H, W) float32
        masks = masks.to(device)       # (B, H, W) int64

        logits = model(images)         # (B, num_classes, H, W)
        loss = loss_fn(logits, masks)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    scheduler.step()

    # Validación
    model.eval()
    with torch.no_grad():
        for images, masks in val_loader:
            images = images.to(device)
            masks = masks.to(device)
            logits = model(images)
            # Calcular métricas (IoU, etc.)
```

**Opción B: PyTorch Lightning (recomendado para producción)**

```python
import pytorch_lightning as pl
import segmentation_models_pytorch as smp
import torch

class SegModel(pl.LightningModule):
    def __init__(self, arch, encoder, num_classes, lr=1e-4):
        super().__init__()
        self.model = smp.create_model(
            arch, encoder_name=encoder, encoder_weights="imagenet",
            in_channels=3, classes=num_classes,
        )
        self.loss_fn = smp.losses.DiceLoss(mode="multiclass")
        self.lr = lr

    def forward(self, x):
        return self.model(x)

    def training_step(self, batch, batch_idx):
        images, masks = batch
        logits = self(images)
        loss = self.loss_fn(logits, masks)
        self.log("train_loss", loss)
        return loss

    def validation_step(self, batch, batch_idx):
        images, masks = batch
        logits = self(images)
        loss = self.loss_fn(logits, masks)
        # Calcular mIoU
        pred = logits.argmax(dim=1)
        self.log("val_loss", loss)

    def configure_optimizers(self):
        optimizer = torch.optim.AdamW(self.parameters(), lr=self.lr, weight_decay=1e-4)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=100)
        return [optimizer], [scheduler]

# Entrenar
model = SegModel("Unet", "resnet34", num_classes=5)
trainer = pl.Trainer(max_epochs=100, accelerator="gpu", devices=1)
trainer.fit(model, train_loader, val_loader)
```

### 2.7 Hiperparámetros Clave

| Parámetro | Default recomendado | Rango típico | Notas |
|-----------|-------------------|--------------|-------|
| `encoder_name` | `"resnet34"` | ver tabla encoders | Balance velocidad/precisión |
| `encoder_weights` | `"imagenet"` | `"imagenet"`, `None` | Siempre usar pretrained |
| `classes` | — | 2-150+ | Número de clases del dataset |
| `in_channels` | 3 | 1, 3, 4+ | RGB=3, grayscale=1, multispectral=más |
| `activation` | `None` | `None`, `"sigmoid"`, `"softmax2d"` | None para usar con CE loss |
| `encoder_depth` | 5 | 3-5 | Menos = modelo más ligero |
| epochs | 100 | 50-300 | Depende del dataset |
| batch_size | 8 | 2-32 | Limitado por VRAM y tamaño de imagen |
| lr (learning rate) | 1e-4 | 1e-5 a 1e-3 | AdamW: 1e-4, SGD: 0.01 |
| weight_decay | 1e-4 | 1e-5 a 1e-3 | Regularización |
| image_size | 512×512 | 256-1024 | Crop durante entrenamiento |
| optimizer | AdamW | AdamW, SGD+momentum, Adam | AdamW más estable |
| scheduler | CosineAnnealing | Cosine, PolyLR, StepLR, OneCycleLR | Cosine más usado |
| loss | Dice + CE | DiceLoss, FocalLoss, JaccardLoss, CE | Combinar Dice+CE es muy efectivo |
| augmentation | Sí | Flip, rotate, color jitter, blur | Usar albumentations |
| ignore_index | 255 | 255 | Píxeles a ignorar en loss |

### 2.8 Losses Disponibles en SMP

```python
# Incluidas en smp.losses
smp.losses.DiceLoss(mode="multiclass")           # Basada en coeficiente Dice
smp.losses.JaccardLoss(mode="multiclass")         # Basada en IoU
smp.losses.FocalLoss(mode="multiclass")           # Para clases desbalanceadas
smp.losses.LovaszLoss(mode="multiclass")          # Optimiza IoU directamente
smp.losses.TverskyLoss(mode="multiclass")         # Generalización de Dice
smp.losses.SoftBCEWithLogitsLoss()                # Para binario
smp.losses.SoftCrossEntropyLoss()                 # CE suavizado

# Combinación típica ganadora en competencias:
loss = 0.5 * smp.losses.DiceLoss(mode="multiclass") + \
       0.5 * nn.CrossEntropyLoss(ignore_index=255)
```

### 2.9 Fine-tuning vs Desde Cero

**Fine-tuning (recomendado):**
- Usar `encoder_weights="imagenet"` → encoder viene preentrenado
- El decoder se inicializa aleatoriamente y se entrena junto con encoder
- LR diferencial: encoder más bajo (1e-5), decoder más alto (1e-4)
- Converge en 50-100 epochs típicamente

```python
# LR diferencial
optimizer = torch.optim.AdamW([
    {"params": model.encoder.parameters(), "lr": 1e-5},
    {"params": model.decoder.parameters(), "lr": 1e-4},
    {"params": model.segmentation_head.parameters(), "lr": 1e-4},
], weight_decay=1e-4)
```

**Freeze encoder:**

```python
# Congelar encoder completamente
for param in model.encoder.parameters():
    param.requires_grad = False
# Solo entrena decoder + head → más rápido, menos datos necesarios
```

**Desde cero:**
- `encoder_weights=None` → todo aleatorio
- Necesita mucho más datos (>10K imágenes)
- Necesita más epochs (200-500+)
- Generalmente no recomendado a menos que el dominio sea muy distinto de ImageNet

### 2.10 Exportación ONNX

```python
import torch

model.eval()
dummy_input = torch.randn(1, 3, 512, 512)

torch.onnx.export(
    model,
    dummy_input,
    "segmentation_model.onnx",
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={
        "input": {0: "batch", 2: "height", 3: "width"},
        "output": {0: "batch", 2: "height", 3: "width"},
    },
    opset_version=17,
)
```

**Output ONNX:**
- Input: `(batch, 3, H, W)` float32 normalizado
- Output: `(batch, num_classes, H, W)` float32 logits
- Post-proceso: `argmax(dim=1)` → máscara de clase `(batch, H, W)`

---

## 3. HuggingFace Transformers

### 3.1 Descripción

La librería `transformers` de HuggingFace incluye varios modelos de segmentación semántica con pesos preentrenados y API unificada. Enfocada en modelos basados en Transformer pero también incluye algunos CNN. Ideal para fine-tuning rápido con el `Trainer` API. Miles de checkpoints disponibles en HuggingFace Hub.

**Licencia:** Apache 2.0

**Repositorio:** https://github.com/huggingface/transformers

### 3.2 Instalación

```bash
pip install transformers
pip install datasets              # para cargar datasets del Hub
pip install evaluate              # para métricas
pip install torch torchvision
pip install albumentations        # data augmentation (opcional)

# Para subir modelos al Hub
pip install huggingface_hub
```

Requiere: Python >= 3.8, PyTorch >= 1.10

### 3.3 Modelos Disponibles para Segmentación Semántica

| Modelo | Clase HF | Backbone | mIoU (ADE20K) | Velocidad | Notas |
|--------|----------|----------|---------------|-----------|-------|
| SegFormer-B0 | `SegformerForSemanticSegmentation` | MiT-B0 | ~37.4% | Rápido | Ligero, ideal para edge |
| SegFormer-B1 | `SegformerForSemanticSegmentation` | MiT-B1 | ~40.8% | Rápido | Buen balance |
| SegFormer-B2 | `SegformerForSemanticSegmentation` | MiT-B2 | ~44.6% | Medio | Balance ideal |
| SegFormer-B3 | `SegformerForSemanticSegmentation` | MiT-B3 | ~47.3% | Medio | Alta precisión |
| SegFormer-B4 | `SegformerForSemanticSegmentation` | MiT-B4 | ~48.5% | Lento | Alta precisión |
| SegFormer-B5 | `SegformerForSemanticSegmentation` | MiT-B5 | ~49.1% | Lento | Máxima precisión |
| Mask2Former | `Mask2FormerForUniversalSegmentation` | Swin-L | ~56.4% | Lento | SOTA, panóptico |
| MaskFormer | `MaskFormerForInstanceSegmentation` | Swin-T/B | ~48-52% | Medio | Semántico + instancia |
| DPT | `DPTForSemanticSegmentation` | ViT-B/L | ~49% | Medio | Dense prediction |
| BEiT | `BeitForSemanticSegmentation` | BEiT-L | ~53.3% | Lento | Preentrenado con BERT-style |
| UPerNet | `UperNetForSemanticSegmentation` | Swin/ConvNeXt | ~48-53% | Medio | Flexible backbone |
| MobileViT | `MobileViTForSemanticSegmentation` | MobileViT | ~36% | Muy rápido | Mobile/edge |

**Checkpoints populares en HF Hub:**

```
nvidia/segformer-b0-finetuned-ade-512-512
nvidia/segformer-b1-finetuned-cityscapes-1024-1024
nvidia/segformer-b2-finetuned-ade-512-512
nvidia/segformer-b3-finetuned-cityscapes-1024-1024
nvidia/segformer-b5-finetuned-ade-640-640
facebook/mask2former-swin-large-cityscapes-semantic
facebook/maskformer-swin-base-ade
openmmlab/upernet-swin-large
nvidia/mit-b0  (solo backbone, para fine-tuning desde cero)
nvidia/mit-b5  (solo backbone)
```

### 3.4 Formato de Datos

HuggingFace Transformers espera pares de imagen + máscara PNG indexada, procesados por el `ImageProcessor` del modelo.

**Usando HuggingFace Datasets (recomendado):**

```python
from datasets import Dataset, Image as HFImage
import os

def create_hf_dataset(image_dir, mask_dir):
    image_files = sorted(os.listdir(image_dir))
    mask_files = sorted(os.listdir(mask_dir))
    return Dataset.from_dict({
        "pixel_values": [os.path.join(image_dir, f) for f in image_files],
        "label": [os.path.join(mask_dir, f) for f in mask_files],
    }).cast_column("pixel_values", HFImage()).cast_column("label", HFImage())

train_ds = create_hf_dataset("dataset/images/train", "dataset/masks/train")
val_ds = create_hf_dataset("dataset/images/val", "dataset/masks/val")
```

**Configurar transforms:**

```python
from transformers import SegformerImageProcessor
from torchvision.transforms import ColorJitter

processor = SegformerImageProcessor(
    do_reduce_labels=False,  # True si el background es 0 y NO está en tus clases
)
jitter = ColorJitter(brightness=0.25, contrast=0.25, saturation=0.25, hue=0.1)

def train_transforms(example_batch):
    images = [jitter(x) for x in example_batch["pixel_values"]]
    labels = [x for x in example_batch["label"]]
    inputs = processor(images, labels)
    return inputs

def val_transforms(example_batch):
    images = [x for x in example_batch["pixel_values"]]
    labels = [x for x in example_batch["label"]]
    inputs = processor(images, labels)
    return inputs

train_ds.set_transform(train_transforms)
val_ds.set_transform(val_transforms)
```

**Nota sobre `do_reduce_labels`:**
- Si tu máscara tiene 0=background y el background NO es una clase que quieres predecir → `do_reduce_labels=True` (resta 1 a todos los labels, convierte 0 → 255=ignorado)
- Si 0=background y SÍ quieres predecirlo → `do_reduce_labels=False`
- El valor 255 siempre se ignora en la loss de SegFormer

### 3.5 Entrenamiento

**Con HuggingFace Trainer (recomendado):**

```python
from transformers import (
    SegformerForSemanticSegmentation,
    TrainingArguments,
    Trainer,
)
import evaluate
import numpy as np
import torch

# 1. Cargar modelo preentrenado
model = SegformerForSemanticSegmentation.from_pretrained(
    "nvidia/mit-b0",                    # backbone preentrenado
    id2label={0: "bg", 1: "road", 2: "building", 3: "vegetation", 4: "sky"},
    label2id={"bg": 0, "road": 1, "building": 2, "vegetation": 3, "sky": 4},
    ignore_mismatched_sizes=True,       # reinicializa head para nuevo num_classes
)

# 2. Métrica
metric = evaluate.load("mean_iou")

def compute_metrics(eval_pred):
    with torch.no_grad():
        logits, labels = eval_pred
        logits_tensor = torch.from_numpy(logits)
        logits_tensor = torch.nn.functional.interpolate(
            logits_tensor, size=labels.shape[-2:],
            mode="bilinear", align_corners=False,
        ).argmax(dim=1)

        pred_labels = logits_tensor.detach().cpu().numpy()
        metrics = metric.compute(
            predictions=pred_labels,
            references=labels,
            num_labels=5,
            ignore_index=255,
            reduce_labels=False,
        )
        return {
            "mean_iou": metrics["mean_iou"],
            "mean_accuracy": metrics["mean_accuracy"],
        }

# 3. Training arguments
training_args = TrainingArguments(
    output_dir="segformer-finetuned",
    learning_rate=6e-5,
    num_train_epochs=50,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    save_total_limit=3,
    eval_strategy="epoch",
    save_strategy="epoch",
    logging_steps=10,
    eval_accumulation_steps=5,
    remove_unused_columns=False,       # IMPORTANTE: no remover columna de imagen
    push_to_hub=False,
    load_best_model_at_end=True,
    metric_for_best_model="mean_iou",
    lr_scheduler_type="cosine",
    warmup_ratio=0.1,
    fp16=True,                         # mixed precision
    dataloader_num_workers=4,
    seed=42,
)

# 4. Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    compute_metrics=compute_metrics,
)

# 5. Entrenar
trainer.train()

# 6. Guardar
trainer.save_model("segformer-finetuned-final")
```

**Entrenamiento manual con PyTorch (alternativa):**

```python
from transformers import SegformerForSemanticSegmentation
import torch

model = SegformerForSemanticSegmentation.from_pretrained(
    "nvidia/mit-b2", num_labels=5, ignore_mismatched_sizes=True
)
optimizer = torch.optim.AdamW(model.parameters(), lr=6e-5, weight_decay=0.01)

model.to("cuda")
for epoch in range(50):
    model.train()
    for batch in train_loader:
        pixel_values = batch["pixel_values"].to("cuda")
        labels = batch["labels"].to("cuda")

        outputs = model(pixel_values=pixel_values, labels=labels)
        loss = outputs.loss  # loss calculado internamente

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
```

### 3.6 Hiperparámetros Clave

| Parámetro | Default recomendado | Rango típico | Notas |
|-----------|-------------------|--------------|-------|
| model checkpoint | `nvidia/mit-b0` | B0-B5, Swin, etc. | B0=rápido, B5=preciso |
| learning_rate | 6e-5 | 1e-5 a 2e-4 | Para SegFormer fine-tuning |
| num_train_epochs | 50 | 20-200 | Depende del dataset |
| per_device_train_batch_size | 8 | 2-16 | Limitado por VRAM |
| lr_scheduler_type | `"cosine"` | cosine, linear, polynomial | Cosine más estable |
| warmup_ratio | 0.1 | 0.0-0.2 | Warmup al inicio |
| weight_decay | 0.01 | 0.0-0.05 | Regularización AdamW |
| fp16 | True | True/False | AMP para ahorro de memoria |
| do_reduce_labels | False | True/False | Depende si 0=bg ignorado |
| ignore_mismatched_sizes | True | True | Siempre True para fine-tuning |
| image size | 512×512 | 256-1024 | SegFormer acepta cualquier tamaño |

### 3.7 Fine-tuning vs Desde Cero

**Fine-tuning (estándar):**
- Cargar `nvidia/mit-b{0-5}` (backbone preentrenado en ImageNet)
- Se reinicializa la head de segmentación para tu número de clases
- O cargar modelo ya fine-tuned en Cityscapes/ADE20K y re-fine-tune para tu dominio

**Desde un checkpoint finetuned:**
```python
# Fine-tune un modelo que ya fue entrenado en Cityscapes
model = SegformerForSemanticSegmentation.from_pretrained(
    "nvidia/segformer-b2-finetuned-cityscapes-1024-1024",
    num_labels=5,                     # tus clases
    ignore_mismatched_sizes=True,     # reinicializa head
)
```

**Desde cero:** No recomendado. Los modelos de HF están diseñados para fine-tuning.

### 3.8 Exportación ONNX

```python
from transformers import SegformerForSemanticSegmentation
import torch

model = SegformerForSemanticSegmentation.from_pretrained("segformer-finetuned-final")
model.eval()

dummy = torch.randn(1, 3, 512, 512)
torch.onnx.export(
    model,
    dummy,
    "segformer.onnx",
    input_names=["pixel_values"],
    output_names=["logits"],
    dynamic_axes={
        "pixel_values": {0: "batch", 2: "height", 3: "width"},
        "logits": {0: "batch", 2: "height", 3: "width"},
    },
    opset_version=17,
)

# O usando optimum de HuggingFace:
# pip install optimum[onnxruntime]
# optimum-cli export onnx --model segformer-finetuned-final segformer-onnx/
```

**Output ONNX:**
- Input: `pixel_values` — `(batch, 3, H, W)` float32 normalizado con ImageNet stats
- Output: `logits` — `(batch, num_classes, H/4, W/4)` float32
- **IMPORTANTE:** SegFormer output es 4x menor que el input. Necesitas interpolar:
  ```
  logits = resize(logits, size=(H, W), mode=bilinear)
  mask = argmax(logits, dim=1)
  ```

---

## 4. MMSegmentation (OpenMMLab)

### 4.1 Descripción

El framework más completo para segmentación semántica. 30+ algoritmos, modular, basado en configs Python. Parte del ecosistema OpenMMLab. Soporta los modelos más recientes y es extensible. Curva de aprendizaje más alta pero máxima flexibilidad.

**Licencia:** Apache 2.0

**Repositorio:** https://github.com/open-mmlab/mmsegmentation

### 4.2 Instalación

```bash
# Método recomendado con MIM
pip install -U openmim
mim install "mmengine>=0.6.0"
mim install "mmcv>=2.0.0rc4,<2.1.0"
mim install "mmsegmentation>=1.0.0"

# O desde source (acceso a todos los configs):
git clone https://github.com/open-mmlab/mmsegmentation.git
cd mmsegmentation
pip install -v -e .

# Opcional: para Mask2Former/MaskFormer
pip install mmdet
```

Requiere: Python >= 3.7, PyTorch >= 1.8, CUDA >= 10.2

### 4.3 Modelos Disponibles

MMSegmentation tiene el catálogo más extenso. Organizado por familias:

**CNN clásicos:**

| Modelo | Config prefix | mIoU (ADE20K) | Velocidad | Año |
|--------|--------------|---------------|-----------|-----|
| FCN | `fcn_r50-d8` | ~36-39% | Rápido | 2015 |
| PSPNet | `pspnet_r50-d8` | ~41-44% | Medio | 2017 |
| DeepLabV3 | `deeplabv3_r50-d8` | ~42-45% | Medio | 2017 |
| DeepLabV3+ | `deeplabv3plus_r50-d8` | ~43-46% | Medio | 2018 |
| UNet | `unet_s5-d16` | ~variable | Medio | 2016 |
| UPerNet | `upernet_r50` | ~42-44% | Medio | 2018 |
| OCRNet | `ocrnet_hr48` | ~44-46% | Medio | 2020 |
| PointRend | `pointrend_r50` | ~38% | Medio | 2020 |

**Ligeros (tiempo real):**

| Modelo | Config prefix | mIoU (Cityscapes) | FPS | Notas |
|--------|--------------|-------------------|-----|-------|
| BiSeNetV1 | `bisenetv1` | ~74-75% | ~65 | Dos ramas |
| BiSeNetV2 | `bisenetv2` | ~73-74% | ~156 | Más rápido |
| STDC | `stdc1/stdc2` | ~74-77% | ~250 | Muy rápido |
| Fast-SCNN | `fast_scnn` | ~70% | Alto | Ultra ligero |
| CGNet | `cgnet` | ~68% | Alto | Contexto guiado |
| ERFNet | `erfnet` | ~72% | Alto | Eficiente |
| PIDNet | `pidnet-s/m/l` | ~78-80% | ~93 | Reciente, buen balance |
| ICNet | `icnet` | ~73% | Alto | Image cascade |
| DDRNet | `ddrnet` | ~77-79% | ~160 | Dual resolution |

**Transformer (SOTA):**

| Modelo | Config prefix | mIoU (ADE20K) | Params | Notas |
|--------|--------------|---------------|--------|-------|
| SegFormer | `segformer_mit-b0` a `b5` | 37-51% | 3.8-84M | Eficiente |
| Segmenter | `segmenter_vit-b` | ~48% | 86M | ViT puro |
| SETR | `setr_vit-l` | ~48% | 308M | Serialized Transformer |
| DPT | `dpt_vit-b16` | ~47% | 86M | Dense Prediction |
| Mask2Former | `mask2former_swin-l` | ~56% | 216M | SOTA absoluto |
| MaskFormer | `maskformer_swin-b` | ~52% | 102M | Precursor Mask2Former |
| K-Net | `knet_swin-l` | ~54% | ~200M | Kernel-based |
| SAN | `san_vit-l` | ~53% | ~300M | Side Adapter Network |
| SegNeXt | `segnext_large` | ~52% | 49M | Eficiente Transformer |

**Backbones soportados:** ResNet, ResNeXt, HRNet, MobileNetV2, MobileNetV3, Swin Transformer, ViT, ConvNeXt, PoolFormer, Twins, BEiT, ResNeSt, MAE, MIT (SegFormer)

### 4.4 Formato de Datos

MMSegmentation soporta múltiples formatos nativamente:

**Pascal VOC style (el más simple para custom datasets):**

```
data/
├── my_dataset/
│   ├── img_dir/
│   │   ├── train/
│   │   │   ├── xxx.jpg
│   │   │   └── ...
│   │   └── val/
│   │       ├── yyy.jpg
│   │       └── ...
│   └── ann_dir/
│       ├── train/
│       │   ├── xxx.png    ← máscara indexada
│       │   └── ...
│       └── val/
│           ├── yyy.png
│           └── ...
```

**Registrar dataset custom:**

```python
# En el config file:
dataset_type = 'BaseSegDataset'    # dataset genérico
data_root = 'data/my_dataset'

# Definir clases y paleta de colores
metainfo = dict(
    classes=('background', 'road', 'building', 'vegetation', 'sky'),
    palette=[[0, 0, 0], [128, 64, 128], [70, 70, 70], [107, 142, 35], [70, 130, 180]]
)

train_dataloader = dict(
    batch_size=4,
    num_workers=4,
    dataset=dict(
        type=dataset_type,
        data_root=data_root,
        data_prefix=dict(img_path='img_dir/train', seg_map_path='ann_dir/train'),
        metainfo=metainfo,
    )
)
```

**Datasets predefinidos:** Cityscapes, ADE20K, Pascal VOC, COCO-Stuff 10K/164K, PASCAL Context, LoveDA, Potsdam, iSAID, Mapillary Vistas, etc.

### 4.5 Entrenamiento

Controlado por archivos config de Python con herencia.

**Descargar modelo preentrenado:**

```bash
# Descargar config y checkpoint
mim download mmsegmentation --config pspnet_r50-d8_4xb2-40k_cityscapes-512x1024 --dest ./checkpoints
mim download mmsegmentation --config segformer_mit-b2_8xb2-160k_ade20k-512x512 --dest ./checkpoints
mim download mmsegmentation --config deeplabv3plus_r50-d8_4xb2-40k_cityscapes-512x1024 --dest ./checkpoints
```

**Config custom (mi_segconfig.py):**

```python
_base_ = [
    'mmsegmentation/configs/pspnet/pspnet_r50-d8_4xb2-40k_cityscapes-512x1024.py'
]

# Modificar número de clases
model = dict(
    decode_head=dict(num_classes=5),
    auxiliary_head=dict(num_classes=5),
)

# Dataset custom
data_root = '/path/to/my_dataset'
metainfo = dict(
    classes=('background', 'road', 'building', 'vegetation', 'sky'),
    palette=[[0, 0, 0], [128, 64, 128], [70, 70, 70], [107, 142, 35], [70, 130, 180]]
)

crop_size = (512, 512)

train_pipeline = [
    dict(type='LoadImageFromFile'),
    dict(type='LoadAnnotations'),
    dict(type='RandomResize', scale=(2048, 512), ratio_range=(0.5, 2.0), keep_ratio=True),
    dict(type='RandomCrop', crop_size=crop_size, cat_max_ratio=0.75),
    dict(type='RandomFlip', prob=0.5),
    dict(type='PhotoMetricDistortion'),
    dict(type='PackSegInputs'),
]

val_pipeline = [
    dict(type='LoadImageFromFile'),
    dict(type='Resize', scale=(2048, 512), keep_ratio=True),
    dict(type='LoadAnnotations'),
    dict(type='PackSegInputs'),
]

train_dataloader = dict(
    batch_size=4,
    num_workers=4,
    dataset=dict(
        type='BaseSegDataset',
        data_root=data_root,
        data_prefix=dict(img_path='img_dir/train', seg_map_path='ann_dir/train'),
        metainfo=metainfo,
        pipeline=train_pipeline,
    )
)

val_dataloader = dict(
    batch_size=1,
    num_workers=4,
    dataset=dict(
        type='BaseSegDataset',
        data_root=data_root,
        data_prefix=dict(img_path='img_dir/val', seg_map_path='ann_dir/val'),
        metainfo=metainfo,
        pipeline=val_pipeline,
    )
)

val_evaluator = dict(type='IoUMetric', iou_metrics=['mIoU'])

# Cargar pesos preentrenados
load_from = 'checkpoints/pspnet_r50-d8_512x1024_40k_cityscapes.pth'

# Training config
train_cfg = dict(type='IterBasedTrainLoop', max_iters=40000, val_interval=4000)

# Optimizer (LR escalado: default 0.01 para 8 GPUs × batch 2 = 16 efectivo)
# Para 1 GPU × batch 4: lr = 0.01 × (4/16) = 0.0025
optim_wrapper = dict(
    optimizer=dict(
        type='SGD',
        lr=0.0025,
        momentum=0.9,
        weight_decay=0.0005,
    )
)

# LR scheduler
param_scheduler = [
    dict(type='PolyLR', power=0.9, eta_min=1e-4, by_epoch=False),
]

# Hooks
default_hooks = dict(
    checkpoint=dict(type='CheckpointHook', by_epoch=False, interval=4000),
    logger=dict(type='LoggerHook', interval=50),
)
```

**Ejecutar entrenamiento:**

```bash
# Single GPU
python tools/train.py mi_segconfig.py

# Multi-GPU (4 GPUs)
bash tools/dist_train.sh mi_segconfig.py 4

# Resumir
python tools/train.py mi_segconfig.py --resume

# Evaluar
python tools/test.py mi_segconfig.py work_dirs/mi_segconfig/iter_40000.pth
```

**Entrenamiento programático:**

```python
from mmengine.config import Config
from mmengine.runner import Runner

cfg = Config.fromfile('mi_segconfig.py')
runner = Runner.from_cfg(cfg)
runner.train()
```

### 4.6 Hiperparámetros Clave

| Parámetro | Default | Rango típico | Notas |
|-----------|---------|--------------|-------|
| max_iters | 40K (1x), 80K (2x), 160K (4x) | 20K-320K | Iteraciones, no epochs |
| batch_size | 2 (por GPU) | 2-8 | VRAM limitante |
| num_workers | 4 | 2-8 | Carga de datos |
| lr (SGD) | 0.01 | 0.001-0.05 | Escalar por batch efectivo |
| lr (AdamW) | 6e-5 | 1e-5 a 2e-4 | Para transformers |
| momentum | 0.9 | 0.9-0.99 | Solo SGD |
| weight_decay | 0.0005 (SGD) / 0.01 (AdamW) | | Regularización |
| scheduler | PolyLR (power=0.9) | Poly, Cosine, Step | Poly es el estándar en seg |
| crop_size | (512, 512) | (256, 256) a (1024, 1024) | Cityscapes: (512, 1024) |
| cat_max_ratio | 0.75 | 0.5-0.9 | Max ratio de una clase en crop |
| val_interval | 4000 | 1000-8000 | Cada cuántas iters evaluar |
| loss decode_head | CrossEntropyLoss | CE, Focal, Dice, Lovasz | loss_weight=1.0 |
| loss auxiliary_head | CrossEntropyLoss | igual | loss_weight=0.4 |

**Nota sobre escalado de LR:** MMSeg usa la convención de que `lr=0.01` es para 8 GPUs con batch_size=2 (efectivo=16). Si usas 1 GPU con batch_size=4 (efectivo=4), escala: `lr = 0.01 × (4/16) = 0.0025`.

**Para modelos Transformer (SegFormer, Mask2Former):**

```python
# SegFormer usa AdamW con LR diferencial
optim_wrapper = dict(
    type='OptimWrapper',
    optimizer=dict(type='AdamW', lr=6e-5, betas=(0.9, 0.999), weight_decay=0.01),
    paramwise_cfg=dict(
        custom_keys={
            'pos_block': dict(decay_mult=0.),
            'norm': dict(decay_mult=0.),
            'head': dict(lr_mult=10.),      # head con LR 10x mayor
        }
    )
)
```

### 4.7 Losses en MMSegmentation

```python
# En decode_head config:
loss_decode=[
    dict(type='CrossEntropyLoss', use_sigmoid=False, loss_weight=1.0),
]

# Alternativas:
dict(type='CrossEntropyLoss', use_sigmoid=False, class_weight=[1.0, 2.0, 1.5, ...])
dict(type='FocalLoss', gamma=2.0, alpha=0.25, loss_weight=1.0)
dict(type='DiceLoss', loss_weight=1.0)
dict(type='LovaszLoss', loss_type='multi_class', loss_weight=1.0)

# Combinación (múltiples losses):
loss_decode=[
    dict(type='CrossEntropyLoss', use_sigmoid=False, loss_weight=1.0),
    dict(type='DiceLoss', loss_weight=3.0),
]
```

**OHEM (Online Hard Example Mining):**

```python
# En decode_head:
decode_head=dict(
    type='PSPHead',
    sampler=dict(type='OHEMPixelSampler', thresh=0.7, min_kept=100000),
    # Solo entrena con píxeles donde confidence < 0.7
)
```

### 4.8 Fine-tuning vs Desde Cero

**Fine-tuning (recomendado):**
- Usar `load_from = 'checkpoints/modelo_pretrained.pth'`
- El modelo carga pesos preentrenados en COCO/Cityscapes/ADE20K
- Solo cambias `num_classes` en heads
- LR reducido (0.001-0.005 para SGD, 1e-5 para AdamW)
- 20K-40K iters suele bastar

**Freeze backbone:**

```python
model = dict(
    backbone=dict(
        frozen_stages=4,    # Congela las primeras 4 stages del backbone
    )
)
```

**Desde cero:**
- Omitir `load_from`
- Necesita mucho más datos e iteraciones (160K-320K+)
- LR más alto
- Totalmente viable con MMSeg (a diferencia de otros frameworks)

### 4.9 Exportación ONNX (vía MMDeploy)

```bash
pip install mmdeploy

# Exportar a ONNX Runtime con shape dinámico
python tools/deploy.py \
    configs/mmseg/segmentation_onnxruntime_dynamic.py \
    mi_segconfig.py \
    work_dirs/mi_segconfig/iter_40000.pth \
    test_image.jpg \
    --work-dir onnx_output \
    --device cpu \
    --dump-info

# Para TensorRT con shape estático:
python tools/deploy.py \
    configs/mmseg/segmentation_tensorrt_static-512x512.py \
    mi_segconfig.py \
    work_dirs/mi_segconfig/iter_40000.pth \
    test_image.jpg \
    --work-dir trt_output \
    --device cuda:0
```

**Output ONNX:**
- Input: `(batch, 3, H, W)` float32 normalizado
- Output: `(batch, num_classes, H, W)` float32 logits
- Algunos modelos solo soportan shape estático (PSPNet, Fast-SCNN)

**Nota:** PSPNet y Fast-SCNN usan `nn.AdaptiveAvgPool2d` que no es bien soportado en ONNX con shape dinámico. Usa exportación con shape estático para estos modelos.

---

## 5. Comparación Rápida

| Aspecto | SMP (qubvel) | HuggingFace Transformers | MMSegmentation |
|---------|-------------|------------------------|----------------|
| Install | `pip install segmentation-models-pytorch` | `pip install transformers` | `mim install mmseg + deps` |
| Formato datos | Custom Dataset (tu código) | HF Datasets + ImageProcessor | Config-based (Pascal VOC, Cityscapes, etc.) |
| API | Modelo puro, tú haces training loop | Trainer API o manual | `python train.py config.py` |
| Config complejidad | Baja (parámetros directos) | Media (TrainingArguments) | Alta (configs .py con herencia) |
| Modelos | 12 arquitecturas × 800+ encoders | ~10 modelos, miles checkpoints en Hub | 30+ algoritmos |
| Punto fuerte | Flexibilidad, modularidad encoder-decoder | Facilidad, ecosistema Hub, SegFormer | Catálogo más completo, reproducibilidad |
| Fine-tuning | Sí (encoder preentrenado) | Sí (miles de checkpoints) | Sí (model zoo extenso) |
| Desde cero | Sí (`encoder_weights=None`) | No recomendado | Sí (totalmente soportado) |
| Multi-GPU | Vía Lightning/DDP manual | Vía Trainer (automático) | Nativo DDP |
| ONNX export | `torch.onnx.export` directo | `torch.onnx.export` o optimum | Vía MMDeploy |
| Training loop | Manual o Lightning | HF Trainer (automático) | Automático (Runner) |
| Losses incluidos | Sí (Dice, Focal, Jaccard, Lovasz, Tversky) | Solo CE (interno en modelo) | Sí (CE, Dice, Focal, Lovasz, OHEM) |
| Métricas incluidas | No (usar torchmetrics) | Vía evaluate library | Sí (mIoU, mAcc, aAcc) |
| Licencia | MIT | Apache 2.0 | Apache 2.0 |

---

## 6. Viabilidad en Rust para Segmentación

### 6.1 Estado Actual

Idéntico al análisis de detección de objetos: **Rust no es viable para entrenamiento de segmentación**. Los mismos limitantes aplican:

- **Burn:** No tiene implementaciones de UNet, DeepLabV3, SegFormer, etc.
- **tch-rs:** Bindings a LibTorch, pero reimplementar training logic es impráctico
- **Candle (HuggingFace):** Enfocado en inferencia LLM, no segmentación

### 6.2 Lo que Rust SÍ puede hacer

**Inferencia con ONNX Runtime:** El crate `ort` es maduro y rápido.

```rust
use ort::{Session, Value};

// Cargar modelo ONNX exportado
let session = Session::builder()?.commit_from_file("segmentation.onnx")?;

// Preparar input: imagen normalizada (1, 3, H, W)
let input = prepare_input(&image);  // normalize con ImageNet stats
let outputs = session.run(ort::inputs![input]?)?;

// Output: (1, num_classes, H, W) → argmax por canal
let logits = outputs[0].try_extract_tensor::<f32>()?;
let mask = argmax_channel(&logits);  // (H, W) con class_ids
```

**Pre/post-procesamiento en Rust:**
- Resize, normalización, padding → crate `image` + operaciones manuales
- Argmax sobre canales para obtener máscara de clase
- Conversión de máscara a contornos/polígonos si necesario
- Colorización de máscara para visualización

**Generación de máscaras de anotación en Rust:**
- Tu app de anotación puede generar las máscaras PNG directamente
- Crate `image` para guardar PNG grayscale de 8 bits
- Cada píxel = class_id asignado por el usuario

### 6.3 Arquitectura Recomendada

```
┌──────────────────────────────────────┐
│           App Rust (UI)              │
│  - Interfaz de anotación semántica   │
│  - Pintar píxeles con class_id       │
│  - Exportar máscaras PNG indexadas    │
│  - Dataset management (splits)       │
│  - ONNX inference (producción)       │
│  - Visualización de resultados       │
└──────────────┬───────────────────────┘
               │ subprocess / pyo3
               ▼
┌──────────────────────────────────────┐
│       Python Training Bridge         │
│  - Recibe: dataset_path,             │
│    model_type, arch, encoder,        │
│    hyperparams                       │
│  - Ejecuta: SMP / HF / MMSeg        │
│  - Retorna: checkpoint_path,         │
│    métricas (mIoU, loss), logs       │
│  - Exporta: modelo ONNX             │
└──────────────────────────────────────┘
```

---

## 7. Resumen de Comandos pip

```bash
# ============================================
# SMP (Segmentation Models PyTorch)
# ============================================
pip install segmentation-models-pytorch
pip install torch torchvision
pip install albumentations
pip install pytorch-lightning           # training loop (opcional)
pip install torchmetrics                # métricas

# ============================================
# HuggingFace Transformers
# ============================================
pip install transformers
pip install datasets
pip install evaluate
pip install torch torchvision
pip install albumentations              # opcional
# pip install optimum[onnxruntime]      # para exportar ONNX

# ============================================
# MMSegmentation (OpenMMLab)
# ============================================
pip install -U openmim
mim install "mmengine>=0.6.0"
mim install "mmcv>=2.0.0rc4,<2.1.0"
mim install "mmsegmentation>=1.0.0"
# pip install mmdet                     # para Mask2Former/MaskFormer
# pip install mmdeploy                  # para exportar ONNX

# ============================================
# Utilidades compartidas
# ============================================
pip install supervision                 # visualización de segmentación
pip install onnxruntime                 # inferencia ONNX CPU
pip install onnxruntime-gpu             # inferencia ONNX GPU
pip install opencv-python               # procesamiento de imágenes
```

---

## 8. Output ONNX — Diferencias entre Frameworks

| Framework | Input ONNX | Output ONNX | Post-proceso |
|-----------|-----------|-------------|-------------|
| SMP | `(B, 3, H, W)` normalizado ImageNet | `(B, C, H, W)` logits, misma resolución | `argmax(dim=1)` → máscara |
| HuggingFace SegFormer | `(B, 3, H, W)` normalizado ImageNet | `(B, C, H/4, W/4)` logits, 4x menor | `resize → argmax(dim=1)` |
| MMSeg (general) | `(B, 3, H, W)` normalizado ImageNet | `(B, C, H, W)` logits, misma resolución | `argmax(dim=1)` → máscara |

**Normalización ImageNet estándar:**
- mean = [0.485, 0.456, 0.406]
- std = [0.229, 0.224, 0.225]
- Input en rango [0, 1] antes de normalizar

**Post-proceso en Rust (ONNX Runtime):**

```rust
// 1. Preprocesar imagen
fn preprocess(image: &RgbImage) -> Array4<f32> {
    let mean = [0.485, 0.456, 0.406];
    let std = [0.229, 0.224, 0.225];
    // Resize a target_size, convertir a float [0,1], normalizar, transponer a CHW
}

// 2. Post-procesar output
fn postprocess(logits: &ArrayView4<f32>, original_size: (u32, u32)) -> Array2<u8> {
    // Si es SegFormer: resize logits de (H/4, W/4) a (H, W)
    // argmax sobre dim=1 (canales) → obtener class_id por píxel
    // Resultado: (H, W) con valores u8 = class_id
}
```
