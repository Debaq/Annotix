# Arquitectura de Annotix

Analisis completo del patron arquitectonico que sigue un modulo de anotacion de principio a fin, usando como referencia el modulo de anotacion de imagenes (el mas completo).

---

## 1. Definicion del Tipo de Dato

### Backend Rust — `src-tauri/src/store/project_file.rs`

```rust
pub struct AnnotationEntry {
    pub id: String,                        // UUID v4
    pub annotation_type: String,           // "bbox", "polygon", "keypoints", "landmarks", "mask", "obb"
    pub class_id: i64,                     // Referencia a ClassDef.id
    pub data: serde_json::Value,           // JSON flexible por tipo
    pub source: String,                    // "user" | "ai"
    pub confidence: Option<f64>,
    pub model_class_name: Option<String>,
}
```

El campo `data` es **JSON libre** — cada tipo de anotacion define su forma:

| Tipo | Estructura de `data` |
|------|---------------------|
| **bbox** | `{x, y, width, height}` |
| **obb** | `{x, y, width, height, rotation}` |
| **polygon** | `{points: [{x, y}, ...]}` |
| **keypoints** | `{points: [{x, y, visible, name}], instanceId}` |
| **landmarks** | `{points: [{x, y, name}, ...]}` |
| **mask** | `{base64png: "..."}` |

Las anotaciones viven dentro de `ImageEntry`, que a su vez vive dentro de `ProjectFile` — un solo JSON monolitico por proyecto.

### Frontend TypeScript — `src/lib/db.ts`

Replica exactamente los tipos del backend:

```typescript
interface Annotation {
    id: string;
    type: ProjectType;       // 'bbox' | 'polygon' | 'keypoints' | 'landmarks' | 'mask' | 'obb'
    classId: number;
    data: AnnotationData;    // Union de BBoxData | PolygonData | KeypointsData | ...
    source?: 'user' | 'ai';
    confidence?: number;
    modelClassName?: string;
}
```

### Modelo raiz — `ProjectFile`

```rust
pub struct ProjectFile {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub project_type: String,
    pub classes: Vec<ClassDef>,
    pub created: f64,          // JS timestamp (ms)
    pub updated: f64,
    pub images: Vec<ImageEntry>,
    pub timeseries: Vec<TimeSeriesEntry>,
    pub videos: Vec<VideoEntry>,
    pub training_jobs: Vec<TrainingJobEntry>,
    pub tabular_data: Vec<TabularDataEntry>,
    pub p2p: Option<P2pProjectConfig>,
    pub p2p_download: Option<P2pDownloadStatus>,
    pub inference_models: Vec<InferenceModelEntry>,
    pub folder: Option<String>,
}
```

---

## 2. Gestion del Estado

Tres capas de estado coordinadas:

| Capa | Tecnologia | Archivo | Responsabilidad |
|------|-----------|---------|-----------------|
| **UI global** | Zustand (persistido en localStorage) | `src/features/core/store/uiStore.ts` | `activeTool`, `activeClassId`, `currentImageId`, `currentProjectId` |
| **Anotaciones en memoria** | Zustand (volatil) | `src/features/canvas/hooks/useAnnotations.ts` | Array de anotaciones de la imagen actual, seleccion |
| **Undo/Redo** | Zustand (volatil) | `src/features/canvas/store/undoStore.ts` | 100 pasos de historial por imagen, se resetea al cambiar de imagen |

### Patron: Optimistic UI

Se actualiza el store primero, y luego se persiste al backend de forma asincrona. Un `useSaveGuard` previene guardar anotaciones en la imagen equivocada si el usuario navega rapido.

### Backend: Cache en Memoria

```rust
// state.rs
pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub data_dir: PathBuf,
    pub cache: Mutex<HashMap<String, CachedProject>>,
}

pub struct CachedProject {
    pub data: ProjectFile,
    pub dir: PathBuf,
    pub dirty: bool,
}
```

Metodos clave:
- `with_project(id, |pf| ...)` — lectura desde cache
- `with_project_mut(id, |pf| ...)` — escritura (cache + flush automatico)
- `flush_project(id)` — escritura atomica: `.tmp` → `rename`

---

## 3. Comunicacion Frontend - Backend

### Cadena de 4 eslabones

```
Component → Hook → Service → tauriDb → invoke() → Rust Command
```

Ejemplo concreto para guardar anotaciones:

```
AnnotationCanvas.tsx
  → useAnnotations().addAnnotation(annotation)
    → annotationService.save(projectId, imageId, annotations)
      → tauriDb.saveAnnotations(projectId, imageId, annotations)
        → invoke('save_annotations', { projectId, imageId, annotations })
```

### Puente centralizado: `src/lib/tauriDb.ts`

Todas las llamadas `invoke()` pasan por aqui. Nunca se llama `invoke` directamente desde componentes.

### Comunicacion inversa: Eventos Tauri (Backend → Frontend)

```
Rust: app.emit("db:images-changed", payload)
  → Frontend: useTauriQuery escucha el evento → refetch automatico
```

Eventos disponibles:
- `db:images-changed` — cambios en imagenes/anotaciones
- `db:projects-changed` — cambios en proyectos
- `db:videos-changed` — cambios en videos
- `db:tracks-changed` — cambios en tracks
- `db:timeseries-changed` — cambios en series temporales
- `export:progress` / `import:progress` — progreso de operaciones largas

### Hook generico: `useTauriQuery`

```typescript
function useTauriQuery<T>(
    queryFn: () => Promise<T>,
    deps: unknown[],
    eventNames: string[]   // Eventos Tauri que disparan refetch
): { data: T | undefined, isLoading: boolean, reload: () => void }
```

---

## 4. Almacenamiento

### Sin base de datos — Todo es JSON + archivos

```
~/.local/share/annotix/config.json           → { "projects_dir": "/ruta/elegida" }

{projects_dir}/{uuid}/
├── project.json          ← TODO el proyecto serializado (ProjectFile)
├── images/{uuid}_{name}  ← Archivos de imagen
├── thumbnails/{id}.jpg   ← Miniaturas generadas
├── videos/{uuid}_{name}  ← Videos
└── models/{uuid}_{name}  ← Modelos de inferencia
```

### Escritura atomica

```rust
// io.rs
pub fn write_project(dir: &Path, data: &ProjectFile) -> Result<(), String> {
    let content = serde_json::to_string_pretty(data)?;
    fs::write(dir.join("project.json.tmp"), &content)?;   // 1. Escribir a .tmp
    fs::rename("project.json.tmp", "project.json")?;      // 2. Rename atomico (POSIX)
}
```

Toda mutacion sigue el patron: `with_project_mut` → dirty → flush atomico.

---

## 5. Flujo Completo de una Anotacion (BBox)

```
┌─ USUARIO dibuja rectangulo en el canvas ──────────────────────┐
│                                                                │
│  1. AnnotationCanvas.tsx captura onMouseDown/Move/Up           │
│  2. Convierte coordenadas del canvas → pixeles de imagen       │
│  3. Delega al BBoxHandler activo (segun uiStore.activeTool)    │
│                                                                │
│  4. BBoxHandler.onMouseUp() → crea objeto Annotation:          │
│     { id: uuid(), type: "bbox", classId: 3,                   │
│       data: {x: 100, y: 50, width: 200, height: 150} }        │
│                                                                │
│  5. Llama callback onAddAnnotation(annotation)                 │
└────────────────────┬───────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────┐
│  6. useAnnotations.addAnnotation():                            │
│     a) undoStore.pushState(currentAnnotations)  ← undo stack  │
│     b) annotationStore.add(annotation)          ← UI inmediato│
│     c) annotationService.save(...)              ← async       │
└────────────────────┬───────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────┐
│  7. tauriDb.saveAnnotations() → invoke('save_annotations')     │
│                                                                │
│  8. Rust: save_annotations command                             │
│     a) P2P permission check (si hay sesion activa)             │
│     b) with_project_mut(id, |pf| {                             │
│          img.annotations = new_annotations;                    │
│          img.status = "annotated";                             │
│          img.annotated = timestamp();                          │
│        })                                                      │
│     c) Flush atomico a project.json                            │
│     d) emit("db:images-changed")                               │
│     e) Si P2P: sync_annotations_to_doc()                       │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Handler Pattern (Herramientas de Dibujo)

Cada herramienta es una clase en `src/features/canvas/handlers/`:

| Handler | Archivo | Tipo de anotacion |
|---------|---------|-------------------|
| `BBoxHandler` | `BBoxHandler.ts` | bbox |
| `PolygonHandler` | `PolygonHandler.ts` | polygon |
| `OBBHandler` | `OBBHandler.ts` | obb |
| `KeypointsHandler` | `KeypointsHandler.ts` | keypoints |
| `LandmarksHandler` | `LandmarksHandler.ts` | landmarks |
| `MaskHandler` | `MaskHandler.ts` | mask |

Todos implementan la misma interfaz:

```typescript
interface BaseHandler {
    onMouseDown(event: MouseEventData): void;
    onMouseMove(event: MouseEventData): void;
    onMouseUp(event: MouseEventData): void;
}
```

`AnnotationCanvas.tsx` selecciona el handler activo segun `uiStore.activeTool` y le delega los eventos del mouse.

---

## 7. Service Layer

Capa de abstraccion entre hooks y tauriDb:

```
src/features/canvas/services/annotationService.ts  → save, load
src/features/gallery/services/imageService.ts      → get, list, upload, delete
src/features/projects/services/projectService.ts   → CRUD proyectos
src/features/video/services/videoService.ts        → CRUD videos, tracks, keyframes
src/features/p2p/services/p2pService.ts            → sesiones, locks, sync
src/features/inference/services/inferenceService.ts → modelos, predicciones
```

---

## 8. Exportacion

### Router central: `src-tauri/src/export/mod.rs`

```rust
pub fn export_dataset(
    state: &AppState,
    project_id: &str,
    format: &str,
    output_path: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), String>
```

### 11 formatos soportados

| Formato | Archivo | Tipos de anotacion | Estructura de salida |
|---------|---------|--------------------|--------------------|
| yolo-detection | `yolo.rs` | BBox, OBB | `data.yaml` + `classes.txt` + `images/` + `labels/*.txt` |
| yolo-segmentation | `yolo.rs` | Polygon | Idem con coords de poligono |
| coco | `coco.rs` | BBox, Polygon, Keypoints, OBB | `annotations.json` + `images/` |
| pascal-voc | `pascal_voc.rs` | BBox, OBB | `Annotations/*.xml` + `JPEGImages/` |
| csv-detection | `csv_export.rs` | BBox | `annotations.csv` + `classes.csv` + `images/` |
| csv-classification | `csv_export.rs` | Clasificacion | Idem |
| csv-keypoints | `csv_export.rs` | Keypoints | Idem |
| csv-landmarks | `csv_landmarks.rs` | Landmarks | Idem |
| folders-by-class | `folders_by_class.rs` | Clasificacion | `classname/image.jpg` |
| unet-masks | `unet_masks.rs` | Mask, Polygon | `images/` + `masks/` (PNG binario) |
| tix | `tix.rs` | Todos | `annotations.json` + `images/` (formato nativo) |

### Pipeline de exportacion

1. Carga ProjectFile del cache
2. Filtra solo imagenes con anotaciones + classIds validos
3. Crea ZIP con estructura especifica del formato
4. Normaliza coordenadas segun formato (YOLO: [0,1], COCO: pixeles absolutos, etc.)
5. Emite eventos `export:progress` por imagen

### Parsers comunes en `mod.rs`

```rust
parse_bbox(data) → BBoxData {x, y, width, height}
parse_obb(data) → OBBData {x, y, width, height, rotation}
parse_polygon(data) → PolygonData {points: Vec<(f64, f64)>}
parse_keypoints(data) → KeypointsData {points, instance_id}
parse_landmarks(data) → LandmarksData {points}
parse_mask(data) → MaskData {base64png}
```

---

## 9. Importacion

### Router central: `src-tauri/src/import/mod.rs`

```rust
pub fn detect_format(file_path: &str) -> Result<DetectionResult, String>
pub fn import_dataset(
    state: &AppState,
    file_path: &str,
    project_name: &str,
    app_handle: &tauri::AppHandle,
) -> Result<ImportResult, String>
```

### Deteccion automatica de formato

Inspeccion de contenido del ZIP (no basada en nombre de archivo):

1. **YOLO**: busca `classes.txt` + `data.yaml` (confianza 0.95)
2. **U-Net Masks**: busca carpeta `masks/` con imagenes (0.9)
3. **TIX**: busca `annotations.json` con array `images` (0.95)
4. **COCO**: busca `annotations.json` con `images/annotations/categories` (0.95)
5. **Pascal VOC**: busca `Annotations/*.xml` (0.9)
6. **CSV**: analiza header de `annotations.csv` (0.85-0.9)
7. **Folders by Class**: busca >=2 carpetas con imagenes (0.85)

### Pipeline de importacion

1. Detecta formato inspeccionando el ZIP
2. Parsea archivos especificos del formato
3. Crea clases (con colores auto-generados si no existen)
4. Extrae imagenes como bytes
5. Crea AnnotationEntry desnormalizando coordenadas
6. Crea proyecto con `state.create_project()`
7. Sube imagenes con `state.upload_image_bytes()` (batch)
8. Emite eventos `import:progress`

---

## 10. Sincronizacion P2P

### Stack tecnologico

- **Iroh**: protocolo P2P (CRDT + blobs distribuidos + gossip)
- Sin servidor central — todo es peer-to-peer

### Estructura del documento distribuido

```
meta/
  project              → JSON {name, type, version}
  host_secret_hash     → blake3(host_secret)
  host_node_id         → endpoint ID
  rules                → SessionRules JSON
  peers/{node_id}      → {display_name, role, joined_at}
  work_distribution    → WorkDistribution JSON
  pending_approvals    → PendingApproval[] JSON

classes/{id}           → ClassDef JSON

images/{id}/
  meta                 → {id, name, file, width, height, status}
  annots               → AnnotationEntry[] JSON
  blob                 → Imagen binaria (content-addressed)
  lock                 → ImageLockInfo {locked_by, expires_at}
```

### Roles y permisos

| Permiso | LeadResearcher | Annotator | DataCurator |
|---------|---------------|-----------|-------------|
| Annotate | Si | Configurable | No |
| UploadData | Si | No | Configurable |
| Export | Si | No | Configurable |
| EditClasses | Si | No | No |
| Delete | Si | No | No |
| Manage | Si | No | No |

### Bloqueo de imagenes

- TTL: 3 minutos, renovacion cada 1 minuto
- Se adquiere al abrir una imagen, se libera al cerrarla
- Si expira, otro peer puede tomar el bloqueo

### Flujo de sincronizacion

1. Usuario guarda anotaciones
2. Se escriben en `images/{id}/annots` del documento CRDT
3. Iroh resuelve conflictos automaticamente (latest-write-wins)
4. Gossip broadcast: `AnnotationsSaved { imageId, by }`
5. Otros peers descargan las anotaciones actualizadas

---

## 11. Registros de Comandos Tauri

`src-tauri/src/lib.rs` registra **62+ comandos** organizados por modulo:

| Modulo | Comandos | Ejemplos |
|--------|----------|----------|
| Projects | 7 | `create_project`, `list_projects`, `delete_project` |
| Images | 8 | `upload_images`, `save_annotations`, `get_image` |
| Videos | 13 | `upload_video`, `create_track`, `set_keyframe`, `bake_video_tracks` |
| Timeseries | 5 | `create_timeseries`, `save_ts_annotations` |
| Export/Import | 3 | `export_dataset`, `detect_import_format`, `import_dataset` |
| Inference | 14 | `upload_inference_model`, `start_batch_inference`, `accept_prediction` |
| P2P | 25 | `p2p_create_session`, `p2p_lock_image`, `p2p_sync_annotations` |
| Training | 17 | `start_training`, `cancel_training`, `detect_gpu` |
| Tabular | 6 | `upload_tabular_file`, `get_tabular_preview` |
| Config | 3 | `is_setup_complete`, `set_projects_dir` |

---

## 12. Estructura de Directorios

### Frontend

```
src/
├── lib/
│   ├── db.ts                       ← Tipos TypeScript (mirror de Rust)
│   ├── tauriDb.ts                  ← Puente centralizado (invoke)
│   └── i18n.ts                     ← Internacionalizacion (10 locales)
├── features/
│   ├── core/store/uiStore.ts       ← Store global (Zustand)
│   ├── canvas/
│   │   ├── components/
│   │   │   ├── AnnotationCanvas.tsx ← Componente principal del canvas
│   │   │   └── renderers/          ← BBoxRenderer, MaskRenderer, etc.
│   │   ├── handlers/               ← BBoxHandler, PolygonHandler, etc.
│   │   ├── hooks/useAnnotations.ts ← Estado + sync de anotaciones
│   │   ├── store/undoStore.ts      ← Undo/redo (100 pasos)
│   │   └── services/annotationService.ts
│   ├── gallery/
│   │   ├── hooks/useCurrentImage.ts
│   │   └── services/imageService.ts
│   ├── projects/
│   │   ├── hooks/useCurrentProject.ts
│   │   └── services/projectService.ts
│   ├── video/                      ← Anotacion de video
│   ├── timeseries/                 ← Series temporales
│   ├── inference/                  ← Modelos ML
│   ├── training/                   ← Entrenamiento YOLO
│   ├── p2p/                        ← Colaboracion P2P
│   ├── export/                     ← UI de exportacion
│   ├── import/                     ← UI de importacion
│   ├── tabular/                    ← Datos tabulares
│   └── browser-automation/         ← Web scraping
└── hooks/useTauriQuery.ts          ← Hook generico de queries Tauri
```

### Backend

```
src-tauri/src/
├── lib.rs                          ← Registro de comandos Tauri
├── main.rs                         ← Entry point
├── store/
│   ├── project_file.rs             ← Todos los structs/modelos
│   ├── state.rs                    ← AppState + cache
│   ├── io.rs                       ← read_project / write_project
│   ├── projects.rs                 ← CRUD proyectos
│   ├── images.rs                   ← Operaciones de imagen
│   ├── videos.rs                   ← Videos, tracks, keyframes
│   ├── timeseries.rs               ← Series temporales
│   ├── inference.rs                ← Modelos + predicciones
│   └── config.rs                   ← AppConfig
├── commands/                       ← Handlers de comandos Tauri
├── export/                         ← Exportadores (11 formatos)
├── import/                         ← Importadores + detector
├── p2p/                            ← Motor P2P (Iroh)
│   ├── node.rs                     ← Nodo P2P + permisos
│   ├── session.rs                  ← Crear/unirse sesiones
│   ├── sync.rs                     ← Watcher + heartbeat
│   ├── locks.rs                    ← Bloqueo de imagenes
│   ├── distribution.rs             ← Distribucion de trabajo
│   └── protocol.rs                 ← Mensajes gossip
└── training/                       ← Pipeline de entrenamiento
```

---

## 13. Principios Arquitectonicos

1. **JSON monolitico** — todo el proyecto es un solo archivo `project.json`, sin base de datos
2. **Cache + flush atomico** — rendimiento de memoria, seguridad de disco (`.tmp` → `rename`)
3. **Optimistic UI** — el usuario nunca espera al backend; store se actualiza primero
4. **Handler pattern** — cada herramienta es una clase con `onMouseDown/Move/Up`
5. **Cadena service → tauriDb → invoke** — nunca se salta eslabones
6. **Eventos bidireccionales** — `invoke()` para comandos, `emit()` para notificaciones
7. **`serde_json::Value` para data** — flexibilidad total sin migraciones de esquema
8. **P2P como interceptor** — se verifica permisos en cada comando, sync transparente
9. **Feature-based structure** — cada feature es un modulo independiente con components/hooks/services/store

### Diagrama de capas

```
TypeScript Types (db.ts)  ←→  Rust Structs (project_file.rs)
         ↕                              ↕
   Zustand Stores                 Cache en memoria
   (optimistic UI)              (HashMap + dirty flag)
         ↕                              ↕
    Service Layer                  with_project_mut
   (annotationService)            (flush atomico)
         ↕                              ↕
     tauriDb.ts ──── invoke() ────→ Tauri Commands
                ←── events ───────
         ↕                              ↕
   useTauriQuery                  P2P sync (Iroh)
   (auto-refetch)               (CRDT + gossip)
```
