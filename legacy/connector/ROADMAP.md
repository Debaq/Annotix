# Annotix Connector - Roadmap de Funcionalidades

**Desarrollado por:** TecMedHub - Universidad Austral de Chile
**Última actualización:** 2025-11-30

---

## Arquitectura Actual

El Connector es un servidor Flask local que actúa como **puente entre el navegador y el sistema operativo**, superando las limitaciones de seguridad del navegador web.

**Stack tecnológico:**
- Python + Flask (servidor HTTP)
- Flask-CORS (comunicación cross-origin)
- Arquitectura modular extensible
- Threading para operaciones en background

**Capacidades actuales:**
1. ✅ Entrenamiento local con GPU (módulos descargables)
2. ✅ Selección de carpetas del sistema (tkinter)
3. ✅ Sistema de módulos auto-descargables
4. ✅ Monitoreo de progreso de entrenamiento
5. ✅ Health check y status monitoring

---

## 🎯 Funcionalidades Propuestas

### 🔄 **1. Sistema de Backups Automáticos**

**Problema que resuelve:**
Los datos en IndexedDB pueden perderse por limpieza de caché, límites de almacenamiento o errores del navegador.

**Implementación:**

#### Endpoint: `/backup/auto-config`
```python
POST /backup/auto-config
{
  "enabled": true,
  "interval_minutes": 15,
  "max_backups": 10,
  "backup_path": "/path/to/backups"
}
```

#### Endpoint: `/backup/create`
```python
POST /backup/create
{
  "project_id": 123,
  "project_name": "Mi Proyecto",
  "include_images": true
}

Response:
{
  "backup_file": "/backups/proyecto_2025-11-30_15-30-00.tix",
  "size_mb": 45.2,
  "timestamp": "2025-11-30T15:30:00Z"
}
```

#### Endpoint: `/backup/list`
```python
GET /backup/list?project_name=Mi%20Proyecto

Response:
{
  "backups": [
    {
      "file": "proyecto_2025-11-30_15-30-00.tix",
      "size_mb": 45.2,
      "timestamp": "2025-11-30T15:30:00Z",
      "annotations_count": 350
    }
  ]
}
```

#### Endpoint: `/backup/restore`
```python
POST /backup/restore
{
  "backup_file": "/backups/proyecto_2025-11-30_15-30-00.tix"
}
```

**Features:**
- Versionado automático con timestamps
- Rotación de backups (mantener N últimos)
- Backup incremental (solo cambios desde último backup)
- Compresión ZIP para ahorrar espacio
- Integración Git opcional (commits automáticos)

---

### 📁 **2. Trabajo Directo con Archivos del PC**

**Problema que resuelve:**
IndexedDB tiene límites de ~1GB. Datasets grandes (miles de imágenes) no caben en el navegador.

#### Endpoint: `/files/watch-folder`
```python
POST /files/watch-folder
{
  "folder_path": "/datasets/mi_dataset",
  "auto_import": true,
  "filter_extensions": [".jpg", ".png"]
}

Response:
{
  "watching": true,
  "images_found": 1250,
  "folder": "/datasets/mi_dataset"
}
```

Cuando se detecta una imagen nueva → Webhook al navegador para importarla.

#### Endpoint: `/files/import-batch`
```python
POST /files/import-batch
{
  "folder_path": "/datasets/imagenes",
  "recursive": true,
  "max_images": 1000
}

Response (streaming):
{
  "progress": 45,
  "current_file": "img_0045.jpg",
  "total": 1000,
  "imported": 45
}
```

#### Endpoint: `/files/export-direct`
```python
POST /files/export-direct
{
  "project_data": {...},
  "output_path": "/datasets/export",
  "format": "yolo"
}
```

**Features:**
- Modo "Virtual Dataset" (no cargar todo en IndexedDB, solo metadatos)
- Watch folder con auto-import
- Importación masiva sin límites
- Exportación directa sin crear ZIP en memoria

---

### ⚡ **3. Procesamiento Pesado**

#### Endpoint: `/processing/augment`
```python
POST /processing/augment
{
  "images": ["img1.jpg", "img2.jpg"],
  "operations": {
    "rotation": [-15, 15],
    "flip_horizontal": true,
    "brightness": [0.8, 1.2],
    "noise": 0.1
  },
  "multiplier": 5  // Generar 5 variaciones por imagen
}
```

#### Endpoint: `/processing/validate-dataset`
```python
POST /processing/validate-dataset
{
  "dataset_path": "/datasets/mi_dataset"
}

Response:
{
  "valid": true,
  "issues": [
    {
      "type": "duplicate_image",
      "files": ["img001.jpg", "img045.jpg"],
      "similarity": 0.98
    },
    {
      "type": "missing_label",
      "file": "img023.jpg"
    },
    {
      "type": "empty_annotation",
      "file": "img067.jpg"
    }
  ],
  "statistics": {
    "total_images": 500,
    "total_annotations": 2340,
    "avg_annotations_per_image": 4.68,
    "class_distribution": {
      "person": 1200,
      "car": 800,
      "dog": 340
    }
  }
}
```

#### Endpoint: `/processing/find-duplicates`
```python
POST /processing/find-duplicates
{
  "dataset_path": "/datasets/mi_dataset",
  "threshold": 0.95  // Similitud mínima
}

Response:
{
  "duplicates": [
    {
      "group": ["img001.jpg", "img045.jpg", "img089.jpg"],
      "similarity": 0.98
    }
  ]
}
```

**Features:**
- Data augmentation con PIL/OpenCV
- Detección de duplicados con perceptual hashing
- Validación de formato YOLO/COCO
- Estadísticas y reportes del dataset
- Auto-balance de clases

---

### ☁️ **4. Integración Cloud**

#### Endpoint: `/cloud/sync-gdrive`
```python
POST /cloud/sync-gdrive
{
  "project_id": 123,
  "gdrive_folder_id": "1aB2cD3eF4gH",
  "sync_mode": "backup"  // backup, bidirectional, download
}
```

#### Endpoint: `/cloud/upload-model`
```python
POST /cloud/upload-model
{
  "model_path": "/runs/train/weights/best.pt",
  "destination": "s3",  // s3, gdrive, dropbox
  "bucket": "annotix-models",
  "metadata": {
    "project": "detection_v1",
    "epochs": 100,
    "map50": 0.89
  }
}
```

**Features:**
- Google Drive sync
- AWS S3 upload de modelos entrenados
- Dropbox integration
- Webhook para colaboración en equipo

---

### 🤖 **5. Auto-Anotación Inteligente**

**Problema que resuelve:**
Anotar miles de imágenes manualmente es tedioso. Usar un modelo entrenado para pre-anotar acelera el trabajo.

#### Endpoint: `/inference/auto-annotate`
```python
POST /inference/auto-annotate
{
  "model_path": "/runs/train/weights/best.pt",
  "images": ["/new_images/img001.jpg", "..."],
  "confidence_threshold": 0.5,
  "iou_threshold": 0.4
}

Response (streaming):
{
  "progress": 45,
  "current_image": "img_0045.jpg",
  "annotations": [
    {
      "class": 0,
      "confidence": 0.89,
      "bbox": [0.3, 0.4, 0.2, 0.15]
    }
  ]
}
```

#### Endpoint: `/inference/suggest-corrections`
```python
POST /inference/suggest-corrections
{
  "model_path": "/runs/train/weights/best.pt",
  "annotated_image": {
    "image": "img001.jpg",
    "current_annotations": [...]
  }
}

Response:
{
  "suggestions": [
    {
      "type": "missing_object",
      "bbox": [0.6, 0.3, 0.1, 0.2],
      "class": 0,
      "confidence": 0.78
    },
    {
      "type": "wrong_class",
      "annotation_id": 5,
      "current_class": 0,
      "suggested_class": 2,
      "confidence": 0.92
    }
  ]
}
```

**Features:**
- Auto-anotación batch con modelo entrenado
- Sugerencias de correcciones (detecciones faltantes)
- Validación de anotaciones existentes
- Active Learning (sugerir qué imágenes anotar primero)

---

### 🔌 **6. Integraciones Avanzadas**

#### Git Integration
```python
POST /git/init
{
  "project_path": "/datasets/proyecto_1",
  "remote_url": "https://github.com/user/dataset.git"
}

POST /git/commit
{
  "message": "Agregadas 50 nuevas anotaciones",
  "auto_push": true
}

GET /git/history
Response: Lista de commits con diffs de anotaciones
```

#### Database Integration
```python
POST /db/export-postgresql
{
  "connection_string": "postgresql://localhost/annotix",
  "project_id": 123
}
```

Útil para datasets con millones de anotaciones que no caben en IndexedDB.

#### Roboflow Integration
```python
POST /integrations/roboflow/upload
{
  "api_key": "...",
  "workspace": "my-workspace",
  "project": "my-project",
  "dataset_path": "/exports/dataset.zip"
}
```

---

## 🛠️ Implementación Técnica

### Arquitectura Propuesta

```
connector/
├── motor_server.py          # Servidor principal
├── modules/                 # Módulos de entrenamiento
│   └── ultralytics_yolo/
├── plugins/                 # NUEVO: Sistema de plugins
│   ├── backup/
│   │   ├── __init__.py
│   │   ├── auto_backup.py
│   │   └── backup_manager.py
│   ├── files/
│   │   ├── watch_folder.py
│   │   └── batch_import.py
│   ├── processing/
│   │   ├── augmentation.py
│   │   ├── validator.py
│   │   └── duplicates.py
│   ├── cloud/
│   │   ├── gdrive.py
│   │   ├── s3.py
│   │   └── dropbox.py
│   └── inference/
│       ├── auto_annotate.py
│       └── suggestions.py
├── config.json              # Configuración de plugins
└── ROADMAP.md              # Este archivo
```

### Sistema de Plugins

Cada funcionalidad como plugin independiente:

```python
# connector/plugins/backup/auto_backup.py
class BackupPlugin:
    def __init__(self, config):
        self.enabled = config.get('enabled', False)
        self.interval = config.get('interval_minutes', 15)

    def register_routes(self, app):
        @app.route('/backup/create', methods=['POST'])
        def create_backup():
            # Implementación
            pass

    def start_background_tasks(self):
        # Auto-backup periódico
        pass
```

Carga dinámica en `motor_server.py`:

```python
from plugins import load_plugins

plugins = load_plugins()
for plugin in plugins:
    plugin.register_routes(app)
    plugin.start_background_tasks()
```

---

## 📊 Priorización de Implementación

### **Fase 1: Fundamentos (Inmediato)**
1. ✅ Sistema de módulos (COMPLETADO)
2. ⏳ Backup automático
3. ⏳ Importación batch de carpetas

### **Fase 2: Procesamiento (Corto Plazo)**
4. ⏳ Watch folder
5. ⏳ Validador de datasets
6. ⏳ Detección de duplicados

### **Fase 3: Inteligencia (Mediano Plazo)**
7. ⏳ Auto-anotación con modelos entrenados
8. ⏳ Sugerencias de correcciones
9. ⏳ Data augmentation

### **Fase 4: Cloud & Colaboración (Largo Plazo)**
10. ⏳ Integración Git
11. ⏳ Google Drive sync
12. ⏳ Roboflow/CVAT integration

---

## 🚀 Casos de Uso

### **Caso 1: Investigador con Dataset Grande**
Problema: 10,000 imágenes médicas no caben en IndexedDB.

Solución:
1. Watch folder apuntando a carpeta de imágenes
2. Modo "Virtual Dataset" (solo metadatos en navegador)
3. Backup automático cada hora
4. Exportación directa a PostgreSQL

### **Caso 2: Equipo Distribuido**
Problema: 3 anotadores trabajando en el mismo proyecto.

Solución:
1. Git integration para versionado
2. Sync con Google Drive compartido
3. Webhook de cambios en tiempo real
4. Merge automático de anotaciones

### **Caso 3: Startup con Poco Presupuesto**
Problema: No pueden pagar servicios cloud de anotación ($$$).

Solución:
1. Auto-anotación con modelo propio
2. Validador para detectar errores
3. Active learning para optimizar anotación manual
4. Exportación directa a formato Roboflow

---

## 📝 Notas de Desarrollo

### Compatibilidad
- Python 3.8+
- Flask 2.0+
- Dependencias opcionales por plugin (no forzar instalación global)

### Seguridad
- Validar todos los paths de archivos (evitar path traversal)
- Limitar tamaño de uploads
- Rate limiting en endpoints de procesamiento pesado
- Opcional: Autenticación token-based

### Performance
- Threading para operaciones largas
- Progress streaming con Server-Sent Events (SSE)
- Caché de resultados de procesamiento
- Queue system para tareas batch

### Testing
- Unit tests por plugin
- Integration tests con proyectos de prueba
- Performance benchmarks

---

## 🤝 Contribuciones

Este roadmap es un documento vivo. Ideas adicionales:

- [ ] Integración con LabelImg/CVAT
- [ ] Soporte para video (frame extraction)
- [ ] OCR para texto en imágenes
- [ ] Metrics dashboard (Grafana/Prometheus)
- [ ] REST API completa (OpenAPI/Swagger)
- [ ] WebSocket para comunicación bidireccional
- [ ] Docker container para distribución fácil

---

**Contacto:**
TecMedHub - Universidad Austral de Chile - Sede Puerto Montt
https://github.com/TecMedHub/Annotix
