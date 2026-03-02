<p align="center">
  <img src="public/logo.png" alt="Annotix Logo" width="120" />
</p>

<h1 align="center">Annotix</h1>

<p align="center">
  <strong>Plataforma de escritorio para anotacion de datasets de Machine Learning</strong><br/>
  Imagenes &middot; Video &middot; Series Temporales &middot; Datos Tabulares
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-2.0.0-blue" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" />
  <img alt="Tauri 2" src="https://img.shields.io/badge/tauri-2.x-orange" />
  <img alt="React 19" src="https://img.shields.io/badge/react-19-61DAFB" />
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.89+-DEA584" />
  <img alt="i18n" src="https://img.shields.io/badge/idiomas-10-purple" />
</p>

---

## Tabla de contenidos

- [Descripcion general](#descripcion-general)
- [Tipos de proyecto](#tipos-de-proyecto)
- [Herramientas de anotacion](#herramientas-de-anotacion)
- [Anotacion de video](#anotacion-de-video)
- [Series temporales](#series-temporales)
- [Datos tabulares](#datos-tabulares)
- [Entrenamiento ML integrado](#entrenamiento-ml-integrado)
- [Automatizacion de navegador](#automatizacion-de-navegador)
- [Colaboracion P2P](#colaboracion-p2p)
- [Export e import](#export-e-import)
- [Atajos de teclado](#atajos-de-teclado)
- [Idiomas](#idiomas)
- [Arquitectura](#arquitectura)
- [Stack tecnologico](#stack-tecnologico)
- [Requisitos del sistema](#requisitos-del-sistema)
- [Instalacion y desarrollo](#instalacion-y-desarrollo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Licencia](#licencia)

---

## Descripcion general

Annotix es una aplicacion de escritorio multiplataforma para crear, gestionar y exportar datasets anotados para Machine Learning. Combina un frontend React moderno con un backend Rust de alto rendimiento a traves de Tauri 2.

Disenada para investigadores, equipos de ML y laboratorios academicos, Annotix cubre el pipeline completo: desde la importacion de datos crudos, pasando por la anotacion colaborativa, hasta el entrenamiento de modelos y la exportacion en formatos estandar de la industria.

### Caracteristicas principales

- **7 herramientas de anotacion** sobre canvas 2D de alto rendimiento (Konva)
- **Anotacion de video** con tracks, keyframes e interpolacion lineal
- **Series temporales** univariadas y multivariadas con 5 tipos de anotacion
- **Datos tabulares** con editor integrado y ML clasico (scikit-learn)
- **19 backends de entrenamiento ML** incluyendo YOLO, RT-DETR, MMDetection, Detectron2, timm, SMP y mas
- **4 modos de ejecucion**: local, paquete descargable, cloud y browser automation
- **Colaboracion P2P** en tiempo real con iroh (QUIC) — sin servidor central
- **11 formatos de exportacion** y **8 de importacion** con auto-deteccion
- **76 comandos Tauri** en el backend
- **10 idiomas** con carga lazy
- **Atajos de teclado completamente personalizables**
- **Almacenamiento local** basado en JSON con cache en memoria y escritura atomica

---

## Tipos de proyecto

Annotix soporta una amplia variedad de tipos de proyecto organizados por dominio:

### Imagenes

| Tipo | Descripcion |
|------|-------------|
| `bbox` | Deteccion de objetos con bounding boxes rectangulares |
| `obb` | Deteccion con bounding boxes orientados (rotados) |
| `polygon` | Segmentacion semantica con poligonos |
| `mask` | Segmentacion semantica con mascara de pintura |
| `instance-segmentation` | Segmentacion de instancias |
| `keypoints` | Puntos clave con skeleton configurable |
| `landmarks` | Puntos de referencia nombrados |
| `classification` | Clasificacion de imagen unica |
| `multi-label-classification` | Clasificacion multilabel |

### Series temporales

| Tipo | Descripcion |
|------|-------------|
| `timeseries-classification` | Clasificacion de series |
| `timeseries-forecasting` | Prediccion de valores futuros |
| `anomaly-detection` | Deteccion de anomalias |
| `timeseries-segmentation` | Segmentacion temporal |
| `pattern-recognition` | Reconocimiento de patrones |
| `event-detection` | Deteccion de eventos |
| `timeseries-regression` | Regresion temporal |
| `clustering` | Agrupamiento de series |
| `imputation` | Imputacion de valores faltantes |

### Otros

| Tipo | Descripcion |
|------|-------------|
| `tabular` | Datos tabulares para ML clasico |

---

## Herramientas de anotacion

El canvas de anotacion esta construido sobre Konva con renderers y handlers dedicados para cada herramienta:

| Herramienta | Tecla | Descripcion |
|-------------|-------|-------------|
| **BBox** | `B` | Bounding box rectangular con drag & resize |
| **OBB** | `O` | Bounding box orientado con rotacion libre |
| **Mask** | `M` | Pintura libre con brush configurable y modo borrador |
| **Polygon** | `P` | Poligono punto a punto con cierre automatico |
| **Keypoints** | `K` | Puntos clave con presets de skeleton (COCO, cara, mano, MediaPipe) |
| **Landmarks** | `L` | Puntos de referencia nombrados con etiquetas |
| **Select** | `V` | Seleccion, movimiento y edicion de anotaciones |
| **Pan** | `H` | Navegacion por el canvas |

Funcionalidades adicionales del canvas:

- Zoom con rueda del mouse y controles flotantes
- Rotacion de imagen (`A` / `D`)
- Toggle de labels y grid
- Seleccion rapida de clase con teclas `1-0` y `Q-P` (hasta 20 clases)
- Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)

---

## Anotacion de video

Sistema completo de anotacion de video basado en frames:

- **Extraccion de frames** via FFmpeg nativo con FPS configurable
- **Reanudacion automatica** de extracciones interrumpidas al reiniciar
- **Tracks**: objetos a seguir a lo largo del video, cada uno con clase y etiqueta
- **Keyframes**: bounding boxes posicionados en frames especificos
- **Interpolacion lineal**: calculo automatico de posiciones entre keyframes
- **Bake**: materializa la interpolacion en anotaciones reales por frame
- **Toggle individual**: habilitar/deshabilitar keyframes especificos
- **Timeline interactiva** con navegacion por frames

---

## Series temporales

Soporte para datos temporales univariados y multivariados:

- **Importacion CSV** con parseo y validacion integrados
- **Visualizacion interactiva** con zoom y pan
- **5 tipos de anotacion**:
  - `point` — marca en un timestamp
  - `range` — rango entre dos timestamps
  - `classification` — etiqueta global de la serie
  - `event` — evento con tipo y confianza
  - `anomaly` — anomalia con score y threshold

---

## Datos tabulares

- Editor de datos tabulares integrado
- Selector de columnas para features y target
- Vista previa de datos
- Entrenamiento con scikit-learn (RandomForest, SVM, kNN, etc.)

---

## Entrenamiento ML integrado

Annotix integra un pipeline de entrenamiento completo directamente en la aplicacion, con 19 backends ML y monitoreo de metricas en tiempo real.

### Backends por tarea

#### Deteccion de objetos

| Backend | Modelos |
|---------|---------|
| **YOLO** (Ultralytics) | YOLOv8, v9, v10, v11, v12 |
| **RT-DETR** (Ultralytics) | RT-DETR-l, RT-DETR-x |
| **RF-DETR** (Roboflow) | RF-DETR-base, RF-DETR-large |
| **MMDetection** (OpenMMLab) | 30+ arquitecturas (Faster R-CNN, DINO, Co-DETR, etc.) |

#### Segmentacion semantica

| Backend | Modelos |
|---------|---------|
| **SMP** | U-Net, DeepLabV3+, FPN, PSPNet, etc. |
| **HuggingFace Segmentation** | SegFormer, Mask2Former, etc. |
| **MMSegmentation** | Catalogo completo OpenMMLab |

#### Segmentacion de instancias

| Backend | Modelos |
|---------|---------|
| **Detectron2** (Facebook) | Mask R-CNN, Cascade R-CNN, etc. |

#### Keypoints y pose

| Backend | Modelos |
|---------|---------|
| **MMPose** | HRNet, ViTPose, RTMPose, etc. |

#### OBB (deteccion rotada)

| Backend | Modelos |
|---------|---------|
| **MMRotate** | Oriented R-CNN, RoI Transformer, etc. |

#### Clasificacion de imagenes

| Backend | Modelos |
|---------|---------|
| **timm** | 700+ modelos (ResNet, EfficientNet, ViT, ConvNeXt, etc.) |
| **HuggingFace Classification** | ViT, BEiT, DeiT, Swin, etc. |

#### Series temporales

| Backend | Tarea |
|---------|-------|
| **tsai** | Clasificacion, regresion, forecasting |
| **PyTorch Forecasting** | Forecasting (TFT, N-BEATS, etc.) |
| **PyOD** | Deteccion de anomalias |
| **tslearn** | Clustering temporal |
| **PyPOTS** | Imputacion de valores faltantes |
| **STUMPY** | Matrix Profile (patron/motif) |

#### Tabular

| Backend | Tarea |
|---------|-------|
| **scikit-learn** | RandomForest, SVM, kNN, GradientBoosting, etc. |

### Modos de ejecucion

| Modo | Descripcion |
|------|-------------|
| **Local** | Entorno Python aislado con micromamba, deteccion de GPU (CUDA/MPS) |
| **Download Package** | Genera un paquete ZIP con script y datos para ejecutar externamente |
| **Cloud** | Entrena en proveedores cloud (Vertex AI, Kaggle, Lightning AI, HuggingFace, Saturn Cloud) |
| **Browser Automation** | Entrena gratis en Google Colab via automatizacion de navegador |

### Presets de entrenamiento

6 presets optimizados para escenarios comunes: `small_objects`, `industrial`, `traffic`, `edge_mobile`, `medical`, `aerial`.

### Metricas en tiempo real

Graficas en vivo de metricas por tarea: box/cls/dfl loss, precision, recall, mAP50, mAP50-95, IoU, dice, accuracy, F1, MAE, RMSE, AUC-ROC, silhouette score, R2, etc.

### Export de modelos entrenados

Formatos soportados: PyTorch (`.pt`), ONNX, TorchScript, TFLite, CoreML, TensorRT.

---

## Automatizacion de navegador

Sistema de automatizacion basado en `headless_chrome` (Chrome DevTools Protocol) que opera sobre el navegador visible del usuario:

### Entrenamiento gratuito en Google Colab

- Detecta automaticamente navegadores Chromium instalados
- Abre Google Colab, sube el dataset y ejecuta el entrenamiento en GPU T4
- Progreso en tiempo real con pausa / reanudacion / cancelacion

### Consulta de LLMs sin API key

Acceso a modelos de lenguaje a traves del navegador del usuario:

- **Kimi** (Moonshot AI)
- **Qwen** (Alibaba)
- **DeepSeek**
- **HuggingChat** (HuggingFace)

---

## Colaboracion P2P

Anotacion colaborativa en tiempo real sin servidor central, usando iroh (protocolo QUIC):

- **Crear sesion** como host o **unirse** como colaborador con un codigo
- **Roles**: host (control total) y collaborator (permisos configurables)
- **Reglas configurables**: subir imagenes, editar clases, eliminar, exportar
- **Lock de imagenes**: modo individual o por lote asignado, con expiracion automatica
- **Asignacion de lotes** de imagenes a colaboradores
- **Sincronizacion de anotaciones** en tiempo real
- **Lista de peers** con estado online

---

## Export e import

### Formatos de exportacion (11)

| Formato | Descripcion |
|---------|-------------|
| YOLO Detection | `.txt` por imagen con bounding boxes normalizados |
| YOLO Segmentation | `.txt` por imagen con poligonos normalizados |
| COCO JSON | JSON unificado con anotaciones, categorias e imagenes |
| Pascal VOC | XML por imagen (formato VOC2012) |
| CSV Detection | CSV con bounding boxes |
| CSV Classification | CSV con etiquetas de clase |
| CSV Keypoints | CSV con coordenadas de keypoints |
| CSV Landmarks | CSV con coordenadas de landmarks |
| Folders by Class | Imagenes organizadas en carpetas por clase |
| U-Net Masks | Mascaras PNG para segmentacion semantica |
| TIX | Formato nativo Annotix (proyecto completo empaquetado) |

Todos los exports generan un archivo ZIP con progreso en tiempo real.

### Formatos de importacion (8)

| Formato | Auto-deteccion |
|---------|----------------|
| YOLO Detection / Segmentation | Si |
| COCO JSON | Si |
| Pascal VOC | Si |
| CSV (4 variantes) | Si |
| U-Net Masks | Si |
| Folders by Class | Si |
| TIX (nativo) | Si |

El detector automatico analiza la estructura del ZIP y asigna un score de confianza a cada formato.

---

## Atajos de teclado

Todos los atajos son **completamente personalizables** desde Settings con deteccion de conflictos por contexto.

<details>
<summary><strong>Ver atajos por defecto</strong></summary>

### Herramientas de imagen

| Atajo | Accion |
|-------|--------|
| `B` | Bounding Box |
| `O` | OBB |
| `M` | Mask |
| `P` | Polygon |
| `K` | Keypoints |
| `L` | Landmarks |
| `V` | Select |
| `H` | Pan |
| `[` / `]` | Reducir / Aumentar brush |
| `E` | Toggle borrador |
| `A` / `D` | Rotar imagen |
| `Enter` | Confirmar |
| `Esc` | Cancelar |

### Navegacion

| Atajo | Accion |
|-------|--------|
| `←` / `→` | Imagen anterior / siguiente |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Zoom fit |

### General

| Atajo | Accion |
|-------|--------|
| `Ctrl+S` | Guardar |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / Rehacer |
| `Del` | Eliminar seleccion |

### Seleccion rapida de clase

| Teclas | Clases |
|--------|--------|
| `1` - `0` | Clases 1 a 10 |
| `Q` - `P` | Clases 11 a 20 |

### Video

| Atajo | Accion |
|-------|--------|
| `T` | Nuevo track |
| `←` / `→` | Frame anterior / siguiente |

### Series temporales

| Atajo | Accion |
|-------|--------|
| `V` | Select |
| `P` | Point |
| `R` | Range |
| `E` | Event |
| `A` | Anomaly |

</details>

---

## Idiomas

Annotix esta disponible en 10 idiomas con carga lazy y fallback a ingles:

| Idioma | Codigo |
|--------|--------|
| Deutsch | `de` |
| English | `en` |
| Espanol | `es` |
| Francais | `fr` |
| Italiano | `it` |
| 日本語 | `ja` |
| 한국어 | `ko` |
| Portugues | `pt` |
| Русский | `ru` |
| 中文 | `zh` |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│   React 19 + TypeScript + Tailwind + shadcn/ui      │
│   Konva (canvas) · Chart.js (metricas) · i18next    │
│   Zustand (estado) · React Router 7                 │
├─────────────────────────────────────────────────────┤
│                  Tauri 2 IPC                         │
│               76 comandos registrados                │
├─────────────────────────────────────────────────────┤
│                  Backend (Rust)                      │
│   ┌────────────┐ ┌───────────┐ ┌─────────────────┐ │
│   │   Store     │ │ Commands  │ │ Export/Import   │ │
│   │ (JSON+RAM)  │ │ (16 mod)  │ │ (11+8 fmts)    │ │
│   └────────────┘ └───────────┘ └─────────────────┘ │
│   ┌────────────┐ ┌───────────┐ ┌─────────────────┐ │
│   │  Training   │ │ Browser   │ │ P2P (iroh)      │ │
│   │ (19 backs)  │ │ Automat.  │ │ QUIC mesh       │ │
│   └────────────┘ └───────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────┤
│               Integraciones externas                 │
│   Python (micromamba) · FFmpeg · Chromium CDP        │
│   Cloud APIs · iroh P2P network                     │
└─────────────────────────────────────────────────────┘
```

### Almacenamiento

```
~/.local/share/annotix/config.json        → configuracion global
{projects_dir}/{uuid}/project.json        → proyecto completo (metadata + clases + anotaciones)
{projects_dir}/{uuid}/images/             → archivos de imagen originales
{projects_dir}/{uuid}/thumbnails/         → thumbnails generados
{projects_dir}/{uuid}/videos/             → archivos de video
```

- Cache en memoria (`HashMap<String, CachedProject>`)
- Escritura atomica (`.tmp` → `rename`)
- Acceso via `with_project(id, |pf| ...)` (lectura) y `with_project_mut(id, |pf| ...)` (escritura)

---

## Stack tecnologico

### Frontend

| Tecnologia | Version | Uso |
|------------|---------|-----|
| React | 19 | UI framework |
| TypeScript | 5.7 | Tipado estatico |
| Vite | 6 | Bundler y dev server |
| Tailwind CSS | 3.4 | Estilos utilitarios |
| shadcn/ui | — | Componentes (Radix UI) |
| Zustand | 5 | Estado global con persistencia |
| React Router | 7 | Enrutamiento SPA |
| Konva | 10 | Canvas 2D de anotaciones |
| Chart.js | 4 | Graficas de metricas |
| i18next | 24 | Internacionalizacion |
| Lucide React | — | Iconografia |

### Backend (Rust)

| Crate | Version | Uso |
|-------|---------|-----|
| tauri | 2 | Framework de aplicacion desktop |
| serde / serde_json | 1 | Serializacion JSON |
| image | 0.25 | Procesamiento de imagenes |
| ffmpeg-the-third | 4 | Extraccion de frames de video |
| zip | 2 | Empaquetado export/import |
| quick-xml | 0.37 | Pascal VOC XML |
| csv | 1.3 | CSV import/export |
| reqwest | 0.12 | Cliente HTTP (cloud providers) |
| headless_chrome | 1.0 | Browser automation (CDP) |
| iroh | 0.96 | P2P networking (QUIC) |
| tokio | 1 | Runtime async |
| blake3 | 1 | Hashing |
| jsonwebtoken | 9 | JWT para cloud |
| uuid | 1 | Generacion de IDs |
| chrono | 0.4 | Timestamps |

### Python (via micromamba)

| Paquete | Uso |
|---------|-----|
| ultralytics | YOLO, RT-DETR |
| rfdetr | RF-DETR |
| mmdet, mmseg, mmpose, mmrotate | OpenMMLab suite |
| segmentation-models-pytorch | Segmentacion semantica |
| timm | Clasificacion (700+ modelos) |
| detectron2 | Segmentacion de instancias |
| tsai, pytorch-forecasting | Series temporales DL |
| pyod, tslearn, pypots, stumpy | Series temporales clasico |
| scikit-learn | ML tabular |

---

## Requisitos del sistema

- **OS**: Windows 10+, macOS 12+, Linux (glibc 2.31+)
- **RAM**: 4 GB minimo, 8 GB recomendado
- **Disco**: 500 MB para la aplicacion + espacio para datasets
- **GPU** (opcional): NVIDIA con CUDA para entrenamiento local acelerado, o Apple Silicon con MPS
- **FFmpeg**: requerido para anotacion de video (incluido en el bundle)
- **Navegador Chromium** (opcional): para browser automation (Chrome, Chromium, Brave, Edge)

---

## Instalacion y desarrollo

### Prerrequisitos

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) >= 1.89
- [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
# Clonar el repositorio
git clone https://github.com/tecmedhub/annotix.git
cd annotix

# Instalar dependencias frontend
npm install

# Desarrollo (frontend + backend)
npm run tauri:dev

# Build de produccion
npm run tauri:build
```

### Scripts disponibles

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Solo frontend (Vite dev server) |
| `npm run build` | Build frontend (TypeScript + Vite) |
| `npm run tauri:dev` | Desarrollo completo (frontend + Rust) |
| `npm run tauri:build` | Build de produccion multiplataforma |
| `npm run lint` | ESLint con zero warnings |
| `npm run preview` | Preview del build frontend |

---

## Estructura del proyecto

```
annotix/
├── package.json                 # Dependencias frontend y scripts
├── tsconfig.json                # Config TypeScript
├── vite.config.ts               # Config Vite
├── tailwind.config.js           # Config Tailwind CSS
├── components.json              # Config shadcn/ui
├── check-translations.ts        # Validador de traducciones
├── DOCS/                        # Documentacion tecnica interna
│   ├── training_backends_reference.md
│   ├── yolo_hyperparameters_reference.md
│   ├── segmentation_backends_reference.md
│   ├── tabular_ml_backends_reference.md
│   └── project_types_architecture.md
├── public/
│   ├── logo.png
│   └── locales/                 # 10 archivos de idioma (JSON)
├── src/
│   ├── main.tsx                 # Entry point React
│   ├── App.tsx                  # Router y providers
│   ├── lib/
│   │   ├── db.ts                # Tipos e interfaces
│   │   ├── tauriDb.ts           # Capa de invocaciones Tauri
│   │   └── i18n.ts              # Configuracion i18next
│   ├── hooks/                   # Hooks globales
│   ├── components/ui/           # Componentes shadcn/ui
│   └── features/
│       ├── core/                # Layout, shortcuts, estado UI
│       ├── projects/            # CRUD y gestion de proyectos
│       ├── gallery/             # Galeria de imagenes
│       ├── canvas/              # Canvas de anotacion (7 herramientas)
│       ├── classification/      # Clasificacion de imagenes
│       ├── video/               # Anotacion de video
│       ├── timeseries/          # Series temporales
│       ├── tabular/             # Datos tabulares
│       ├── training/            # Panel de entrenamiento ML
│       ├── export/              # Exportadores
│       ├── import/              # Importadores
│       ├── settings/            # Configuracion y env Python
│       ├── browser-automation/  # Automatizacion de navegador
│       ├── p2p/                 # Colaboracion P2P
│       └── setup/               # Pantalla de configuracion inicial
└── src-tauri/
    ├── Cargo.toml               # Dependencias Rust
    ├── tauri.conf.json          # Configuracion Tauri
    └── src/
        ├── lib.rs               # Entry point (76 comandos)
        ├── store/               # Almacenamiento (state, IO, cache)
        ├── commands/            # 16 modulos de comandos
        ├── export/              # 7 modulos de exportacion
        ├── import/              # 8 modulos de importacion
        ├── training/            # Multi-backend ML training
        ├── browser_automation/  # Headless Chrome automation
        ├── p2p/                 # Red P2P con iroh
        └── utils/
```

---

## Rutas de la aplicacion

| Ruta | Vista |
|------|-------|
| `/` | Lista de proyectos |
| `/projects/:id` | Galeria de imagenes + gestion de clases |
| `/projects/:id/images/:imageId` | Canvas de anotacion |
| `/projects/:id/timeseries/:tsId` | Visualizacion y anotacion de series temporales |
| `/projects/:id/videos/:videoId` | Anotacion de video con timeline |
| `/settings` | Configuracion de la aplicacion |

La pantalla de setup inicial se muestra automaticamente si no hay directorio de proyectos configurado.

---

## Licencia

MIT License — [TecMedHub](https://github.com/tecmedhub), Universidad Austral de Chile, Campus Puerto Montt.
