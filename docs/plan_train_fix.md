# Plan de ejecución — dejar el sistema de entrenamiento funcionando

Parte de la auditoría en [`roadmap_train.md`](roadmap_train.md). Objetivo: que **todo
backend y todo modo de ejecución ofrecido en la UI entrene de verdad**, verificado con
corridas reales, no por lectura de código.

## Decisiones tomadas (2026-09-12)

1. **OpenMMLab y Detectron2 se reemplazan, no se parchean.** MMDetection, MMSegmentation,
   MMPose, MMRotate y Detectron2 son incompatibles con el entorno real de Annotix
   (torch 2.10, numpy 2.2, sin CUDA): `mmcv` no tiene wheels para torch ≥2.5, `mmrotate`
   está congelado desde 2022 con `mmcv<2.1`, y `detectron2` no está en PyPI. Se sustituyen
   por backends HuggingFace mantenidos que cubren las mismas tareas.
2. **Verificación con smoke tests reales.** Se instalan los paquetes que falten en
   `~/.local/share/annotix/python-env` y cada backend corre 2 épocas en CPU sobre un
   proyecto sintético. Un backend no se declara "funcionando" sin `ANNOTIX_EVENT` de época
   y `completed` con pesos en disco.

## Entorno de verificación (ya comprobado)

```
~/.local/share/annotix/python-env  Python 3.10.19 (conda-forge)
torch 2.10.0+cpu · torchvision 0.25.0 · ultralytics 8.4.19 · numpy 2.2.6 · scikit-learn 1.7.2
GPU: AMD Vega iGPU — sin CUDA → todo se valida en CPU con imágenes 64×64 y 2 épocas
```

## Catálogo objetivo (tras el plan)

| Tarea | Backends | Nota |
|---|---|---|
| detect | `yolo`, `rt_detr`, `rf_detr`, **`hf_detection`** (nuevo) | `hf_detection` reemplaza a `mmdetection` |
| segment (semántica) | `yolo`, `smp`, `hf_segmentation` | se elimina `mmsegmentation`, ya cubierto 2× |
| instance_segment | `yolo`, **`hf_instance`** (nuevo) | `hf_instance` (Mask2Former/MaskFormer) reemplaza `detectron2` + `mmdetection`-instance |
| classify | `yolo`, `timm`, `hf_classification` | se arreglan los dos últimos |
| multi_classify | `timm`, `hf_classification` | se arregla el contrato + pérdida BCE |
| pose | `yolo`, **`hf_pose`** (nuevo, ViTPose) | reemplaza `mmpose` |
| landmarks | **`hf_pose`** | hoy sólo lo ofrecía `mmpose` (roto) → pasa a tener backend real |
| obb | `yolo` | se elimina `mmrotate`; YOLO-OBB es el único camino vivo |
| series temporales (7 tareas) | `tsai`, `pytorch_forecasting`, `pyod`, `tslearn`, `pypots`, `stumpy` | se arregla el contrato de datos, que hoy los rompe a todos |
| tabular | `sklearn` | se arregla instalación y empaquetado |

Neto: 19 backends → 16, todos funcionando y verificados, sin pérdida de cobertura de
tareas (y `landmarks` gana un backend que antes no tenía).

---

## Progreso

| Fase | Estado |
|---|---|
| 0 — contrato + arnés | ✅ hecho (commit `30ea9d0`) |
| Backends verificables en verde | ✅ hecho (commit `acb14bd`): yolo detect/segment/classify, rt_detr, rf_detr, smp, hf_segmentation, sklearn |
| 1 — split de test universal | pendiente |
| 2 — clasificación y series temporales | pendiente |
| 3 — reemplazo de OpenMMLab/Detectron2 por HF | pendiente |
| 4 — cloud con el backend elegido | pendiente |
| 5 — browser automation | pendiente |
| 6 — coherencia de UI | pendiente |
| 7 — verificación final | parcial: 8 smoke tests en verde |

Los ocho bugs que el arnés destapó en los backends que la auditoría daba por
buenos están en la sección 0 de `roadmap_train.md`.

---

# Fase 0 — Cimientos: contrato único de dataset + arnés de pruebas

Esta fase no arregla ningún backend por sí sola, pero es la que hace imposible el bug que
rompió 13 de 19. Va primera porque todas las demás se apoyan en ella.

## 0.1 `PreparedDataset`: una sola verdad sobre el layout

Hoy `prepare_dataset_for_backend` devuelve un `String` con la ruta raíz
(`dataset.rs:888`) y cada generador de script escribe a mano los subpaths que **cree** que
existen. Ahí nace el desastre.

Nuevo tipo en `training/dataset.rs`:

```rust
pub struct PreparedDataset {
    pub root: PathBuf,
    pub format: DatasetFormat,
    pub num_classes: usize,
    pub class_names: Vec<String>,
    /// Rutas relativas a `root`, declaradas por el preparador.
    pub inputs: BTreeMap<&'static str, String>,
}
```

Claves canónicas de `inputs` (las únicas permitidas):

```
images_train, images_val, images_test
labels_train, labels_val, labels_test      # txt YOLO o json de etiquetas
masks_train, masks_val
ann_train, ann_val, ann_test               # COCO json
data_yaml, classes_file
x_train, y_train, x_val, y_val, x_test, y_test   # .npy series
table_csv, long_csv
```

Reglas: un preparador **sólo** puebla las claves que escribe; un generador **sólo** puede
interpolar claves presentes en `inputs`, vía un helper `ds.input("images_train")?` que
falla en compilación-lógica (devuelve `Result`) si la clave no está. Ningún generador
vuelve a escribir un literal de ruta.

Layout unificado para todos los backends de imagen (se normaliza lo que hoy es un zoo):

```
{job}/images/{train,val,test}/...
{job}/labels/{train,val,test}/...        # YOLO txt
{job}/masks/{train,val}/...              # PNG índice de clase
{job}/annotations/instances_{split}.json # COCO bbox / instancia
{job}/annotations/keypoints_{split}.json # COCO keypoints
{job}/labels_{split}.json                # clasificación (single y multi)
{job}/classes.json                       # [{id, name}] — reemplaza classes.txt
{job}/data.yaml                          # sólo ultralytics
```

Cambios concretos: `prepare_coco_dataset` deja de tener dos layouts (`CocoLayout`) y
escribe siempre `images/{split}` + `annotations/`; RF-DETR recibe además los alias
`train/`/`valid/` que su librería exige, por symlink o copia del json (RF-DETR es el único
con layout propio no negociable).

## 0.2 Tests de contrato (Rust)

`src-tauri/tests/training_contracts.rs`, uno por backend × tarea soportada:

1. Construye un `ProjectFile` sintético en memoria (3 imágenes 64×64 reales escritas a
   disco, 2 clases, anotaciones del tipo que la tarea requiere).
2. `prepare_dataset_for_backend` → `PreparedDataset`.
3. Asserts: cada ruta de `inputs` existe en disco y es no-vacía.
4. `generate_train_script_for_backend` → para cada archivo `.py` generado, un lint por
   regex: no puede aparecer ningún `os.path.join(dataset_dir, "…")` cuyo literal no esté
   en el conjunto de `inputs`. Esto es lo que caza exactamente los 13 fallos actuales.
5. Assert de sintaxis: `python -m py_compile` sobre cada script generado (barato, caza
   f-strings mal escapados en los `format!`).

## 0.3 Arnés de smoke test (shell + Python)

`scripts/train_smoke.sh <backend> [tarea]`:

- Crea un proyecto sintético en `/tmp/annotix-smoke/{backend}` (imágenes generadas con
  PIL; series sintéticas con numpy; CSV tabular sintético).
- Llama a un binario de test `cargo run --bin gen_training_job -- --backend X --task Y`
  que hace prepare + generate y deja el `train.py` en disco (evita levantar la app entera).
- Ejecuta `python train.py` con `epochs=2`, `imgsz=64`, `batch=2`, `device=cpu`.
- Asserts: al menos un `ANNOTIX_EVENT:{"type":"epoch"}`, un `completed`, y que
  `bestModelPath` existe.
- `scripts/train_smoke.sh --all` recorre los 16 y escribe una tabla de resultados.

Entregable de la fase: el arnés corre y **reporta en rojo los 13 backends rotos**. Ese
rojo es la línea base contra la que se mide el resto del plan.

---

# Fase 1 — Split train/val/test universal

`compute_split` (`dataset.rs:71`) ya calcula los tres splits correctamente, pero sólo
`prepare_dataset` lo usa. Los otros seis preparadores reciben únicamente `val_split` y
el `testSplit` de la UI se descarta en silencio (§5.5 de la auditoría).

- Extraer `fn split_indices(total, val_split, test_split, seed) -> SplitIndices` con el
  shuffle determinista sembrado por `project.id` que hoy está copiado seis veces.
- Todos los preparadores pasan a aceptar `DatasetSpec` completo y a poblar `*_test`.
- Los scripts que soporten evaluación final en test la hacen y emiten `testMetrics`.
- `TrainingResult` gana `test_metrics: Option<TrainingEpochMetrics>` y `handle_event`
  (`runner.rs:711`) lo persiste — hoy YOLO ya lo calcula y se tira a la basura (§5.6).

---

# Fase 2 — Arreglar los backends que ya existen

## 2.1 Clasificación: `timm` y `hf_classification`

El bug más peligroso del sistema: hoy entrenaría **todo como clase 0** sin error visible.

- `prepare_classification_dataset_imagefolder` deja de delegar en el layout
  `{split}/{nombre_clase}/` y escribe:
  - `images/{split}/archivo.jpg` (plano)
  - `labels_{split}.json` → `[{"filename": "x.jpg", "label": 0}]`, índice = posición en
    `project.classes`
  - `classes.json`
- Multi-etiqueta: mismo `labels_{split}.json` con `"labels": [0,1,1,0]` en vez de `label`.
- En los scripts (`scripts.rs:2532`, `scripts.rs:2778`): eliminar el fallback por carpetas
  (era la fuente del `int(dir) if isdigit() else 0`), leer el json siempre, y en
  multi-etiqueta usar `BCEWithLogitsLoss` + métricas `f1_score`/`mAP` por umbral 0.5 en
  lugar de `CrossEntropyLoss`.
- Verificación extra en el smoke: el script imprime la distribución de clases del dataset
  cargado; el test falla si todas las muestras caen en una sola clase.

## 2.2 Series temporales: el contrato que rompe seis backends

Núcleo de la fase. Hoy el preparador escribe `{serie_id}.csv` + `metadata.json` y los seis
scripts piden `.npy` o `data.csv` (§2.3).

Nuevo `prepare_timeseries_arrays` en `dataset.rs`:

1. Lee cada serie (`read_series_data`, ya existe y maneja el formato embebido y el de
   archivo).
2. **Ventaneo**: `window_size` y `stride` ya llegan en `backendParams` y hoy se descartan
   con `_` (`scripts.rs:3020`). Se usan: ventanas deslizantes → `X` de forma
   `(n_ventanas, n_canales, window_size)`, que es exactamente el layout que espera tsai.
3. **Etiquetado por ventana**, según la tarea:
   - `ts_classify`: clase de la anotación que cubre el centro de la ventana.
   - `ts_event` / `ts_segment`: vector por paso (`y` de forma `(n, window_size)`).
   - `ts_forecast` / `ts_regress`: `y` = los `horizon` pasos siguientes a la ventana.
   - `ts_anomaly` / `ts_cluster` / `ts_impute`: no supervisado → sólo `X`.
4. **Normalización** z-score por canal, con media/desvío guardados en `meta.json` para que
   la inferencia posterior pueda replicarla.
5. Escribe `x_train.npy`, `y_train.npy`, `x_val.npy`, `y_val.npy` (+ test) y `meta.json`.
6. Para `pytorch_forecasting`, además `long.csv` en formato largo
   (`series_id, time_idx, target, <covariables>`), que es lo que `TimeSeriesDataSet`
   consume; el script pasa a leer `long_csv` del contrato en vez de `data.csv`.
7. Para `stumpy` (no supervisado, sin splits) basta `x_train.npy`; se elimina la referencia
   a `timeseries.npy`/`timeseries.csv`.

Los seis scripts pasan a leer las claves del `PreparedDataset`; ninguno vuelve a nombrar
un archivo a mano.

## 2.3 Tabular `sklearn`

- `prepare_tabular_dataset` (`dataset.rs:962`) copia el CSV de verdad y puebla
  `table_csv`; se elimina la copia ad-hoc del runner (`runner.rs:200`), que es la razón de
  que el paquete descargable saliera sin datos (§5.4).
- `install_backend_packages` (`training_commands.rs:479`): añadir la rama `"sklearn"`
  (hoy cae en `Err("Backend desconocido")` y bloquea el arranque, §5.3).
- El script deja de glob-ear `*.csv` y usa `table_csv`.

## 2.4 Artefactos, export y métricas

- `list_training_jobs` (`training_commands.rs:334`) hoy busca sólo
  `weights/best.pt`/`last.pt`, así que ningún backend no-ultralytics muestra reanudar,
  fine-tune ni informe (§5.2). Se introduce, junto al backend, una tabla de patrones de
  artefacto: `weights/best.pt`, `train_output/best.pth`, `best_model.joblib`,
  `learner.pkl`, `model.onnx`.
- Export post-hoc (`model_export.rs`) despacha por backend en vez de asumir
  `YOLO(path).export()` (§5.1): ultralytics → `.export()`; torch (`smp`, `timm`, `hf_*`,
  `tsai`) → `torch.onnx.export` con el `input_shape` guardado en `meta.json`; sklearn →
  `skl2onnx`. Los scripts ya generan ONNX al terminar, así que esto sólo cubre la
  exportación posterior a otro formato.
- Callback YOLO: añadir `metrics/*(M)` (segmentación) y `metrics/*(P)` (pose) al evento de
  época, hoy sólo recoge `(B)` (§5.7).

---

# Fase 3 — Reemplazar OpenMMLab y Detectron2 por backends HF

## 3.1 Eliminación

- `TrainingBackend`: fuera `MmDetection`, `MmSegmentation`, `MmPose`, `MmRotate`,
  `Detectron2`.
- `scripts.rs`: fuera `generate_mmdet_config/_train_script`, `generate_mmseg_*`,
  `generate_mmpose_*`, `generate_mmrotate_*`, `generate_detectron2_script`
  (~1900 líneas que nunca ejecutaron).
- `backends.rs`: fuera los builders correspondientes.
- `python_env.rs`: fuera las sondas de versión `mmdetVersion`, `mmsegVersion`,
  `mmposeVersion`, `mmrotateVersion`, `detectron2Version`; fuera la rama `mim install`.
- Frontend: `types.ts`, `BackendSelector.tsx`, `BackendConfigPanel.tsx`,
  `useTrainingRequest.ts`, `presets.ts`, `settings/data/backendsData.ts` (70 referencias),
  `settings/data/defaultParams.ts`, y `training.json` en los 10 locales.
- Los jobs históricos con esos backends siguen listándose (su `config` es JSON libre), pero
  no se pueden reanudar — cosa que tampoco se podía antes, porque nunca llegaron a entrenar.

## 3.2 `hf_detection` (reemplaza MMDetection-detect)

- Modelos: `facebook/detr-resnet-50`, `facebook/detr-resnet-101`,
  `SenseTime/deformable-detr`, `microsoft/conditional-detr-resnet-50`, `IDEA-Research/dino-*`
  según disponibilidad en `transformers` instalado.
- Dataset: COCO bbox, ya existe (`prepare_coco_dataset` normalizado en Fase 0).
- Script: `AutoImageProcessor` + `AutoModelForObjectDetection`, loop propio (no `Trainer`,
  para emitir `ANNOTIX_EVENT` por época con el mismo formato), mAP con `torchmetrics`
  (`MeanAveragePrecision`) → llena `mAP50`/`mAP50_95`, ONNX al cierre.

## 3.3 `hf_instance` (reemplaza Detectron2 y MMDetection-instance)

- Modelos: `facebook/mask2former-swin-tiny-coco-instance`, `-small-`, `-base-`,
  `facebook/maskformer-swin-tiny-coco`.
- Dataset: `prepare_coco_instance_dataset` (ya genera polígonos con `segmentation`, sólo
  hay que enchufarlo: hoy el router mandaba MMDetection-instance al preparador de bbox,
  §3.2 de la auditoría).
- Métrica: `maskAP` (torchmetrics con `iou_type="segm"`), que ya existe en
  `TrainingEpochMetrics`.

## 3.4 `hf_pose` (reemplaza MMPose, y da backend a `landmarks`)

- Modelos: familia ViTPose (`usyd-community/vitpose-base-simple` y variantes) según
  soporte de la versión instalada de `transformers`; alternativa de respaldo: cabeza de
  heatmap propia sobre backbone `timm` (misma entrada, sin dependencia nueva).
- Dataset: `prepare_coco_keypoints_dataset` (ya existe). Se corrige la construcción de
  categorías, que hoy infiere los nombres de keypoint partiendo el nombre de la clase por
  comas (`dataset.rs:1182`): pasa a leer el esqueleto real del proyecto (existe
  `skeleton.json` en los locales y tipos de landmarks en el modelo de datos).
- Métrica: `keypointAP` (ya en `TrainingEpochMetrics`).

## 3.5 `obb`

Queda sólo `yolo` con `-obb`. Se documenta en `training_backends_reference.md` que la
alternativa rotada de OpenMMLab se retiró por incompatibilidad de dependencias.

---

# Fase 4 — Cloud: que entrene el backend elegido y reporte progreso

## 4.1 Un solo generador de script para local, paquete y nube

Hoy cada runner cloud tiene su propio string con `from ultralytics import YOLO`
hardcodeado; cero referencias a `request.backend` en los 7 proveedores (§4.1). Pero
`notebook::script_to_notebook` (`notebook.rs:54`) **ya** convierte un script arbitrario en
notebook con cabecera, autotune y celda de resultados — es lo que usa el paquete
descargable.

Cambio estructural: los runners cloud dejan de generar Python. Reciben
`generate_train_script_for_backend(request, &prepared, n)` + `script_to_notebook(...)` y
sólo se ocupan de: subir el zip, lanzar el job, pollear, traer el modelo. Un solo camino
de generación para los tres modos ⇒ los arreglos de las Fases 2 y 3 llegan gratis a la
nube.

## 4.2 Rutas y descompresión

- Unificar en `data.yaml` y búsqueda recursiva (`glob('**/data.y*ml')`) — arregla de una
  vez Lightning, Saturn, Vertex Custom y el fallback incompleto de Kaggle (§4.2).
- Colab Enterprise: subir el zip como objeto explícito y **descomprimirlo** en el
  notebook; hoy hace `gsutil cp -r <uri-del-zip>/*` y nunca descomprime.
- Rutas temporales del **host**: `/tmp/...` hardcodeado (`colab.rs:120`,
  `vertex_tuning.rs:48`) → `std::env::temp_dir()`. En Windows hoy fallan antes de subir nada.

## 4.3 Progreso en vivo

`fetch_progress` tiene default vacío (`cloud/mod.rs:75`) y sólo Kaggle la implementa, así
que seis proveedores dejan la barra en 0 % hasta terminar (§4.3).

- Vertex Custom y Colab Enterprise: Cloud Logging API
  (`entries:list` filtrando por `resource.labels.job_id`), extraer líneas `ANNOTIX_EVENT:`.
- Lightning AI y Saturn: endpoint de logs del job.
- Hugging Face: logs del Space/Job vía API.
- Si un proveedor no expone logs, la UI debe mostrar progreso *indeterminado* explícito en
  vez de un 0 % que parece cuelgue.

## 4.4 Descarga del modelo: un único sumidero de resultados

Hoy `model_output_uri` se rellena sólo en Colab y Gemini; Vertex Custom, Lightning, HF y
Saturn lo dejan en `None` y su `download_model` siempre falla o apunta a endpoints
inventados (§4.3).

Solución uniforme: **el propio notebook sube los pesos al storage del proveedor ya
configurado** (bucket GCS para GCP, dataset/output de Kaggle, repo de modelo en HF) y
emite `ANNOTIX_EVENT:{"type":"artifact","uri":...}`. El poller guarda esa URI y
`download_model` baja de ahí. Se eliminan las URLs adivinadas (`api/models/{repo}/resolve`,
`/studios/{id}/artifacts/...`).

## 4.5 Parámetros de máquina y Gemini Tuning

- Colab Enterprise: `machine_type`, `accelerator_type`, `accelerator_count` hoy se leen y
  se descartan (prefijados con `_`, `colab.rs:136`); pasan al `notebookRuntimeTemplate`, y
  el template hardcodeado `.../notebookRuntimeTemplates/default` se vuelve configurable.
- **Vertex AI Gemini Tuning se retira del catálogo.** `convert_to_jsonl`
  (`vertex_tuning.rs:185`) ignora el dataset y fabrica una frase por clase: se paga un
  tuning que no ve una sola imagen. Y aun implementándolo bien, produce un modelo alojado
  en Vertex que Annotix no puede descargar ni usar para anotar — no encaja en "entrenar un
  modelo propio". Si más adelante se quiere tuning multimodal, es una feature distinta
  (asistente de anotación por prompt), no un backend de entrenamiento.

Quedan 6 proveedores cloud, todos con submit + progreso + descarga reales.

---

# Fase 5 — Browser automation (Colab gratis)

La mecánica CDP es sólida; el problema es que el código inyectado es literal:
`YOLO('yolov8n.pt')`, `epochs=50`, `imgsz=640`, `batch=16` (§4.4).

- `step_training_code` genera las celdas desde el `TrainingRequest` reutilizando el mismo
  generador de la Fase 4.1.
- `upload_dataset` pasa a `requires_user: true` con instrucción traducida: hoy declara
  `false` pero abre el file-picker de `files.upload()` y espera 300 s a una persona.
- `step_install_deps` instala los requirements del backend elegido, no `ultralytics` fijo.

---

# Fase 6 — Coherencia de UI

- `BackendInfo` gana `status: "stable" | "experimental"` y la UI lo muestra; sirve para el
  futuro, cuando se agregue un backend antes de validarlo.
- `BackendSelector.isInstalled` (`BackendSelector.tsx:52`) pasa a tabla
  `backend → campo de PythonEnvStatus`; hoy devuelve `false` para 9 backends aunque estén
  instalados (§5.8).
- El botón de fine-tune se oculta cuando el backend no lo soporta, en vez de hacer
  `return` silencioso al click (`TrainingPanel.tsx:352`).
- `ExecutionMode::BrowserAutomation`: o se maneja en `start_training_v2` o se elimina del
  enum; hoy es rama muerta que caería en local.
- Presets y parámetros por defecto para los tres backends nuevos
  (`presets.ts`, `defaultParams.ts`, `backendsData.ts`).
- `training.json` en los 10 locales: nombres/descripciones de los nuevos, fuera los
  retirados. Validar con `pnpm check-translations`.

---

# Fase 7 — Verificación final

1. `scripts/train_smoke.sh --all` → los 16 backends en verde. Es el criterio de
   aceptación del plan; sin esto, no está hecho.
2. Instalación previa de paquetes (CPU): `timm`, `transformers`, `torchmetrics`,
   `segmentation-models-pytorch`, `albumentations`, `tsai`, `fastai`,
   `pytorch-forecasting`, `pytorch-lightning`, `pyod`, `tslearn`, `pypots`, `stumpy`,
   `xgboost`, `lightgbm`, `skl2onnx`, `rfdetr`, `pycocotools`. Varios cientos de MB; se
   instalan una vez y quedan para el resto de las fases.
3. `cargo test` (incluye los contratos de la Fase 0), `cargo clippy -- -D warnings`,
   `pnpm lint`, `pnpm check-translations`.
4. Prueba manual en la app real: un proyecto por familia (detección, segmentación,
   clasificación, pose, series, tabular) entrenando desde la UI, con gráficas en vivo,
   cancelación, reanudación e informe PDF.
5. Actualizar `docs/roadmap_train.md` con el estado final y `docs/training_backends_reference.md`
   con el catálogo nuevo.

---

# Orden de trabajo y commits

Un commit por bloque, directo a `main` (los cambios no rompen datos existentes: los jobs
guardados conservan su `config` como JSON libre).

| # | Commit | Depende de |
|---|---|---|
| 1 | `refactor(training): PreparedDataset como contrato único dataset↔script` | — |
| 2 | `test(training): contratos de dataset y arnés de smoke test` | 1 |
| 3 | `feat(training): split de test en todos los backends + testMetrics persistido` | 1 |
| 4 | `fix(training): contrato de clasificación single y multi-etiqueta` | 1, 2 |
| 5 | `fix(training): arrays con ventaneo para los 6 backends de series` | 1, 2 |
| 6 | `fix(training): dataset tabular, instalación de sklearn y empaquetado` | 1 |
| 7 | `fix(training): artefactos, export y métricas por backend` | 4, 5, 6 |
| 8 | `refactor(training): retirar OpenMMLab y Detectron2` | 2 |
| 9 | `feat(training): backends HF de detección, instancia y pose` | 8 |
| 10 | `refactor(cloud): generar el script del backend elegido, no YOLO fijo` | 9 |
| 11 | `fix(cloud): rutas, descompresión, progreso en vivo y descarga uniforme` | 10 |
| 12 | `fix(automation): inyectar la configuración real del usuario` | 10 |
| 13 | `fix(ui): estado de instalación, gating de botones y locales` | 9 |
| 14 | `docs(training): estado final del sistema de entrenamiento` | todo |

## Riesgos conocidos

- **Sin GPU local**: los smoke tests validan que el pipeline corre y aprende algo, no el
  rendimiento ni rutas CUDA/AMP. Las rutas `device="0"` de la nube quedan verificadas sólo
  por revisión, hasta que haya una corrida real en Kaggle (gratis, con GPU) — vale hacer
  una al cerrar la Fase 4.
- **Disponibilidad de modelos HF**: los ids exactos de ViTPose/Mask2Former se fijan al
  instalar `transformers` y comprobar la versión; si alguna familia no está soportada en la
  versión instalada, el respaldo es la cabeza propia sobre backbone `timm` (§3.4).
- **`rfdetr`**: es el único backend 🟡 cuyo contrato coincide pero cuya API no se revisó a
  fondo. Entra igual al smoke test; si su API cambió, se corrige ahí.
- **Tamaño de la Fase 3**: son ~1900 líneas fuera y ~1200 nuevas. Se hace después del
  arnés de pruebas a propósito, para que los backends nuevos nazcan verificados.
