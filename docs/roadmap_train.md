# Auditoría del sistema de entrenamiento — qué funciona y qué no

Fecha: 2026-09-12. Método: lectura estática del código (`src-tauri/src/training/**`,
`src-tauri/src/commands/training_commands.rs`, `src/features/training/**`) cruzando,
para cada backend, **lo que el preparador de dataset escribe en disco** contra **lo que
el script Python generado intenta leer**. No se ejecutó ningún entrenamiento real: los
fallos marcados como *roto* son mismatches verificables leyendo ambos lados, no
sospechas.

---

## 0. Verificado con corridas reales (2026-09-12)

La auditoría de abajo se hizo leyendo código. Después se construyó el arnés
(`scripts/train_smoke.sh` + `src-tauri/src/training/smoke_tests.rs`), que prepara un
proyecto sintético y **entrena de verdad** 2 épocas en CPU. Eso confirmó lo leído y
destapó ocho bugs más que ninguna lectura habría encontrado, todos ya corregidos:

| Backend | Fallo real | Estado |
|---|---|---|
| `yolo` (classify) | Recibía el `data.yaml`; ultralytics exige un **directorio** en clasificación ("Classification datasets must be a directory"). La clasificación con YOLO nunca pudo entrenar | ✅ `ultralytics_data_arg` |
| `sklearn` | `target_column` no lo setea **ninguna** UI (queda `''` en `useTrainingRequest`): fallaba siempre con "Target column '' not found" | ✅ los metadatos del CSV viajan con el dataset (`tabular_meta.json`) |
| `sklearn` | Emitía `{"type":"progress", "total_epochs":…}`, que el runner descarta: la UI no mostraba avance | ✅ emite el evento canónico `epoch`/`totalEpochs` |
| `hf_segmentation`, `hf_classification` | `accelerate` no estaba en los requirements y el `Trainer` lo exige: abortaba con el modelo ya cargado | ✅ añadido a requirements e instalador |
| `hf_segmentation`, `hf_classification` | `warmup_ratio` y `evaluation_strategy` no existen en transformers 5 (`TypeError` al construir `TrainingArguments`) | ✅ adaptador que traduce según la versión instalada |
| `smp`, `timm` | Con un lote final de una sola muestra, BatchNorm aborta ("Expected more than 1 value per channel") | ✅ `drop_last` cuando el set lo permite |
| `rf_detr` | El catálogo recomendaba `RFDETRBase`, deprecado desde rfdetr 1.7, y ofrecía `RFDETRBaseSeg`, que no existe en la librería | ✅ recomendado `RFDETRMedium`; segmentación con las clases `RFDETRSeg*` reales |
| `rf_detr` | Faltaba el extra `[train]` (pytorch-lightning): abortaba tras descargar 386 MB de pesos | ✅ `rfdetr[train]` |
| `rf_detr` | `resolution` por defecto 560, que no es múltiplo de 32 y la librería rechaza; y `resolution`/`gradient_checkpointing` se pasaban a `train()` cuando son del constructor | ✅ 576 por defecto, ajuste automático y argumentos en su sitio |
| `rf_detr` | No se pasaba `output_dir`: los checkpoints caían en el directorio de trabajo | ✅ |

El mínimo de resolución por backend (`backends::min_image_size`) lo valida el runner
y lo publica el catálogo, así que la UI ya no deja pedirle 64 px a RT-DETR, que
abortaba con `RuntimeError: selected index k out of range`.

### Lo que salió al arreglar clasificación, series y el reemplazo de OpenMMLab

| Backend | Fallo real | Estado |
|---|---|---|
| `timm`, `hf_classification` | El layout ImageFolder se leía con `int(nombre_carpeta)`: **todas** las imágenes quedaban en la clase 0, sin error | ✅ `labels_{split}.json` con el índice real |
| `timm`, `hf_classification` | Multi-etiqueta usaba CrossEntropy y argmax, que no significan nada ahí | ✅ BCE + métricas por umbral |
| Los 6 de series | Cargaban `.npy` que nadie generaba | ✅ `prepare_timeseries_arrays` con ventaneo, etiquetado por tarea y normalización |
| `pyod`, `pypots`, `tslearn`, `pytorch_forecasting`, `stumpy` | Los ids del catálogo (`pyod-iforest`) no coincidían con lo que comparaba el script (`IForest`): **elegir modelo en la UI no tenía efecto**, todos entrenaban el del `else` | ✅ normalización del id en el dispatch |
| `tsai` | `from tsai.all import …` falla con fastcore nuevo; y las métricas como string revientan en el Recorder de fastai | ✅ `tsai.basics` + métricas invocables |
| `pyod` | `epochs` pasó a ser `epoch_num` en pyod 2+ | ✅ filtro de kwargs por versión |
| `pypots` | El lr va en el optimizador; `patience` debe ser menor que `epochs`; y `save()` añade extensión, así que la ruta reportada no existía | ✅ |
| `pypots` | Recibía (ventanas, canales, pasos) donde espera (ventanas, pasos, variables) | ✅ transposición explícita |
| `tslearn` | `silhouette_score` está en `clustering`, no en `metrics` | ✅ |
| `tslearn` | Emitía `inertia: Infinity`, que **no es JSON válido**: el runner descartaba el evento completo | ✅ métricas no finitas a `null` |
| `pytorch_forecasting` | Trainer de `pytorch_lightning` con modelos de `lightning.pytorch`; y las longitudes por defecto no caben en series cortas | ✅ |
| `stumpy` | Exige float64 y recibía float32 | ✅ |
| COCO keypoints | El exportador leía un `keypoints: [x,y,v,…]` plano que la app nunca escribe (guarda `points: [{x,y,visible}]`): el dataset de pose salía **vacío** | ✅ usa `parse_keypoints` |
| **Runner** | Buscaba `ANNOTIX_EVENT:` sólo al inicio de línea, y fastai/tqdm lo dejan pegado a la barra de progreso: el progreso de esos backends no llegaba nunca a la UI | ✅ se busca en cualquier posición |

Estado del smoke hoy: **23 tests en verde**, uno por backend y tarea, incluidos los
tres HuggingFace nuevos que reemplazan a OpenMMLab y Detectron2.

---

## 1. Resumen ejecutivo

19 backends declarados en `TrainingBackend`. Estado real:

| Backend | Local | Causa |
|---|---|---|
| `yolo` | ✅ funciona | ruta principal, madura |
| `rt_detr` | ✅ funciona | ultralytics `RTDETR`, mismo dataset YOLO |
| `rf_detr` | 🟡 probable | layout COCO `train/valid/_annotations.coco.json` coincide; API `rfdetr` sin verificar |
| `smp` | 🟡 probable | contrato `images/{split}` + `masks/{split}` + `classes.txt` coincide |
| `hf_segmentation` | 🟡 probable | mismo contrato de máscaras, coincide |
| `sklearn` | 🟡 probable | el runner copia `data.csv`; el script glob-ea `*.csv`. Pero no se puede instalar desde la UI (§5.3) |
| `mmdetection` (detect) | ❌ roto | config sin `model=` (§3.1) |
| `mmdetection` (instance) | ❌ roto | config sin `model=` + dataset sin máscaras (§3.1, §3.2) |
| `mmsegmentation` | ❌ roto | config sin `model=` ni `METAINFO` |
| `mmpose` | ❌ roto | config sin `model=` |
| `mmrotate` | ❌ roto | config sin `model=` + dataset en formato equivocado (§3.2) |
| `detectron2` | ❌ roto | rutas de dataset no coinciden (§2.2); además `pip install detectron2` no existe en PyPI |
| `timm` | ❌ roto | rutas + etiquetas (§2.1) |
| `hf_classification` | ❌ roto | mismo caso que timm |
| `tsai` | ❌ roto | espera `.npy`, recibe `.csv` (§2.3) |
| `pytorch_forecasting` | ❌ roto | espera `data.csv`, recibe `{id}.csv` |
| `pyod` | ❌ roto | espera `.npy` |
| `tslearn` | ❌ roto | espera `.npy` |
| `pypots` | ❌ roto | espera `.npy` |
| `stumpy` | ❌ roto | espera `timeseries.npy`/`timeseries.csv` |

**Modos de ejecución:**

| Modo | Estado |
|---|---|
| Local | funciona sólo para los backends ✅/🟡 de arriba |
| Descargar paquete (.zip) | genera el zip y los notebooks, pero hereda **todos** los bugs de script; además pierde el CSV en proyectos tabulares (§5.4) |
| Cloud (7 proveedores) | sólo YOLO de facto; varios fallos duros por proveedor (§4) |
| Browser automation (Colab free) | funciona como automatización, pero **ignora toda la configuración del usuario** (§4.4) |

Traducción directa: de 19 backends, **2 sólidos, 4 probables, 13 rotos**. La UI los
ofrece todos por igual, sin marca de experimental.

---

## 2. Contratos dataset ↔ script rotos

El router `dataset::prepare_dataset_for_backend` (`dataset.rs:888`) decide qué se
escribe en disco. `scripts::generate_train_script_for_backend` (`scripts.rs:932`)
genera el Python. Nadie valida que coincidan, y en varios casos no coinciden.

### 2.1 Clasificación (`timm`, `hf_classification`) — doble fallo

Lo que se escribe (`dataset.rs:1313` → `prepare_dataset(task="classify")` → `dataset.rs:204`):

```
{job}/train/{nombre_de_clase}/img.jpg
{job}/val/{nombre_de_clase}/img.jpg
```

Lo que el script lee (`scripts.rs:2630`, `scripts.rs:2863`):

```python
ClassificationDataset(os.path.join(dataset_dir, "images/train"),
                      os.path.join(dataset_dir, "labels_train.json"), ...)
```

1. `images/train` no existe → `Path(images_dir).iterdir()` revienta o el dataset queda vacío.
2. Aunque se arregle la ruta, el fallback por carpetas hace
   `label = int(class_dir.name) if class_dir.name.isdigit() else 0`. Las carpetas llevan
   **nombre de clase**, no id → **todas las imágenes quedarían etiquetadas como clase 0**.
   Este es el peor de los bugs: entrenaría sin error visible y produciría un modelo basura.

Multi-etiqueta: `prepare_multilabel_dataset` (`dataset.rs:1328`) escribe `train.csv`/`val.csv`
con columnas multi-hot; el script sigue pidiendo `labels_train.json` y usa
`nn.CrossEntropyLoss()`, no `BCEWithLogitsLoss`. Doble incompatibilidad.

### 2.2 Detectron2

Escribe (`dataset.rs:1013`): `{job}/train/`, `{job}/val/`, `{job}/annotations/instances_*.json`.
Lee (`scripts.rs:2029`): `{job}/images/train`, `{job}/images/val`.
`register_coco_instances` registra rutas inexistentes → falla al cargar la primera imagen.

Además `cfg.SOLVER.MAX_ITER = {epochs} * 500` (`scripts.rs:2044`): las "épocas" que el
usuario configura no significan nada; 10 épocas = 5000 iteraciones sin importar el tamaño
del dataset.

### 2.3 Series temporales — los 6 backends rotos por lo mismo

`prepare_timeseries_dataset` (`dataset.rs:1413`) escribe **un CSV por serie**
(`{serie_id}.csv`) más `metadata.json` con anotaciones y clases.

Lo que piden los scripts:

| Backend | Línea | Espera |
|---|---|---|
| `tsai` | `scripts.rs:3053` | `X_train.npy`, `y_train.npy`, `X_val.npy`, `y_val.npy` |
| `pytorch_forecasting` | `scripts.rs:3193` | `data.csv` |
| `pyod` | `scripts.rs:3357` | `X_train.npy` |
| `tslearn` | `scripts.rs:3516` | `X_train.npy` |
| `pypots` | `scripts.rs:3643` | `X_train.npy` |
| `stumpy` | `scripts.rs:3829` | `timeseries.npy` o `timeseries.csv` |

Ninguno de esos archivos se genera jamás → `FileNotFoundError` en la primera línea útil.
**Ningún proyecto de series temporales puede entrenar hoy.**

Falta además toda la capa intermedia: ventaneo (`window_size`/`stride` se leen en
`scripts.rs:3020` y se descartan con `_`), conversión de anotaciones de intervalo a
etiquetas por ventana, y normalización.

---

## 3. Configs OpenMMLab: nunca pudieron funcionar

### 3.1 Falta el modelo

Los cuatro generadores (`generate_mmdet_config` `scripts.rs:733`, `generate_mmseg_config`
`scripts.rs:1752`, `generate_mmpose_config` `scripts.rs:2120`, `generate_mmrotate_config`
`scripts.rs:2329`) emiten:

```python
_base_ = []
# Model config (auto-downloaded from mmdet registry)
model_name = "cascade-rcnn_r50_fpn"
```

`model_name` es una variable muerta: no hay `model=dict(...)`, no hay herencia de un
`_base_` real, no hay `default_scope`, no hay `mim download` en el script. El runner hace
`Runner.from_cfg(cfg)` (`scripts.rs:903`) → `KeyError: 'model'` inmediato. El comentario
"auto-downloaded from mmdet registry" describe algo que no está implementado.

Faltan también: `test_pipeline`/`test_dataloader`, `metainfo` con las clases (el config
define `num_classes` al final como variable suelta, que ningún head lee), y en mmseg
`METAINFO` con `classes`/`palette` que `BaseSegDataset` exige.

### 3.2 MMRotate además recibe el dataset equivocado

`dataset.rs:898` rutea `MmRotate` a `prepare_dataset` (formato YOLO txt:
`images/{split}` + `labels/{split}` + `data.yaml`), pero su config pide
`ann_file="annotations/train.json"` con `DOTADataset` — y el catálogo declara
`DatasetFormat::DotaTxt` (`backends.rs:1476`). Tres formatos distintos entre declaración,
preparación y consumo.

MMDetection en modo instancia declara `CocoInstanceJson` (`backends.rs:1281`) pero el
router lo manda a `prepare_coco_dataset` (sólo bbox, sin `segmentation`) → aunque se
arreglara el config, Mask R-CNN entrenaría sin máscaras.

---

## 4. Cloud

### 4.1 Ningún proveedor conocía el backend (resuelto)

`grep -c "request.backend" src-tauri/src/training/cloud/*.rs` → **0**. Los seis
generadores de notebook hardcodean `from ultralytics import YOLO`. Si el usuario elige
SMP, timm o tsai y modo cloud, se le sube su dataset y se lanza un entrenamiento YOLO
(o falla por dataset incompatible). No hay error ni aviso.

### 4.2 Ruta del YAML equivocada en 4 de 7

El paquete generado (`package.rs`) deja `dataset/data.yaml` dentro del zip. Los notebooks
piden `dataset.yaml`:

- `colab.rs:56` → `data="/tmp/dataset/dataset.yaml"`
- `lightning.rs:50` → `os.path.join(DATASET_DIR, "dataset.yaml")`
- `saturn.rs:61` → ídem
- `vertex_custom.rs:60` → `/tmp/dataset/dataset.yaml`

Sólo Kaggle (`kaggle.rs:266`) intenta un fallback, pero lista únicamente el nivel
superior — no entra a `dataset/`, donde está el archivo.

Colab Enterprise tiene un fallo extra: sube un `dataset.zip` y el notebook hace
`!gsutil -m cp -r {gcs_dataset}/* /tmp/dataset/` sobre la URI **del zip**, y nunca
descomprime.

### 4.3 Estado por proveedor

| Proveedor | Submit | Progreso en vivo | Descarga modelo |
|---|---|---|---|
| Kaggle | ✅ API real (crea dataset + kernel) | ✅ único con `fetch_progress` | ✅ zip de output |
| Colab Enterprise | 🟡 API real, pero runtime template hardcodeado `.../notebookRuntimeTemplates/default`, `serviceAccount: ""`, y `machine_type`/`accelerator_*` ignorados (`colab.rs:136`, prefijados con `_`) | ❌ | 🟡 depende de `gcsOutputUri` |
| Vertex AI Custom | 🟡 API real | ❌ | ❌ `model_output_uri` siempre `None` (`vertex_custom.rs:213`) → la descarga siempre da error |
| Vertex AI Gemini Tuning | ❌ **teatro**: `convert_to_jsonl` (`vertex_tuning.rs:185`) ignora el dataset (`_dataset_path`) y fabrica una frase de texto por clase. Se paga un tuning que no ve ni una imagen | ❌ | 🟡 |
| Lightning AI | 🟡 | ❌ | ❌ endpoint `/studios/{id}/artifacts/...` inventado |
| Hugging Face | 🟡 | ❌ | ❌ URL mal formada (`api/models/{repo}/resolve/...`) y usa el `space_id` como repo de modelo |
| Saturn Cloud | 🟡 | ❌ | ❌ |

`fetch_progress` tiene implementación por defecto vacía (`cloud/mod.rs:75`): para los
seis proveedores que no la sobreescriben, la barra de progreso se queda en 0 % y
`metrics_history` vacío hasta que el job termina.

Detalle de portabilidad: rutas `/tmp/...` en el **lado del host** (`colab.rs:120`,
`vertex_tuning.rs:48`) — en Windows no existe `/tmp`, así que Colab Enterprise y Gemini
Tuning fallan al escribir el notebook/JSONL antes de subir nada.

### 4.4 Browser automation (Colab gratis)

La mecánica sí es real: `headless_chrome`, CDP, inyección de celdas, polling de salida,
detección de captcha. Pero `step_training_code` (`colab_free.rs:345`) inyecta código
**literal**:

```python
model = YOLO('yolov8n.pt')
results = model.train(data=yaml_path, epochs=50, imgsz=640, batch=16, device=0, ...)
```

Modelo, épocas, imgsz y batch están hardcodeados: **toda la configuración que el usuario
eligió en el panel se descarta**. Además `upload_dataset` está marcado
`requires_user: false` (`colab_free.rs:78`) cuando en realidad abre el diálogo de
`files.upload()` y espera 300 s a que la persona seleccione el archivo a mano.

---

## 5. Bugs transversales

### 5.1 Exportación sólo YOLO
`export_trained_model` → `model_export::export_model` → `generate_export_script`
(`scripts.rs:398`) hace `YOLO(path).export(...)` siempre. Con un `best.pth` de SMP/timm o
un `.joblib` de sklearn, falla. El botón "Exportar" aparece igual en `TrainingResult`.
(Lo bueno: SMP, HF-seg, timm, HF-cls y sklearn ya exportan ONNX **dentro** de su propio
script, así que la funcionalidad existe — sólo el botón post-hoc está roto.)

### 5.2 Artefactos detectados sólo con nombres de ultralytics
`list_training_jobs` (`training_commands.rs:334`) calcula `hasBest`/`hasLast` buscando
`{result_dir}/weights/best.pt` y `last.pt`. Los backends no-ultralytics guardan
`train_output/best.pth`, `learner.pkl`, `best_model.joblib` → nunca muestran botones de
reanudar, fine-tune ni informe.

### 5.3 `sklearn` no se puede instalar desde la UI
`install_backend_packages` (`training_commands.rs:479`) no tiene rama `"sklearn"` → cae
en `_ => Err("Backend desconocido: sklearn")`. El `TrainingPanel` (línea 203) sí lo
consulta y aborta el arranque. Es decir: el backend tabular sólo funciona si el usuario
ya tenía scikit-learn instalado por otra vía.

`detectron2` pide `pip install detectron2`, paquete que no existe en PyPI (se instala
desde git o wheels por versión de torch/CUDA) → la instalación siempre falla.

### 5.4 Paquete descargable de proyectos tabulares sin datos
`prepare_tabular_dataset` (`dataset.rs:962`) no copia nada: devuelve la ruta y confía en
que el runner copie `data.csv` antes (`runner.rs:200`). `generate_training_package`
(`package.rs:28`) llama al preparador **sin** ese paso → el zip sale sin CSV.

### 5.5 Sin split de test fuera de YOLO
Sólo `prepare_dataset` acepta `test_split`. `prepare_coco_dataset`, `prepare_mask_dataset`,
`prepare_coco_instance_dataset`, `prepare_coco_keypoints_dataset`,
`prepare_multilabel_dataset` y `prepare_timeseries_dataset` reciben únicamente
`val_split`. El campo `testSplit` de la UI se ignora silenciosamente en 17 backends.

### 5.6 `testMetrics` se calcula y se tira
El script YOLO evalúa `best.pt` sobre el split de test y emite `result["testMetrics"]`
(`scripts.rs:172-190`), pero `handle_event` (`runner.rs:711`) sólo lee `finalMetrics`:
`TrainingResult` no tiene campo para test. El cómputo se hace y se descarta.

### 5.7 Métricas de segmentación/pose no llegan al gráfico en vivo
El callback YOLO sólo recoge `metrics/*(B)` (box). Para `segment` faltan `(M)` y para
`pose` `(P)` → en esos proyectos el gráfico muestra únicamente métricas de caja.

### 5.8 Inconsistencias de UI
- `BackendSelector.isInstalled` (`BackendSelector.tsx:52`) sólo contempla 6 backends;
  para detectron2, mmpose, mmrotate, timm, hf_classification, los 6 de series y sklearn
  devuelve siempre `false` → badge "no instalado" permanente aunque lo esté.
- El botón de fine-tune aparece para cualquier backend, pero `handleFineTune`
  (`TrainingPanel.tsx:352`) hace `return` sin avisar si no es `yolo`/`rt_detr`: click sin
  efecto ni mensaje.
- `ExecutionMode::BrowserAutomation` existe en el enum de Rust pero `start_training_v2`
  no lo contempla; si llegara por ahí caería en la rama local. (Hoy la UI lo desvía por
  `automationService`, así que no se dispara — es una rama muerta que conviene cerrar.)

### 5.9 Lo que sí está bien resuelto
Vale registrarlo para no tocarlo:
- `runner.rs` drena stdout **y** stderr en hilos separados (evita el deadlock clásico de
  tqdm llenando el pipe), throttlea logs, persiste cada 2 s y acota RAM.
- `finalize_completed_fallback` evita jobs "training" zombis cuando el evento `completed`
  se pierde.
- `migrate.rs` marca como `failed` los jobs que quedaron en `training` tras un cierre
  abrupto, y recupera pesos de ubicaciones legacy.
- `select_trainable_images` (`dataset.rs:43`) descarta imágenes sin anotar con un razonamiento
  correcto sobre fondos y contaminación del mAP.
- `resume_training` real con `resume=True` sobre `last.pt` + hidratación del historial
  desde `results.csv` — la nota vieja de memoria que decía "resume no implementado" está
  desactualizada.
- Los splits usan un shuffle determinista sembrado con el id del proyecto: reproducible.

---

## 6. Roadmap priorizado

### P0 — dejar de ofrecer lo que no funciona (1 sesión)
Es lo más barato y lo que más daño evita: hoy la app promete 19 backends y 7 nubes.

1. Añadir un campo `status: stable | experimental | broken` a `BackendInfo` y marcar los 13
   rotos. La UI los deshabilita o los esconde tras un toggle "mostrar experimentales".
2. Filtrar los proveedores cloud a los que funcionan de verdad (Kaggle; Colab Enterprise
   y Vertex Custom tras arreglar §4.2). Quitar o marcar Gemini Tuning: hoy cobra sin
   entrenar nada del dataset.
3. Ocultar el botón de export/fine-tune cuando el backend no lo soporta, en vez de
   dejarlo mudo.

### P1 — arreglar los rotos baratos (alto retorno por línea tocada)

4. **Clasificación** (`timm`, `hf_classification`): emitir `labels_train.json` /
   `labels_val.json` con `{filename, label}` desde `prepare_classification_dataset_imagefolder`,
   e indexar clases por posición en `project.classes`. Arregla dos backends y elimina el
   riesgo de entrenar todo como clase 0.
5. **Detectron2**: cambiar `train_dir`/`val_dir` a `images/train`, `images/val` en
   `prepare_coco_instance_dataset` (o la ruta del script; un solo lado). Y derivar
   `MAX_ITER` de `epochs * ceil(n_train / batch)` en vez de `* 500`.
6. **Cloud YAML**: unificar en `data.yaml` y hacer que los notebooks busquen recursivo
   (`glob('**/data.y*ml')`). Arregla Lightning, Saturn, Vertex Custom y el fallback de Kaggle
   de una vez.
7. **Colab Enterprise**: descomprimir el zip en el notebook y subir el objeto como
   `dataset.zip` explícito; pasar `machine_type`/`accelerator_*` al
   `notebookRuntimeTemplate` en vez de ignorarlos.
8. **`install_backend_packages`**: añadir rama `sklearn`; cambiar detectron2 a la URL de
   git oficial o marcarlo como instalación manual con instrucciones.
9. **Paquete tabular**: copiar el CSV dentro de `generate_training_package`.
10. **`testMetrics`**: añadir el campo a `TrainingResult` y persistirlo; ya está calculado.

### P2 — series temporales (bloque grande, 1-2 sesiones)

11. Escribir un `prepare_timeseries_arrays` que produzca `X_train.npy`, `y_train.npy`,
    `X_val.npy`, `y_val.npy` a partir de las series + anotaciones, con ventaneo
    (`window_size`/`stride` ya vienen en `backendParams`) y normalización. Es el 80 % del
    trabajo: cinco de los seis backends consumen exactamente ese contrato.
12. `pytorch_forecasting`: concatenar las series en un `data.csv` largo con columnas
    `series_id, time_idx, target, ...` (es el formato que espera `TimeSeriesDataSet`).
13. `stumpy`: emitir `timeseries.npy` (o adaptar el script al CSV por serie, más simple
    porque stumpy es no supervisado y no necesita splits).

### P3 — OpenMMLab (decisión de producto antes que de código)

14. Decidir: **arreglar o eliminar**. Son 5 backends (mmdet detect + instance, mmseg,
    mmpose, mmrotate) y ~1200 líneas de generador de configs que nunca ejecutaron.
15. Si se arregla, el patrón correcto es no generar el config a mano sino:
    `mim download mmdet --config <model_id> --dest <dir>`, cargar ese config como `_base_`,
    y sobreescribir sólo dataset/schedule/optimizer. Elimina de raíz el problema de
    `model=dict(...)`, del `default_scope` y de los `metainfo`.
16. MMRotate necesita además un exportador DOTA txt real (`x1 y1 x2 y2 x3 y3 x4 y4 clase
    dificultad`) desde las anotaciones OBB; el parser `parse_obb` ya existe en
    `crate::export`.
17. MMDetection instancia necesita `prepare_coco_instance_dataset` (ya existe) en vez de
    `prepare_coco_dataset` en el router.

### P4 — calidad transversal

18. **Test de contrato dataset↔script**: por cada backend, un test que prepare un dataset
    mínimo en tmp y verifique que existen los archivos que el script generado referencia
    (extraer las rutas del Python con un regex sobre `os.path.join(dataset_dir, ...)`).
    Habría cazado 13 de los 13 fallos de esta auditoría.
19. Propagar `test_split` a todos los preparadores.
20. `fetch_progress` para Vertex/Colab (Cloud Logging) y Lightning; hoy sólo Kaggle da
    progreso en vivo.
21. Browser automation: generar el código de la celda desde `TrainingRequest` en vez de
    hardcodearlo, y marcar `upload_dataset` con `requires_user: true`.
22. Métricas `(M)`/`(P)` en el callback de YOLO para segmentación y pose.
23. Exportación post-hoc por backend (dispatch sobre `job.backend`) o eliminar el botón y
    apoyarse en el ONNX que ya emiten los scripts.

---

## 7. Cómo verificar cada arreglo

Un smoke test por backend, con 3-5 imágenes anotadas y 2 épocas, comprobando en orden:

1. `{job}/` contiene los archivos que el `train.py` generado referencia.
2. El proceso Python no muere en los primeros 30 s (descarta mismatch de rutas y de API).
3. Llega al menos un `ANNOTIX_EVENT:{"type":"epoch"}` al log (descarta callback roto).
4. `status` termina en `completed` y `best_model_path` apunta a un archivo que existe.
5. Para clasificación, además: verificar que las etiquetas no son todas 0 (leer el
   `labels_*.json` generado o el log de distribución de clases).

Conviene dejar esto como script en `scripts/` antes de empezar a arreglar: son 19
backends y la regresión es fácil.

---

## Referencias cruzadas

- `docs/training_backends_reference.md` — catálogo de backends y parámetros.
- Memoria `training_recovery_roadmap` — resiliencia/resume (el punto "resume real" ya está hecho).
- Memoria `training_report_roadmap` — informe PDF por backend; sus colectores dependen de
  que los backends efectivamente entrenen, así que va detrás de P1/P2.
