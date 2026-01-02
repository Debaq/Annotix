# Guía de Importación y Exportación de Annotix

## Tabla de Contenidos
1. [Introducción](#introducción)
2. [Estructura de Almacenamiento (IndexedDB)](#estructura-de-almacenamiento-indexeddb)
3. [Sistema de Importación](#sistema-de-importación)
4. [Formatos de Exportación](#formatos-de-exportación)
5. [Estructura de Anotaciones](#estructura-de-anotaciones)
6. [Tipos de Proyectos](#tipos-de-proyectos)
7. [Ejemplos Prácticos](#ejemplos-prácticos)

---

## Introducción

Annotix utiliza **IndexedDB** como sistema de almacenamiento local del navegador. Toda la información (proyectos, imágenes y anotaciones) se guarda en el cliente, sin necesidad de servidor backend.

**Base de datos:** `YOLOAnnotatorDB` (versión 2)

---

## Estructura de Almacenamiento (IndexedDB)

### Object Stores

La base de datos contiene 2 object stores principales:

#### 1. `projects` (Proyectos)

```javascript
{
  id: Number,                    // Auto-incremental (primary key)
  name: String,                  // Nombre del proyecto (único)
  type: String,                  // Tipo: 'bbox', 'mask', 'polygon', 'keypoints', 'landmarks', 'classification', etc.
  classes: Array,                // Array de clases [{id, name, color}, ...]
  preprocessingConfig: Object,   // Configuración de preprocesamiento
  createdAt: Number,             // Timestamp de creación
  updatedAt: Number              // Timestamp de última actualización
}
```

**Índices:**
- `name` (unique)

#### 2. `images` (Imágenes y Anotaciones)

```javascript
{
  id: Number,                    // Auto-incremental (primary key)
  projectId: Number,             // ID del proyecto al que pertenece
  name: String,                  // Nombre limpio para exportar (ej: "img_0001.jpg")
  originalFileName: String,      // Nombre original del archivo
  displayName: String,           // Nombre mostrado en UI
  mimeType: String,              // Tipo MIME (ej: "image/jpeg")
  image: Blob,                   // Blob de la imagen
  annotations: Array,            // Array de anotaciones (ver estructura abajo)
  classification: Object,        // Para proyectos de clasificación {classId: Number}
  predictions: Array,            // Predicciones de inferencia (opcional)
  inferenceMetadata: Object,     // Metadata de inferencia (opcional)
  width: Number,                 // Ancho de la imagen en píxeles
  height: Number,                // Alto de la imagen en píxeles
  timestamp: Number,             // Timestamp
  timeSeriesMetadata: Object     // Para series temporales (opcional)
}
```

**Índices:**
- `projectId` (no único)
- `name` (no único)

---

## Sistema de Importación

### 3.1. Importación de Imágenes

**Archivo:** `app.js`, función `loadImages(files)`

**Proceso:**
1. Usuario selecciona archivos desde `<input type="file" accept="image/*" multiple>`
2. Sistema verifica que haya un proyecto activo
3. Cada imagen se carga y valida
4. **Preprocesamiento (opcional):**
   - Si el proyecto tiene `preprocessingConfig.enabled = true`, se aplica automáticamente
   - Si no, se pregunta al usuario si desea preprocesar imágenes no cuadradas
   - Estrategias disponibles: `pad`, `crop`, `resize`
   - Tamaños objetivo: 224, 416, 512, 640, 1024 px
5. Se generan nombres limpios secuenciales: `img_0001.jpg`, `img_0002.png`, etc.
6. Se almacena:
   - `name`: nombre limpio (para exportación)
   - `originalFileName`: nombre original del archivo
   - `displayName`: nombre mostrado en galería
   - Blob de imagen
   - Dimensiones (width, height)
   - Array vacío de anotaciones `[]`

**Ejemplo de código:**
```javascript
const imageData = {
  projectId: 1,
  name: "img_0001.jpg",
  originalFileName: "photo_vacation_2024.jpg",
  displayName: "photo_vacation_2024.jpg",
  mimeType: "image/jpeg",
  image: Blob,
  annotations: [],
  width: 1920,
  height: 1080,
  timestamp: 1704067200000
}
```

### 3.2. Importación de Proyectos (.tix)

**Archivo:** `project-manager.js`, función `importProject(file)`

**Formato del archivo .tix:**
```json
{
  "version": "1.0",
  "project": {
    "name": "My Dataset",
    "type": "bbox",
    "classes": [
      { "id": 0, "name": "cat", "color": "#FF5733" },
      { "id": 1, "name": "dog", "color": "#33FF57" }
    ],
    "preprocessingConfig": { "enabled": false },
    "createdAt": 1704067200000,
    "updatedAt": 1704067200000
  },
  "images": [
    {
      "name": "img_0001.jpg",
      "originalFileName": "cat1.jpg",
      "displayName": "cat1.jpg",
      "mimeType": "image/jpeg",
      "annotations": [
        {
          "type": "bbox",
          "class": 0,
          "data": { "x": 100, "y": 150, "width": 200, "height": 250 }
        }
      ],
      "width": 800,
      "height": 600,
      "timestamp": 1704067200000
    }
  ]
}
```

**Proceso:**
1. Lee archivo JSON
2. Valida estructura (`project` y `images` deben existir)
3. Verifica si el nombre del proyecto ya existe
4. Si existe, agrega sufijo `(1)`, `(2)`, etc.
5. Crea el proyecto en IndexedDB
6. **IMPORTANTE:** Los archivos .tix NO incluyen los blobs de imágenes (solo metadata)
7. Las imágenes sin datos binarios se saltan con warning

**Limitación:**
> ⚠️ El formato `.tix` actual NO incluye las imágenes completas, solo las anotaciones. Es principalmente útil para transferir configuraciones de proyectos.

### 3.3. Importación de Configuraciones (.tixconfig)

**Archivo:** `project-manager.js`, función `importConfig(file)`

**Formato del archivo .tixconfig:**
```json
{
  "version": "1.0",
  "name": "Vehicle Detection",
  "type": "bbox",
  "classes": [
    { "id": 0, "name": "car", "color": "#FF0000" },
    { "id": 1, "name": "truck", "color": "#00FF00" },
    { "id": 2, "name": "bike", "color": "#0000FF" }
  ]
}
```

**Uso:** Para compartir configuración de clases entre equipos sin compartir imágenes.

### 3.4. Importación de Series Temporales (.csv)

**Archivos:** `app.js`, funciones `loadImages()` y `saveTimeSeriesData()`

**Proceso:**
1. Sistema detecta archivos `.csv`
2. Verifica que el proyecto sea de tipo time series
3. Lanza wizard para configurar:
   - Headers
   - Tipos de columnas
   - Columna temporal
   - Delimitador
4. Almacena como entrada en object store `images` con:
   - `mimeType: 'text/csv'`
   - `image`: Blob del CSV
   - `timeSeriesMetadata`: configuración del CSV

---

## Formatos de Exportación

Annotix exporta a múltiples formatos estándar de machine learning.

### 4.1. YOLO Detection Format

**Para proyectos:** `bbox`, `detection`, `landmarks`

**Estructura del ZIP:**
```
dataset_yolo_detection.zip
├── data.yaml           # Configuración YOLO
├── classes.txt         # Lista de nombres de clases
├── images/
│   ├── img_0001.jpg
│   ├── img_0002.jpg
│   └── ...
└── labels/
    ├── img_0001.txt
    ├── img_0002.txt
    └── ...
```

**Formato de labels (.txt):**
```
<class_id> <x_center> <y_center> <width> <height>
```

Todas las coordenadas están **normalizadas (0-1)** respecto a las dimensiones de la imagen.

**Ejemplo:**
```txt
0 0.500000 0.625000 0.250000 0.312500
1 0.300000 0.400000 0.150000 0.200000
```

**Conversión de coordenadas:**
```javascript
x_center = (x + width / 2) / image.width
y_center = (y + height / 2) / image.height
w = width / image.width
h = height / image.height
```

**data.yaml:**
```yaml
# YOLO detection dataset configuration
# Generated by Annotix

path: .
train: images
val: images

# Classes
nc: 3
names: ['cat', 'dog', 'bird']
```

### 4.2. YOLO Segmentation Format

**Para proyectos:** `mask`, `segmentation`, `polygon`

**Estructura similar a YOLO Detection**, pero los labels contienen polígonos:

**Formato de labels (.txt):**
```
<class_id> <x1> <y1> <x2> <y2> <x3> <y3> ... <xn> <yn>
```

Coordenadas normalizadas (0-1) de los puntos del polígono.

**Proceso de conversión de máscaras:**
1. Máscara almacenada como Base64 PNG
2. Carga de imagen desde Base64
3. **Moore-Neighbor Tracing** para extraer contorno
4. **Douglas-Peucker** para simplificar polígono (tolerancia: 2.0px)
5. Normalización de coordenadas
6. Exportación a archivo .txt

### 4.3. YOLO Pose Format

**Para proyectos:** `keypoints`

**Formato de labels (.txt):**
```
<class_id> <bbox_x_center> <bbox_y_center> <bbox_width> <bbox_height> <x1> <y1> <v1> <x2> <y2> <v2> ... <xn> <yn> <vn>
```

Donde:
- Bbox: calculado desde keypoints visibles
- `xi, yi`: coordenadas normalizadas del keypoint i
- `vi`: visibilidad (0=no labeled, 1=labeled but not visible, 2=labeled and visible)

**data.yaml incluye:**
```yaml
kpt_shape: [17, 3]  # [num_keypoints, dimensions]

keypoint_names:
  0: nose
  1: left_eye
  ...

skeleton:  # Conexiones entre keypoints
  - [0, 1]
  - [0, 2]
  ...
```

### 4.4. COCO JSON Format

**Para proyectos:** `bbox`, `mask`, `polygon`, `keypoints`

**Estructura del ZIP:**
```
dataset_coco.zip
├── annotations.json
└── images/
    ├── img_0001.jpg
    ├── img_0002.jpg
    └── ...
```

**annotations.json (detección):**
```json
{
  "info": {
    "description": "My Dataset - COCO Detection Dataset",
    "version": "1.0",
    "year": 2024,
    "contributor": "Annotix",
    "date_created": "2024-01-01T00:00:00.000Z"
  },
  "licenses": [],
  "images": [
    {
      "id": 1,
      "file_name": "img_0001.jpg",
      "width": 800,
      "height": 600,
      "date_captured": "2024-01-01T12:30:00.000Z"
    }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 0,
      "bbox": [100, 150, 200, 250],  // [x, y, width, height] píxeles absolutos
      "area": 50000,
      "iscrowd": 0
    }
  ],
  "categories": [
    {
      "id": 0,
      "name": "cat",
      "supercategory": "object"
    }
  ]
}
```

**annotations.json (segmentación):**
```json
{
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 0,
      "segmentation": [[x1, y1, x2, y2, ..., xn, yn]],  // Array de polígonos
      "area": 50000,
      "bbox": [x, y, width, height],
      "iscrowd": 0
    }
  ]
}
```

**annotations.json (keypoints):**
```json
{
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 0,
      "keypoints": [x1, y1, v1, x2, y2, v2, ...],  // Píxeles absolutos
      "num_keypoints": 5,
      "bbox": [x, y, width, height],
      "area": 10000,
      "iscrowd": 0
    }
  ],
  "categories": [
    {
      "id": 0,
      "name": "person",
      "supercategory": "object",
      "keypoints": ["nose", "left_eye", "right_eye", ...],
      "skeleton": [[0, 1], [0, 2], ...]
    }
  ]
}
```

### 4.5. Pascal VOC XML Format

**Para proyectos:** `bbox`, `detection`

**Estructura del ZIP:**
```
dataset_pascal_voc.zip
├── JPEGImages/
│   ├── img_0001.jpg
│   └── img_0002.jpg
└── Annotations/
    ├── img_0001.xml
    └── img_0002.xml
```

**Formato XML:**
```xml
<annotation>
    <folder>VOC</folder>
    <filename>img_0001.jpg</filename>
    <path>img_0001.jpg</path>
    <source>
        <database>Annotix</database>
    </source>
    <size>
        <width>800</width>
        <height>600</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>
    <object>
        <name>cat</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>100</xmin>
            <ymin>150</ymin>
            <xmax>300</xmax>
            <ymax>400</ymax>
        </bndbox>
    </object>
</annotation>
```

### 4.6. U-Net Masks PNG Format

**Para proyectos:** `mask`, `segmentation`

**Estructura del ZIP:**
```
dataset_masks_png.zip
├── images/
│   ├── img_0001.jpg
│   └── img_0002.jpg
├── masks/
│   ├── img_0001.png
│   └── img_0002.png
└── classes.txt
```

**Máscaras PNG:**
- Imagen en escala de grises
- Fondo (sin anotación): valor 0 (negro)
- Clase N: valor = `N * 10` (para visibilidad)
- Cada píxel representa la clase a la que pertenece

**classes.txt:**
```txt
0: cat (color: #FF5733)
1: dog (color: #33FF57)
2: bird (color: #3357FF)
```

### 4.7. CSV Format

**Para proyectos:** `classification`, `landmarks`, o genérico

**Clasificación CSV:**
```csv
filename,class_id,class_name
img_0001.jpg,0,cat
img_0002.jpg,1,dog
```

**Landmarks CSV:**
```csv
image,landmark_id,class_id,class_name,x,y,name
img_0001.jpg,1,0,face,234.5,156.2,"center"
img_0001.jpg,2,0,face,300.1,145.8,"right_eye"
```

**Generic CSV:**
```csv
filename,annotation_type,class_id,class_name,data
img_0001.jpg,bbox,0,cat,"x:100,y:150,w:200,h:250"
img_0002.jpg,mask,1,dog,"[mask_data]"
```

### 4.8. Folders by Class Format

**Para proyectos:** `classification`

**Estructura del ZIP:**
```
dataset_folders.zip
├── cat/
│   ├── img_0001.jpg
│   ├── img_0005.jpg
│   └── ...
├── dog/
│   ├── img_0002.jpg
│   └── ...
└── bird/
    └── img_0003.jpg
```

Cada carpeta corresponde a una clase y contiene las imágenes clasificadas.

### 4.9. JSON Annotations Format

**Para todos los proyectos**

Exporta un JSON con toda la información de anotaciones sin las imágenes:

```json
{
  "project": {
    "name": "My Dataset",
    "type": "bbox",
    "classes": [
      { "id": 0, "name": "cat", "color": "#FF5733" }
    ]
  },
  "images": [
    {
      "filename": "img_0001.jpg",
      "width": 800,
      "height": 600,
      "annotations": [
        {
          "type": "bbox",
          "class": 0,
          "data": { "x": 100, "y": 150, "width": 200, "height": 250 }
        }
      ],
      "classification": null
    }
  ]
}
```

---

## Estructura de Anotaciones

Las anotaciones se almacenan en el array `annotations` de cada imagen.

### 5.1. Bounding Box (bbox)

```javascript
{
  type: 'bbox',
  class: 0,  // ID de clase
  data: {
    x: 100,       // Píxeles desde la esquina superior izquierda
    y: 150,
    width: 200,   // Ancho en píxeles
    height: 250   // Alto en píxeles
  },
  timestamp: 1704067200000  // Opcional
}
```

### 5.2. Mask (segmentación con pincel)

```javascript
{
  type: 'mask',
  class: 0,
  data: 'data:image/png;base64,iVBORw0KGgoAAAANS...'  // Base64 PNG
}
```

La máscara es un canvas temporal convertido a PNG en Base64.

### 5.3. Polygon (segmentación vectorial)

```javascript
{
  type: 'polygon',
  class: 0,
  data: {
    points: [
      [x1, y1],
      [x2, y2],
      [x3, y3],
      // ...
      [xn, yn]
    ],
    closed: true  // Polígono cerrado
  }
}
```

### 5.4. Keypoints (pose estimation)

```javascript
{
  type: 'keypoints',
  class: 0,
  data: {
    keypoints: [
      { x: 245.5, y: 120.3, visibility: 2, name: 'nose' },
      { x: 230.1, y: 110.5, visibility: 2, name: 'left_eye' },
      { x: null, y: null, visibility: 0, name: 'right_eye' },  // No marcado
      // ...
    ],
    skeleton: {
      keypoints: ['nose', 'left_eye', 'right_eye', ...],
      connections: [[0, 1], [0, 2], ...]  // Pares de índices
    }
  }
}
```

**Visibilidad:**
- `0`: No marcado
- `1`: Marcado pero no visible (ocluido)
- `2`: Marcado y visible

### 5.5. Landmark (puntos de referencia)

```javascript
{
  type: 'landmark',
  class: 0,
  data: {
    id: 1,
    x: 234.5,
    y: 156.2,
    name: 'center'  // Opcional
  }
}
```

### 5.6. Classification

No usa el array `annotations`, sino el campo especial `classification`:

```javascript
// En el objeto imagen:
{
  // ... otros campos
  classification: {
    classId: 0  // ID de la clase asignada
  }
}
```

---

## Tipos de Proyectos

| Tipo | Descripción | Herramienta | Exportación Soportada |
|------|-------------|-------------|----------------------|
| `bbox` / `detection` | Detección de objetos con cajas delimitadoras | Bbox tool | YOLO Detection, COCO Detection, Pascal VOC, CSV |
| `mask` / `segmentation` | Segmentación con pincel (máscaras bitmap) | Mask tool | YOLO Segmentation, COCO Segmentation, Masks PNG, CSV |
| `polygon` | Segmentación vectorial con polígonos | Polygon tool | YOLO Segmentation, COCO Polygon |
| `keypoints` | Pose estimation / esqueletos articulados | Keypoints tool | YOLO Pose, COCO Keypoints |
| `landmarks` | Puntos de referencia individuales | Landmark tool | YOLO Detection (tiny bboxes), CSV |
| `classification` | Clasificación de imágenes completas | Classification panel | CSV, Folders by Class |
| Time Series | Series temporales (CSV) | Wizard | CSV |

**Mutua exclusividad:** Cada proyecto solo puede usar las herramientas correspondientes a su tipo.

---

## Ejemplos Prácticos

### 7.1. Crear un dataset YOLO desde cero

1. **Crear proyecto:**
   - Tipo: `bbox` (detección)
   - Clases: `["person", "car", "bike"]`

2. **Cargar imágenes:**
   - Arrastrar/seleccionar archivos JPG/PNG
   - Annotix genera nombres: `img_0001.jpg`, `img_0002.jpg`, etc.

3. **Anotar:**
   - Seleccionar herramienta Bbox
   - Dibujar cajas alrededor de objetos
   - Asignar clase con teclas 1-3
   - **Guardar con Ctrl+S** (crítico)

4. **Exportar:**
   - Botón "Exportar Dataset"
   - Seleccionar "YOLO Detection"
   - Descargar `dataset_yolo_detection.zip`

### 7.2. Importar configuración de equipo

**Miembro A crea `.tixconfig`:**
```javascript
// En Annotix: Exportar → Configuración (.tixconfig)
```

**Miembro B importa:**
```javascript
// Nuevo Proyecto → Importar configuración → Seleccionar .tixconfig
```

Ambos ahora tienen las mismas clases y colores.

### 7.3. Backup completo de proyecto

```javascript
// Exportar → Proyecto completo (.tix)
```

**Limitación:** Solo guarda metadata, **NO las imágenes**.

Para backup completo:
1. Exportar configuración (`.tixconfig`)
2. Exportar dataset (YOLO/COCO con imágenes)

### 7.4. Conversión de máscaras a YOLO Segmentation

```javascript
// 1. Proyecto tipo 'mask'
// 2. Anotar con herramienta Mask (pincel)
// 3. Guardar (Ctrl+S)
// 4. Exportar → YOLO Segmentation
```

**Proceso interno:**
- Base64 PNG → Canvas
- Moore-Neighbor Tracing → Contorno
- Douglas-Peucker → Simplificación
- Normalización → Coordenadas 0-1
- Exportación → `.txt` con polígonos

---

## Notas Importantes

### ⚠️ Guardado Manual Obligatorio

**Las anotaciones NO se guardan automáticamente**. Debes presionar:
- `Ctrl+S` o
- Botón "Guardar Imagen"

Si no guardas, las anotaciones se pierden al cambiar de imagen.

### 📦 Limitaciones de Almacenamiento

IndexedDB tiene límites por navegador:
- Chrome/Edge: ~500MB-1GB
- Safari: ~1GB
- Firefox: Depende del espacio disponible

Para proyectos grandes:
- Exporta periódicamente
- Limpia proyectos antiguos
- Usa imágenes de resolución moderada

### 🔄 Nomenclatura de Archivos

Annotix genera nombres limpios para exportación:
```
img_0001.jpg  ← nombre limpio (exportación)
img_0002.png
```

Pero mantiene nombres originales para UI:
```
photo_vacation_beach.jpg  ← nombre original (galería)
```

### 🎨 Formato de Colores en Clases

Colores en formato hexadecimal: `#RRGGBB`

Ejemplo:
```javascript
{ id: 0, name: "cat", color: "#FF5733" }
```

---

## Diagramas de Flujo

### Flujo de Importación de Imágenes

```
Usuario selecciona archivos
         ↓
¿Proyecto activo? → NO → Error
         ↓ SÍ
Carga y validación
         ↓
¿Preprocesamiento? → SÍ → Redimensionar/Pad/Crop
         ↓ NO
Generar nombres limpios (img_000X.ext)
         ↓
Crear entrada en IndexedDB
         ↓
Actualizar galería
```

### Flujo de Exportación YOLO

```
Obtener proyecto + imágenes
         ↓
Crear ZIP
         ↓
Generar data.yaml y classes.txt
         ↓
Para cada imagen:
  - Copiar imagen a /images
  - Generar labels (.txt)
    ├─ Bbox → Convertir a formato YOLO normalizado
    ├─ Mask → Extraer contorno + simplificar
    └─ Keypoints → Bbox + coordenadas keypoints
  - Guardar en /labels
         ↓
Descargar ZIP
```

---

## Conclusión

Annotix ofrece un sistema completo de importación/exportación que soporta:
- **Múltiples tipos de anotaciones:** bbox, mask, polygon, keypoints, landmarks, classification
- **Formatos estándar:** YOLO, COCO, Pascal VOC, U-Net, CSV
- **Almacenamiento local:** 100% cliente usando IndexedDB
- **Nomenclatura limpia:** Exportaciones compatibles con frameworks ML

Para replicar o integrar con otros sistemas, los puntos clave son:
1. Estructura de IndexedDB (2 object stores)
2. Formato de anotaciones (JSON en array)
3. Conversión de coordenadas (píxeles absolutos ↔ normalizadas)
4. Algoritmos de extracción de contornos (máscaras → polígonos)
