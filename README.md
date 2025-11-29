# 🏷️ Annotix - Sistema Profesional de Anotación Multimodal

**Plataforma de anotación de datos para Machine Learning con soporte multi-modalidad y multi-formato**

## 📊 Estado de Implementación

**18/62 sistemas implementados** (29%)

### ✅ **Implementados y Funcionales:**

**Imágenes (9/13):**
- Classification, Multi-Label, Detection, Segmentation, Instance Seg
- Keypoints/Pose, Polygon, Landmarks, OBB (Oriented Bounding Boxes)

**Series Temporales (9/9):** ✓ Todos implementados
- Classification, Forecasting, Anomaly Detection, Segmentation, Pattern Recognition, Event Detection, Regression, Clustering, Imputation

### 🚧 **En Desarrollo:**
- Semantic Segmentation, Panoptic Segmentation, OCR, Depth Estimation (Imágenes)

### 📋 **Roadmap (44 sistemas pendientes):**
- **Audio (0/10):** Classification, Speech Recognition, Sound Event Detection, etc.
- **Video (0/9):** Action Recognition, Object Tracking, Activity Detection, etc.
- **3D (0/9):** Object Detection, Point Cloud, Mesh Segmentation, SLAM, etc.
- **Texto/NLP (0/12):** NER, Sentiment Analysis, Intent Classification, etc.

## 📦 Archivos del Sistema

```
annotix/
├── index.html               # Interfaz principal
├── css/                     # Estilos modulares
├── js/                      # Lógica de la aplicación
├── i18n.js                  # Sistema de internacionalización
├── locales/                 # Carpeta de traducciones
│   ├── en.json             # Inglés
│   ├── es.json             # Español (predeterminado)
│   ├── fr.json             # Francés
│   ├── zh.json             # Chino
│   ├── ja.json             # Japonés
│   ├── de.json             # Alemán
│   ├── pt.json             # Portugués
│   ├── it.json             # Italiano
│   ├── ru.json             # Ruso
│   └── ko.json             # Coreano
└── README.md               # Este archivo
```

## 🚀 Instalación

1. **Descargar todos los archivos** y mantenerlos en la misma carpeta.
2. **Abrir `index.html`** en un navegador moderno (Chrome, Edge, Firefox, Safari).
3. ¡Listo! No requiere instalación ni servidor backend.

## 🌍 Sistema de Idiomas

### Idiomas Disponibles

- 🇬🇧 **Inglés** (English)
- 🇪🇸 **Español** (Spanish) - Predeterminado
- 🇫🇷 **Francés** (Français)
- 🇨🇳 **Chino** (中文)
- 🇯🇵 **Japonés** (日本語)
- 🇩🇪 **Alemán** (Deutsch)
- 🇵🇹 **Portugués** (Português)
- 🇮🇹 **Italiano** (Italiano)
- 🇷🇺 **Ruso** (Русский)
- 🇰🇷 **Coreano** (한국어)

### Cambiar Idioma

1. Clic en el selector de idioma en el header (esquina superior derecha).
2. Seleccionar el idioma deseado.
3. La interfaz se actualizará automáticamente.
4. **La preferencia se guarda** en localStorage (`annotix_language`).

## ✨ Características Principales

### 1. **Sistema de Proyectos Multi-Modalidad**
- Múltiples proyectos en IndexedDB
- **6 modalidades:** Imágenes, Audio, Video, Series Temporales, 3D, Texto/NLP
- **62 tipos de proyectos** definidos (18 implementados)
- Import/Export de proyectos completos (`.tix`)
- Import/Export configuración (`.tixconfig`) para trabajo en equipo

### 2. **Herramientas de Anotación (Imágenes)**
- **Bbox**: Bounding boxes rectangulares
- **OBB**: Oriented bounding boxes (rotados)
- **Mask**: Máscaras pixel-perfect para segmentación
- **Polygon**: Segmentación punto-a-punto
- **Keypoints**: Esqueletos y pose estimation
- **Landmarks**: Puntos independientes
- **Classification**: Etiquetas globales (single/multi-label)
- **Select/Pan**: Edición y navegación

### 3. **Edición Avanzada**
- Redimensionar boxes arrastrando esquinas.
- Mover boxes completos.
- Eliminar anotaciones individuales.
- Deshacer última anotación.

### 4. **Navegación**
- Flechas ← → para cambiar entre imágenes.
- Galería con vista previa.
- Filtros: Todas / Anotadas / Sin anotar.

### 5. **Gestión de Clases**
- Crear clases ilimitadas.
- Cada clase con nombre y color personalizado.
- Editar y eliminar clases.
- Selección rápida con teclas 1-9.

### 6. **Zoom y Visualización**
- Zoom con rueda del mouse.
- Pan arrastrando (tecla H o middle-click).
- Controles de zoom (+, -, reset).
- Mostrar/ocultar etiquetas.

### 7. **Exportación Multi-Formato**
- **YOLO:** Detection, Segmentation, Pose (estructura estándar)
- **COCO JSON:** Detection, Segmentation, Polygon, Keypoints
- **Pascal VOC XML:** Object detection
- **PNG Masks:** Segmentación semántica (U-Net compatible)
- **CSV:** Classification, Landmarks, genérico
- **Proyecto completo** (`.tix`) - Portabilidad total
- **Configuración** (`.tixconfig`) - Para compartir clases

### 8. **Generación de Código de Entrenamiento**
- Código Python completo para entrenar modelos
- Soporte frameworks: YOLOv8/v11, Detectron2, TensorFlow, PyTorch, SMP
- Configuración automática según tipo de proyecto
- Exportación de modelos: ONNX, TorchScript, TFLite, OpenVINO, CoreML, TensorRT

## ⌨️ Atajos de Teclado

| Tecla | Acción | Contexto |
|-------|--------|----------|
| **1-9** | Seleccionar clase 1-9 | General |
| **B** | Herramienta Bbox | Detection |
| **O** | Herramienta OBB | OBB projects |
| **M** | Herramienta Mask | Segmentation |
| **P** | Herramienta Polygon | Polygon |
| **K** | Herramienta Keypoint | Pose |
| **L** | Herramienta Landmark | Landmarks |
| **V** | Herramienta Select | General |
| **H** | Herramienta Pan | General |
| **Ctrl+S** | Guardar imagen actual | General |
| **Ctrl+Z** | Deshacer última anotación | General |
| **Delete** | Eliminar seleccionada | General |
| **Esc** | Deseleccionar | General |
| **←/→** | Navegar imágenes | General |
| **R/Shift+R** | Rotar ±15° | OBB |

## 📊 Flujo de Trabajo Recomendado

### Para un solo usuario:

1. **Crear proyecto** → Definir nombre, tipo (bbox/mask), clases iniciales.
2. **Cargar imágenes** → Subir una o múltiples imágenes.
3. **Anotar** → Usar herramientas para marcar objetos.
4. **Guardar** → Ctrl+S después de cada imagen.
5. **Repetir** → Navegar con flechas ← →.
6. **Exportar** → Descargar dataset ZIP cuando termines.

### Para trabajo en equipo:

#### Líder del equipo:
1. Crear proyecto con todas las clases definidas.
2. Exportar configuración (`.tixconfig`).
3. Compartir archivo con el equipo.

#### Miembros del equipo:
1. Importar configuración recibida.
2. Anotar sus imágenes asignadas.
3. Exportar su dataset ZIP individual.
4. Enviar al líder.

#### Líder (combinar):
1. Juntar todos los ZIP.
2. Combinar carpetas images/ y labels/.
3. Usar el dataset completo para entrenar.

## 🎯 Formatos de Exportación

### YOLO Detection:
```
<class_id> <x_center> <y_center> <width> <height>
```
Coordenadas normalizadas 0-1

### YOLO Segmentation:
```
<class_id> <x1> <y1> <x2> <y2> ... <xn> <yn>
```
Puntos del polígono normalizados

### YOLO Pose:
```
<class_id> <bbox> <x1> <y1> <v1> <x2> <y2> <v2> ...
```
Bbox + keypoints con visibilidad

### COCO JSON:
Formato completo con imágenes, anotaciones, categorías y metadata

### Pascal VOC XML:
Archivos XML individuales por imagen con bboxes

### PNG Masks:
Máscaras de segmentación como imágenes PNG

## 💾 Almacenamiento

- **IndexedDB**: Todos los proyectos e imágenes anotadas.
- **LocalStorage**: Preferencia de idioma (`annotix_language`).
- **Sin servidor**: Todo funciona 100% en el cliente.

## 🐛 Solución de Problemas

### Las imágenes no cargan:
- Verificar formato soportado (JPG, PNG, WebP).
- Revisar consola del navegador (F12).

### No se guardan las anotaciones:
- Verificar que hay un proyecto seleccionado.
- Click en "Guardar" o Ctrl+S después de anotar.

### IndexedDB llena:
- Chrome/Edge: ~500MB-1GB límite.
- Firefox: Sin límite específico.
- Safari: ~1GB límite.
- Exportar y limpiar proyectos viejos si es necesario.

## 📱 Compatibilidad

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+

### Características requeridas:
- IndexedDB
- Canvas API
- Fetch API
- File API
- ES6+ JavaScript

## 🔐 Privacidad y Seguridad

- **Sin tracking**: No se envía información a servidores externos.
- **Sin cuentas**: No requiere registro ni login.
- **Datos locales**: Todo se almacena en el navegador del usuario.

## 🛣️ Hoja de Ruta de Desarrollo

### **Fase 1 - Imágenes Avanzadas** (Q2 2025)
- Semantic Segmentation completa
- Panoptic Segmentation
- OCR con bounding boxes de texto
- Depth Estimation visualization

### **Fase 2 - Audio** (Q3 2025)
- Espectrograma canvas para anotación
- Audio Classification
- Speech Recognition (transcripción + timestamps)
- Sound Event Detection

### **Fase 3 - Video** (Q4 2025)
- Timeline-based annotation
- Object Tracking multi-frame
- Action Recognition
- Video Segmentation

### **Fase 4 - 3D** (Q1 2026)
- Point Cloud viewer (Three.js)
- 3D Bounding Boxes
- Mesh Segmentation
- SLAM Annotation

### **Fase 5 - Texto/NLP** (Q2 2026)
- Named Entity Recognition (NER)
- Sentiment Analysis
- Intent Classification
- Relation Extraction

## 📄 Licencia

Desarrollado por **FabLab TecMedHub** - Universidad Austral de Chile, Sede Puerto Montt.

## 📞 Soporte

Para preguntas o problemas:
- 📧 Email: tecmedhub@uach.cl
- 🌐 Web: [FabLab TecMedHub]

---

**Desarrollado con ❤️ en Puerto Montt, Chile 🇨🇱**
