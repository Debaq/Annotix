# Annotix Connector - Motor Acompañante Modular

## Arquitectura de Entrenamiento Local de IA para Annotix

---

## 🎯 Visión General

El **Annotix Connector** es un servidor local que permite entrenar modelos de IA directamente en la PC del usuario usando datos anotados desde la PWA de Annotix.

### Características Principales

✅ **Arquitectura Modular**: Motor base ligero (~50MB) + módulos descargables bajo demanda
✅ **Entrenamiento Real**: Integración con Ultralytics YOLO, PyTorch, TensorFlow
✅ **Multi-plataforma**: Windows (.exe), Linux (binario), macOS (.app)
✅ **Actualizaciones**: Módulos se actualizan independientemente del motor base
✅ **Offline-first**: Una vez descargados, los módulos funcionan sin internet

---

## 📐 Arquitectura

### Componentes

```
┌─────────────────────────────────────────────────────┐
│                  ANNOTIX PWA                        │
│              (navegador web)                        │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (localhost:5000)
                   ▼
┌─────────────────────────────────────────────────────┐
│            ANNOTIX CONNECTOR                        │
│          (motor_server.py → .exe)                   │
│                                                     │
│  ┌──────────────────────────────────────────┐     │
│  │   Module Manager                         │     │
│  │   - Descarga módulos desde servidor      │     │
│  │   - Verifica versiones                   │     │
│  │   - Carga dinámicamente trainers         │     │
│  └──────────────────────────────────────────┘     │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ Flask API    │  │ Tkinter GUI  │               │
│  │ (endpoints)  │  │ (file dialog)│               │
│  └──────────────┘  └──────────────┘               │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│               MÓDULOS (descargables)                │
│                                                     │
│  ┌──────────────────────────────────┐             │
│  │  ultralytics_yolo/ (500MB)       │             │
│  │  - YOLOv8, v9, v10, v11          │             │
│  │  - Detection, Segmentation       │             │
│  └──────────────────────────────────┘             │
│                                                     │
│  ┌──────────────────────────────────┐             │
│  │  pytorch_custom/ (300MB)         │             │
│  │  - Custom architectures          │             │
│  └──────────────────────────────────┘             │
│                                                     │
│  ┌──────────────────────────────────┐             │
│  │  tensorflow_unet/ (600MB)        │             │
│  │  - U-Net segmentation            │             │
│  └──────────────────────────────────┘             │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Flujo de Trabajo

### 1. Usuario Anota en PWA
```javascript
// Usuario crea proyecto en Annotix PWA
// Anota imágenes con bounding boxes/máscaras
// Va a: Exportar → Entrenar con Connector
```

### 2. Configuración de Entrenamiento
```javascript
{
  framework: "ultralytics",
  model: "yolov8n",
  epochs: 100,
  batch: 16,
  imgsz: 640,
  device: "auto",
  classes: [{id: 0, name: "gato"}, {id: 1, name: "perro"}]
}
```

### 3. Connector Verifica Módulo
```python
# Motor verifica si módulo está instalado
if not module_manager.check_module_available("ultralytics_yolo"):
    # Descarga desde http://tmeduca.org/annotix/modules/
    module_manager.download_module("ultralytics_yolo")
```

### 4. Selección de Dataset
```python
# Abre diálogo nativo para seleccionar carpeta
dataset_path = select_dataset_folder()
# Usuario selecciona: C:/Users/Juan/Documentos/mi_dataset/
```

### 5. Entrenamiento
```python
# Carga trainer del módulo
train_fn = module_manager.load_module_trainer("ultralytics_yolo")

# Ejecuta entrenamiento en background
train_fn(config, dataset_path, progress_callback)
```

### 6. Resultados
```
runs/train/mi_proyecto_20250130/
├── weights/
│   ├── best.pt      # PyTorch
│   ├── best.onnx    # Exportado para inferencia
│   └── last.pt
├── results.csv      # Métricas
└── results.png      # Gráficos
```

---

## 📦 Estructura de Archivos

```
annotix-connector/
├── motor_server.py              # Servidor principal
├── requirements.txt             # Deps motor base
├── BUILD_INSTRUCTIONS.md        # Compilación PyInstaller
├── CONNECTOR_README.md          # Este archivo
│
├── modules/
│   ├── manifest.json            # Lista de módulos disponibles
│   │
│   └── ultralytics_yolo/
│       ├── __init__.py          # Exporta train()
│       ├── trainer.py           # Lógica de entrenamiento
│       ├── module.json          # Metadata
│       ├── requirements.txt     # Deps del módulo
│       └── README.md
│
└── cache/                       # Archivos temporales
```

---

## 🔌 API Endpoints

### GET `/status`
Verifica si el connector está online.

**Response:**
```json
{
  "online": true,
  "version": "2.0.0",
  "modules": ["ultralytics_yolo"]
}
```

---

### GET `/modules`
Lista módulos instalados y disponibles.

**Response:**
```json
{
  "installed": {
    "ultralytics_yolo": {
      "version": "1.0.0",
      "frameworks": ["ultralytics"]
    }
  },
  "available": [
    {
      "id": "ultralytics_yolo",
      "version": "1.0.0",
      "download_url": "ultralytics_yolo.zip"
    }
  ]
}
```

---

### POST `/modules/<module_id>/download`
Descarga e instala un módulo.

**Request:**
```bash
curl -X POST http://localhost:5000/modules/ultralytics_yolo/download
```

**Response:**
```json
{
  "success": true,
  "message": "Módulo ultralytics_yolo instalado correctamente"
}
```

---

### POST `/entrenar`
Inicia un entrenamiento.

**Request:**
```json
{
  "framework": "ultralytics",
  "model": "yolov8n",
  "epochs": 100,
  "batch": 16,
  "imgsz": 640,
  "device": "auto",
  "projectName": "mi_proyecto",
  "classes": [{"id": 0, "name": "gato"}]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Entrenamiento iniciado en segundo plano",
  "dataset": "/Users/juan/dataset",
  "module": "ultralytics_yolo"
}
```

---

### GET `/training/status`
Obtiene el progreso del entrenamiento actual.

**Response:**
```json
{
  "active": true,
  "progress": 45,
  "current_epoch": 45,
  "total_epochs": 100,
  "message": "Epoch 45/100 - Loss: 0.1234"
}
```

---

## 🛠️ Instalación y Uso

### Para Desarrolladores

```bash
# 1. Clonar repositorio
git clone https://github.com/debaq/Annotix.git
cd Annotix

# 2. Instalar dependencias del motor
pip install -r requirements.txt

# 3. Ejecutar servidor
python motor_server.py

# 4. Abrir PWA en navegador
# http://localhost:8000 (o tu servidor de desarrollo)
```

### Para Usuarios Finales

1. Descargar ejecutable desde:
   - **Windows:** `http://tmeduca.org/annotix/download/connector/windows/AnnotixConnector.exe`
   - **Linux:** `http://tmeduca.org/annotix/download/connector/linux/AnnotixConnector`
   - **macOS:** `http://tmeduca.org/annotix/download/connector/macos/AnnotixConnector.app.zip`

2. Ejecutar el programa (abre servidor en puerto 5000)

3. Usar Annotix PWA normalmente - detectará el connector automáticamente

---

## 📥 Distribución de Módulos

Los módulos se hospedan en:
```
http://tmeduca.org/annotix/modules/
├── manifest.json
├── ultralytics_yolo.zip (500MB)
├── pytorch_custom.zip (300MB)
└── tensorflow_unet.zip (600MB)
```

Cuando un usuario necesita un módulo:
1. Motor descarga ZIP automáticamente
2. Extrae a `modules/`
3. Actualiza lista de instalados
4. Listo para entrenar

---

## 🔧 Desarrollo de Nuevos Módulos

### Plantilla Básica

```python
# modules/mi_modulo/__init__.py
from .trainer import train
__version__ = "1.0.0"

# modules/mi_modulo/trainer.py
def train(config, dataset_path, progress_callback):
    """
    Entrena un modelo con la configuración dada.

    Args:
        config (dict): Configuración desde PWA
        dataset_path (str): Ruta al dataset
        progress_callback (fn): Callback(progress, epoch, message)
    """

    # Tu lógica de entrenamiento aquí
    for epoch in range(config['epochs']):
        # ... entrenar ...

        progress_callback(
            progress=(epoch / config['epochs']) * 100,
            epoch=epoch,
            message=f"Training epoch {epoch}"
        )
```

### Registro en Manifest

```json
// modules/manifest.json
{
  "modules": [
    {
      "id": "mi_modulo",
      "name": "Mi Módulo Custom",
      "version": "1.0.0",
      "download_url": "mi_modulo.zip"
    }
  ]
}
```

---

## 🎓 Roadmap

- [x] Arquitectura modular con descarga bajo demanda
- [x] Módulo Ultralytics YOLO completo
- [ ] Auto-instalación de dependencias con pip
- [ ] Panel web de monitoreo en tiempo real
- [ ] Soporte para multi-GPU
- [ ] Módulo PyTorch Custom
- [ ] Módulo TensorFlow U-Net
- [ ] Verificación de checksums SHA256
- [ ] Actualizaciones automáticas OTA

---

## 📄 Licencia

MIT License - TecMedHub, Universidad Austral de Chile

---

## 👥 Créditos

**Desarrollado por:** TecMedHub - FabLab
**Universidad:** Universidad Austral de Chile - Sede Puerto Montt
**Contacto:** tecmedhub@uach.cl
**GitHub:** https://github.com/debaq/Annotix

---

**¿Preguntas?** Abre un issue en GitHub o contacta al equipo de TecMedHub.
