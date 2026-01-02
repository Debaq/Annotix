# Módulo: Ultralytics YOLO

Módulo de entrenamiento para Annotix Connector que soporta YOLO v8, v9, v10 y v11.

## Soporte

- **Detección de objetos** (bbox)
- **Segmentación de instancias** (mask)
- **Clasificación de imágenes** (classification)
- **Estimación de pose** (keypoints)

## Modelos Disponibles

### Detección
- `yolov8n`, `yolov8s`, `yolov8m`, `yolov8l`, `yolov8x`
- `yolov9c`, `yolov9e`
- `yolov10n`, `yolov10s`, `yolov10m`, `yolov10l`, `yolov10x`
- `yolov11n`, `yolov11s`, `yolov11m`, `yolov11l`, `yolov11x`

### Segmentación
- `yolov8n-seg`, `yolov8s-seg`, `yolov8m-seg`, `yolov8l-seg`, `yolov8x-seg`

### Clasificación
- `yolov8n-cls`, `yolov8s-cls`, `yolov8m-cls`

### Pose
- `yolov8n-pose`, `yolov8s-pose`, `yolov8m-pose`, `yolov8l-pose`

## Instalación

Este módulo se descarga automáticamente cuando el Connector lo necesita. Para instalación manual:

```bash
# Instalar dependencias
pip install -r requirements.txt

# O individualmente
pip install ultralytics>=8.0.0 torch>=2.0.0 torchvision>=0.15.0
```

## Estructura de Dataset

El módulo espera un dataset en formato YOLO:

```
dataset/
├── images/
│   ├── train/
│   │   ├── img1.jpg
│   │   ├── img2.jpg
│   │   └── ...
│   └── val/
│       ├── img3.jpg
│       └── ...
├── labels/
│   ├── train/
│   │   ├── img1.txt
│   │   ├── img2.txt
│   │   └── ...
│   └── val/
│       ├── img3.txt
│       └── ...
└── data.yaml (se genera automáticamente)
```

### Formato de Labels

**Detección (bbox):**
```
<class_id> <x_center> <y_center> <width> <height>
0 0.5 0.5 0.3 0.4
```

**Segmentación (mask):**
```
<class_id> <x1> <y1> <x2> <y2> <x3> <y3> ...
0 0.1 0.2 0.3 0.4 0.5 0.6
```

Coordenadas normalizadas (0-1).

## Uso desde PWA

La PWA envía configuración al Connector:

```javascript
{
  "framework": "ultralytics",
  "model": "yolov8n",
  "projectType": "bbox",
  "epochs": 100,
  "batch": 16,
  "imgsz": 640,
  "device": "auto",
  "lr": 0.001,
  "optimizer": "Adam",
  "projectName": "my_project",
  "classes": [
    {"id": 0, "name": "cat"},
    {"id": 1, "name": "dog"}
  ]
}
```

El módulo:
1. Crea `data.yaml` con las clases
2. Carga el modelo YOLO especificado
3. Entrena con los parámetros dados
4. Exporta a ONNX automáticamente
5. Reporta progreso en tiempo real

## Resultados

Después del entrenamiento, se guarda:

```
runs/train/my_project_20250130_143022/
├── weights/
│   ├── best.pt       # Mejor modelo
│   ├── last.pt       # Último checkpoint
│   └── best.onnx     # Exportado a ONNX
├── results.csv       # Métricas por epoch
├── results.png       # Gráficos de entrenamiento
├── confusion_matrix.png
├── PR_curve.png
└── ...
```

## Desarrollo

Para modificar este módulo:

1. Editar `trainer.py`
2. Actualizar versión en `module.json`
3. Re-empaquetar: `zip -r ultralytics_yolo.zip ultralytics_yolo/`
4. Subir a servidor y actualizar `manifest.json`

---

**Versión:** 1.0.0
**Autor:** TecMedHub - Universidad Austral de Chile
