# Fase 1 — Auditoría del estado actual frente a los cuatro pilares biomédicos

> Entrega de la **Fase 1** del prompt `docs/prompt-annotix-biomedico.md`.
> Diagnóstico sobre el código en `main` (v2.10.2). No se modificó código.
> Todo lo afirmado abajo se apoya en archivos y líneas concretas; lo que no se
> pudo verificar leyendo el repositorio está marcado como
> **no verificable con la información actual**.

---

## 1. Inventario de los 23 tipos de proyecto

`ProjectType` en `src/lib/db.ts:35-59` define 23 tipos. Ninguno es un tipo
*médico*: son tipos de **tarea de anotación**, agnósticos de dominio. El roce con
lo médico hoy es solo documental (textos de ayuda) o de configuración accesoria
(calidad de imagen), nunca estructural.

| # | ProjectType | Task backend | Roce con flujo médico hoy | Evidencia |
|---|---|---|---|---|
| 1 | `bbox` | `detect` | Solo indirecto: preset de entrenamiento `medical` (lesiones/células) | `presets.ts:215` |
| 2 | `mask` | `segment` | Texto de ayuda: "regiones tumorales en resonancias" | `es/projectDetail.json:16,19` |
| 3 | `polygon` | `instance_segment` | Ninguno explícito | — |
| 4 | `keypoints` | `pose` | Texto de ayuda: goniometría en fisioterapia | `es/projectDetail.json:35` |
| 5 | `landmarks` | `landmarks` | Texto de ayuda: conteo de núcleos celulares en microscopía | `es/projectDetail.json:39,43` |
| 6 | `obb` | `obb` | Ninguno explícito | — |
| 7 | `classification` | `classify` | Ninguno explícito (candidato natural a rayos X de tórax) | — |
| 8 | `multi-label-classification` | `multi_classify` | Ninguno explícito (es el tipo que corresponde a CheXpert) | — |
| 9 | `instance-segmentation` | `instance_segment` | Ninguno explícito | — |
| 10 | `timeseries-classification` | `ts_classify` | Sí, documental: "Diagnóstico médico… clasificación de ECG" | `es/project.json:249` |
| 11 | `timeseries-forecasting` | `ts_forecast` | Ninguno explícito | — |
| 12 | `anomaly-detection` | `ts_anomaly` | Ninguno explícito | — |
| 13 | `timeseries-segmentation` | `ts_segment` | Sí, documental: estadificación de sueño sobre EEG | `es/projectDetail.json:131` |
| 14 | `pattern-recognition` | `ts_pattern` | Sí, documental: patrones de latido en Holter 24 h | `es/projectDetail.json:136,139` |
| 15 | `event-detection` | `ts_event` | Ninguno explícito | — |
| 16 | `timeseries-regression` | `ts_regress` | Ninguno explícito | — |
| 17 | `clustering` | `ts_cluster` | Ninguno explícito | — |
| 18 | `imputation` | `ts_impute` | Ninguno explícito | — |
| 19 | `tabular` | `tabular` | Ninguno explícito (candidato a variables clínicas) | — |
| 20 | `audio-classification` | — (futuro) | Ninguno | — |
| 21 | `speech-recognition` | — (futuro) | Ninguno | — |
| 22 | `sound-event-detection` | — (futuro) | Ninguno | — |
| 23 | `tts-recording` | — (futuro) | Ninguno | — |

Nota: `docs/project_types_architecture.md` (tabla §1) va una versión atrasada —
lista 21 tipos y omite `tabular` y `tts-recording`. Es el único desfase de
documentación encontrado en esta auditoría.

Lo único *transversalmente* biomédico ya implementado, fuera de textos:

- **Aviso de compresión con pérdida**: `webpMedicalWarning` obliga a elegir
  WebP sin pérdida para "radiografías, microscopía o imágenes médicas críticas"
  (`es/project.json:566-578`, campos `imageFormat`/`webpQualityPreset` en
  `store/project_file.rs:49-57`). Es el único punto del producto que reconoce
  que la fidelidad del píxel es un requisito clínico.
- **Preset de entrenamiento `medical`** (`presets.ts:215-266`): solo
  hiperparámetros YOLO, sin modelo biomédico ni validaciones.

---

## 2. Modelo de datos: identificador de sujeto y partición

### 2.1 No existe identificador de sujeto/paciente — en ningún nivel

`grep -rni "patient|paciente|subject_id|subjectId|sujeto|cohort"` sobre `src/` y
`src-tauri/src/` no devuelve **ningún** resultado. Revisando el esquema completo
en `store/project_file.rs`:

- `ImageEntry` (l. 105-137): `id`, `name`, `file`, `width/height`, `uploaded`,
  `annotated`, `status`, `annotations`, `videoId`, `frameIndex`, `isBackground`,
  `lockedBy`, `lockExpires`, `downloadStatus`, `predictions`. **Sin sujeto.**
- `TimeSeriesEntry` (l. 175-208), `VideoEntry` (l. 226-244),
  `TabularDataEntry` (l. 363-376): **sin sujeto**.
- Lo más parecido en todo el esquema es `AudioEntry.speaker_id`
  (`project_file.rs` l. 300, `Option<String>`), que existe para separar
  locutores en ASR/TTS. Es el único precedente de "entidad que agrupa muestras",
  y está en la rama de audio, que todavía no entrena.

Tampoco hay metadata libre por imagen donde meterlo sin cambiar el esquema: no
existe un campo `meta: Value` ni etiquetas arbitrarias en `ImageEntry`. El único
agrupador presente es `videoId` + `frameIndex` (fotogramas del mismo video) y
`ProjectFile.folder`, que es una carpeta de la UI para ordenar **proyectos**, no
muestras.

### 2.2 El split es por ítem, aleatorio y sin ninguna noción de grupo

`src-tauri/src/training/dataset.rs`:

- `compute_split(total, val_split, test_split)` (l. 94-126): reparte por conteo,
  garantizando `val ≥ 1` y `test ≥ 1` si `test_split > 0`.
- `split_plan(project, total, val_split, test_split)` (l. 155-176): baraja los
  **índices de imagen** con una semilla derivada del `project.id`
  (`seed = fold(42, |acc,b| acc*31 + b)`), y corta en tres tramos. El barajado es
  determinista — dos entrenamientos del mismo proyecto dan el mismo reparto, lo
  cual es bueno para reproducibilidad — pero **no agrupa por nada**.
- Elegibilidad de la muestra: `dataset.rs:73` descarta imágenes sin anotaciones
  salvo que estén marcadas `isBackground`. No hay más filtros.
- `valSplit` por defecto 0.2 y `testSplit` 0 (`presets.ts` → `getDefaultConfig`),
  es decir **el flujo por defecto no produce conjunto de test**.

Consecuencia medible hoy, ya sin hablar de pacientes: los fotogramas extraídos
de un mismo video (`videoId`, `frameIndex`) se reparten entre train, val y test.
`grep -n "video_id|videoId" src-tauri/src/training/dataset.rs` → sin resultados.
Un track consolidado de 200 fotogramas casi idénticos contamina val con
imágenes vecinas a las de train. Es exactamente la fuga que produciría el
mismo sujeto en dos particiones, y **ya está ocurriendo** en proyectos de video.

---

## 3. Anotación multievaluador

Existe colaboración (P2P sobre iroh), pero está diseñada para **repartir**
trabajo, que es lo contrario de duplicarlo para medir acuerdo.

- **Roles**: `PeerRole::{LeadResearcher, Annotator, DataCurator}`
  (`p2p/mod.rs:55-64`). Hay jerarquía, no hay rol "adjudicador".
- **Reglas de sesión** (`p2p/mod.rs:96-121`): `lockMode`, `canUpload`,
  `canEditClasses`, `canDelete`, `canExport`, `requireDataApproval`. Nada sobre
  cegamiento, réplica, ni número de lecturas por muestra.
- **Exclusión mutua explícita**: `p2p/locks.rs` toma un lock por imagen con TTL
  de 3 min (`LOCK_TTL_MS`), renovado cada minuto; `ImageEntry.lockedBy` /
  `lockExpires` lo persisten. Mientras un anotador tiene la imagen, nadie más la
  anota.
- **Reparto disjunto**: `p2p/distribution.rs` → `distribute_work` "distribuye
  trabajo equitativamente entre todos los peers", videos como unidades
  indivisibles, y al redistribuir solo toca "los items nuevos (no asignados)".
  Cada ítem termina con **un** responsable.
- **Sin cegamiento**: las anotaciones se publican al documento compartido
  (`sync_annotations_to_doc`, `sync.rs:1373-1402`) y el watcher las baja a todos
  los peers. Cada anotador ve lo que hicieron los demás.
- **Una sola capa de etiquetas por muestra**: la clave del documento es
  `images/{id}/annots` y lleva la **lista completa** de anotaciones de la imagen.
  Al leer (`doc_to_project_metadata`, `sync.rs:479-500` y l. 640-660) los campos
  se acumulan en un `HashMap<img_id, HashMap<field, bytes>>`: la última entrada
  del stream gana y `project.json` queda con **un** conjunto de anotaciones.
  Matiz útil para el roadmap: el sustrato iroh sí guarda una entrada por autor
  (`doc.set_bytes(session.author_id, …)`), así que la información por evaluador
  existe en el documento y se pierde solo al colapsarla en la lectura.
- **Sin métricas de acuerdo**: `grep -rni "kappa|bland|agreement|acuerdo|
  inter.rater|consenso|consensus|adjudicat"` sobre `src/` y `src-tauri/src/`
  devuelve un único acierto, y es un comentario en
  `src/features/study/configChange.ts:11`. `Dice` aparece solo como función de
  pérdida de entrenamiento (`BackendConfigPanel.tsx:72-73`,
  `useTrainingRequest.ts:121`), nunca como métrica entre anotadores.

Resumen: cegamiento **no**, adjudicación **no**, acuerdo **no**. Lo que hay es
distribución de carga con bloqueo y un flujo de aprobación de *datos subidos*
(`requireDataApproval`, `submit_data_for_approval`/`approve_data`/`reject_data`
en `sync.rs:978-1082`), que revisa **material entrante**, no etiquetas.

---

## 4. Trazabilidad y procedencia de las etiquetas

### 4.1 Lo que existe hoy

En `AnnotationEntry` (`store/project_file.rs:139-172`):

| Campo | Qué dice | Límite |
|---|---|---|
| `source` | `"user"` (default), `"ai"`, `"track"` | Tres valores, sin subtipos |
| `confidence` | confianza del modelo | solo cuando `source="ai"` |
| `modelClassName` | nombre de clase del modelo | no identifica **qué** modelo |
| `createdBy` | nombre de display del peer | **solo en sesiones P2P** |
| `trackId` | track de video de origen | permite reconsolidar sin pisar lo manual |

En video (`TrackEntry`, `KeyframeEntry`, l. 246-292): `isKeyframe` distingue el
fotograma **fijado** del **interpolado**, `interpolation` (`linear`/`ease`/
`smooth`) y `extend` (`none`/`after`/`both`) documentan cómo se rellenó el
hueco. Esa parte del esquema del prompt es real y está persistida.

En inferencia: `PredictionEntry.status` ∈ `pending` | `accepted` | `rejected`
(l. 485) es el único lugar del sistema donde una sugerencia de modelo tiene un
veredicto humano explícito.

### 4.2 Los huecos, con precisión

1. **"Revisada" no está persistida en ninguna modalidad.** El prompt la asume
   parte del esquema de video; en el código el conteo de fotogramas revisados
   vive en memoria de sesión del modo estudio
   (`src/features/study/videoStudy.ts:26-32`, `n_frames_reviewed` y
   `n_frames_interpolated_unreviewed` en l. 83-90) y nunca se escribe a
   `project.json`. Cerrar la app borra qué se revisó.
2. **Aceptar una predicción borra su origen.** En
   `store/inference.rs:319-346`, una predicción aceptada se convierte en
   `AnnotationEntry` con `source: "user"` — literal en l. 337 — conservando
   `confidence` y `modelClassName` pero perdiendo el `model_id`. Una etiqueta
   sugerida por un modelo y aceptada sin cambios queda indistinguible de una
   trazada a mano. Las predicciones convertidas se eliminan del historial
   (`img.predictions.retain(|p| p.status != "accepted")`, l. 350), así que
   tampoco queda el rastro de la sugerencia original.
3. **Sin marcas de tiempo por etiqueta.** `AnnotationEntry` no tiene `created` ni
   `updated`; lo único temporal es `ImageEntry.annotated`, un timestamp por
   imagen que se sobrescribe. No se puede reconstruir el orden ni la duración de
   una lectura.
4. **Sin autoría fuera de P2P.** `createdBy` queda `None` en trabajo local
   (`inference.rs:338`, y todas las inserciones locales). En un proyecto de un
   solo usuario no hay identidad registrada en el dato.
5. **Sin distinción corregida vs. aceptada vs. rechazada.** Editar la geometría
   de una anotación heredada de un modelo o de otro evaluador no deja rastro: se
   muta el mismo registro.
6. **La exportación descarta casi toda la procedencia.** Solo `tix.rs:71`
   escribe `"source": ann.source`. COCO (`export/coco.rs`), YOLO, Pascal VOC y
   los CSV no emiten `source`, `confidence`, `createdBy` ni `trackId`
   (`grep -n "created_by|source|confidence" src-tauri/src/export/coco.rs` → sin
   resultados). El dataset que sale del sistema no sabe de dónde vino cada caja.
7. **Series temporales sin procedencia alguna.** `TsAnnotationEntry`
   (l. 213-221) tiene `id`, `type`, `classId`, `data`. Ni `source` ni autor.
   Igual para `AudioSegment` / `AudioEvent` (l. 322-345).

### 4.3 Infraestructura reutilizable ya construida

El **modo estudio** (`src-tauri/src/study/`, `docs/study-mode.md`) tiene la
maquinaria de auditoría que el pilar 3 necesita: JSONL solo-anexado, un archivo
por sesión, `prev_hash` = SHA-256 de la línea previa encadenando el registro
(`study/log.rs:22,327,397`), verificador (`study/verify.rs`), recuperación de
sesiones muertas con `session.end` / `crash_recovered`, y un test normativo que
falla si el código emite un evento no documentado.

Pero **por diseño no sirve como procedencia de etiquetas**: no registra rutas,
ni nombres, ni identificadores en claro (los ids de trayectoria viajan
hasheados), y el escritor rechaza cualquier texto con `/`, `\` o de más de 128
caracteres. Es telemetría de proceso, anónima a propósito. Lo aprovechable es el
**mecanismo** (cadena de hash + solo-anexado + verificador + test normativo), no
el registro.

---

## 5. Flujo de entrenamiento actual

Secuencia real hoy (`src/features/training/components/TrainingSetup.tsx`,
`BackendSelector.tsx`, `BackendModelSelector.tsx`, `TrainingPresets.tsx`):

**tipo de proyecto → tarea (implícita) → backend → modelo → preset/parámetros →
ejecución (local o nube)**

- **Tarea implícita**: `projectTypeToTask` (`utils/modelMapping.ts:2-23` en el
  front, `training/backends.rs → project_type_to_task` en el back). El usuario no
  elige tarea: la fija el tipo de proyecto. No hay ningún paso previo de
  "dominio".
- **17 backends** (`TrainingBackend`, `training/mod.rs:364-386`): `Yolo`,
  `RtDetr`, `RfDetr`, `Smp`, `HfSegmentation`, `HfDetection`, `HfInstance`,
  `HfPose`, `Timm`, `HfClassification`, `Tsai`, `PytorchForecasting`, `Pyod`,
  `Tslearn`, `Pypots`, `Stumpy`, `Sklearn`. OpenMMLab y Detectron2 fueron
  retirados (comentario en l. 370-373, historia en `docs/roadmap_train.md`).
- **Catálogo de modelos en `training/backends.rs`**: YOLO v5u→26, RT-DETR /
  RT-DETRv2, RF-DETR Nano→Large, U-Net/U-Net++/MA-Net/LinkNet/FPN con encoders
  ResNet, ViT/ConvNeXt/Swin/DeiT/BEiT para clasificación, InceptionTime/PatchTST/
  ROCKET/… para series, TFT/N-BEATS/NHiTS/DeepAR para forecasting, PyOD, tslearn,
  PyPOTS, STUMPY y 20 estimadores sklearn/XGBoost/LightGBM. **Todos los pesos
  preentrenados son generalistas** (ImageNet / COCO). `grep -rni "monai|nnunet|
  cellpose|stardist|medsam|biomedclip|radimagenet|retfound|chexnet|
  torchxrayvision|totalsegmentator|micro.sam|hipt|ctranspath"` sobre `src/` y
  `src-tauri/src/` → **cero aciertos**; solo aparecen dentro del propio prompt.
- **Presets de escenario: 6, y solo para YOLO.** `SCENARIO_PRESETS`
  (`utils/presets.ts:5-318`): `small_objects`, `industrial`, `traffic`,
  `edge_mobile`, `medical`, `aerial`. Su `config` es
  `Omit<TrainingConfig, …>` — hiperparámetros de ultralytics (`box`, `cls`,
  `dfl`, `close_mosaic`, `mosaic`, `mixup`, `hsv_*`, `copy_paste`…). Para los
  otros 16 backends no hay presets de escenario: solo
  `BACKEND_DEFAULTS` (`presets.ts:367-393`) con cinco números
  (`epochs`, `batchSize`, `imageSize`, `lr`, `patience`).
- **El preset `medical` que ya existe** (`presets.ts:215-266`, i18n
  `es/training.json:61-62`: "Lesiones, células, alta precisión. LR conservador,
  freeze alto."): `epochs 500`, `batch 8`, `imgsz 640`, `lr0 0.005`,
  `patience 80`, `freeze 12`, `mosaic 0.3`, `mixup 0.1`, `degrees 15`,
  `flipud 0.5`, `fliplr 0.5`, `copy_paste 0`. Es una plantilla de
  hiperparámetros razonable para microscopía, y **anatómicamente incorrecta**
  para radiografía o corte axial: `flipud 0.5` + `fliplr 0.5` invierte
  lateralidad (izquierda/derecha, situs) y `degrees 15` rota la referencia
  anatómica. No distingue modalidad, y no impone ninguna validación previa.
- **Contrato dataset↔script**: `training/contract.rs` obliga a que el preparador
  *declare* cada ruta que escribe y el generador solo pida claves declaradas.
  Resolvió el mismatch que rompía 13 de 19 backends. Ojo con el nombre: **no** es
  un contrato de modelo clínico, es un contrato interno de rutas.

---

## 6. Exportación y despliegue

- **Datasets**: 19 formatos en `formatMapping.ts` (`yolo-detection`,
  `yolo-segmentation`, `coco`, `tix`, `pascal-voc`, `csv-*`, `folders-by-class`,
  `unet-masks`, `preview-rasterized*`, `huggingface-asr`, `ljspeech`,
  `timeseries-csv/json`), despachados en `src-tauri/src/export/mod.rs:433-465`.
- **Modelos**: `training/model_export.rs` → ONNX / TorchScript / TensorRT /
  CoreML / TFLite / OpenVINO vía ultralytics; para el resto de backends el
  script de entrenamiento ya escribe el ONNX y aquí solo se localiza.
  `exported_artifact_is_valid` comprueba existencia, tamaño y extensión.
- **Paquete de entrenamiento reproducible**: `training/package.rs` arma el
  paquete (dataset + script + `README.md`, l. 138-148) que también ejecuta la
  nube; `training/notebook.rs` genera notebook y README con métricas.
- **Informe PDF**: `src/features/training/services/trainingReportService.ts`
  (365 líneas) produce el artefacto más cercano a un contrato de modelo:
  proyecto, backend, modelo y tamaño, inicio/fin/duración, métricas finales
  (mAP50, mAP50-95, precision, recall, mIoU, accuracy, F1, mask AP, keypoint AP,
  losses, MAE, RMSE, R²), volcado completo de configuración, gráfica de métricas
  por epoch y los artefactos del backend (matriz de confusión, curvas PR/F1,
  distribución de etiquetas, lotes de validación).

Lo que el informe **no** tiene, y que es justamente lo que define un contrato de
modelo clínico:

| Elemento del contrato | Estado |
|---|---|
| Población de entrenamiento (nº de sujetos, demografía, sitios, equipos) | Ausente — el dato no existe en el esquema |
| Criterios de inclusión/exclusión | Ausente |
| Intervalos de confianza sobre las métricas | Ausente — se reportan valores puntuales |
| Métricas sobre test independiente | Parcial — `TrainingJobEntry.testMetrics` existe, pero `testSplit` es 0 por defecto |
| Uso previsto y límites de uso | Ausente |
| Versión del pipeline / entorno | Parcial — config y backend sí; versión de app y de dependencias Python, **no verificable con la información actual** en el PDF |
| Procedencia del ground truth y acuerdo entre evaluadores | Ausente (no existe la medición, §3) |
| Integridad verificable del informe | Ausente — el PDF no va firmado ni encadenado, aunque `study/log.rs` ya sabe encadenar |

---

## 7. Brechas frente a los cuatro pilares

| Pilar | Estado actual | Brecha | Archivos o módulos involucrados |
|---|---|---|---|
| **1. Construcción de patrones de referencia** (multievaluador cegado, adjudicación, acuerdo) | Colaboración P2P con roles (`LeadResearcher`/`Annotator`/`DataCurator`), lock por imagen con TTL 3 min, reparto **disjunto** del trabajo, aprobación de datos entrantes. Una sola capa de etiquetas por muestra tras colapsar la lectura del doc. | Falta todo el pilar y además **el diseño actual lo impide**: el lock excluye la doble lectura y la distribución evita el solapamiento. Sin cegamiento (las anotaciones se sincronizan a todos), sin cola de discrepancias, sin adjudicación, sin κ / Dice / Bland-Altman (cero aciertos en el grep; `Dice` solo como pérdida). **Mitigante**: iroh ya guarda una entrada por autor, la información por evaluador se pierde al colapsar en la lectura. | `p2p/mod.rs:55-121`, `p2p/locks.rs`, `p2p/distribution.rs`, `p2p/sync.rs:479-500,640-660,1373-1402`, `store/project_file.rs:105-172` |
| **2. Partición y análisis a nivel de sujeto** | Sujeto **inexistente** en todo el esquema (grep sin aciertos; único precedente: `AudioEntry.speaker_id`). Split por ítem, barajado determinista sembrado con `project.id`, `valSplit` 0.2 y `testSplit` **0** por defecto. | Falta el campo de sujeto y el agrupamiento en el split. Fuga ya presente hoy sin hablar de pacientes: los fotogramas de un mismo video caen en particiones distintas (`dataset.rs` no conoce `videoId`). Sin test por defecto no hay evaluación independiente que reportar. Sin sujeto no hay forma de describir la población en el contrato (pilar 4). | `store/project_file.rs:105-137,175-208,226-244,363-376`, `training/dataset.rs:73,94-126,155-176`, `presets.ts` → `getDefaultConfig` |
| **3. Procedencia generalizada de cada etiqueta** | Imagen: `source` (`user`/`ai`/`track`), `confidence`, `modelClassName`, `createdBy` (solo P2P), `trackId`. Video: `isKeyframe` (fijada) + `interpolation` + `extend` (interpolada). Inferencia: `PredictionEntry.status` `pending`/`accepted`/`rejected`. | "Revisada" no se persiste en ninguna modalidad (vive en memoria de sesión del modo estudio). Aceptar una predicción la reescribe como `source: "user"` y borra el `model_id` y la predicción original. Sin timestamp por etiqueta, sin autoría fuera de P2P, sin distinguir corregida/aceptada/rechazada. Series temporales y audio sin ningún campo de procedencia. La exportación la descarta salvo `source` en `.tix`. | `store/project_file.rs:139-172,213-221,246-292,322-345,477-489`, `store/inference.rs:278,319-350`, `src/features/study/videoStudy.ts:26-90`, `export/tix.rs:71`, `export/coco.rs`, `export/yolo.rs` |
| **4. Contrato de modelo hacia despliegue clínico** | Informe PDF con métricas finales, config completa, curvas por epoch y artefactos del backend; exportación a 6 formatos con validación del artefacto; paquete reproducible (dataset + script + README) reutilizado por la nube. `testMetrics` persistido cuando se evalúa test. | El informe es técnico, no clínico: sin población, sin criterios de inclusión/exclusión, sin intervalos de confianza, sin uso previsto ni límites, sin procedencia del ground truth ni acuerdo entre evaluadores, sin integridad verificable. Los pilares 1-3 son su precondición: el contrato no puede autogenerarse mientras los datos que debe declarar no existan. Cuidado con el nombre `training/contract.rs`: es el contrato interno dataset↔script, no este. | `src/features/training/services/trainingReportService.ts`, `training/model_export.rs`, `training/package.rs:138-148`, `training/notebook.rs:477-482,702-745`, `store/project_file.rs:391-437`, `training/contract.rs` |

### Hallazgos transversales fuera de los cuatro pilares

Dos brechas que no pertenecen a ningún pilar pero condicionan cualquier uso
biomédico real del producto:

1. **Sin soporte de formatos de imagen médica.**
   `grep -rni "dicom|nifti|\.nii|pydicom|openslide|whole.slide|wsi|svs"` sobre
   `src/`, `src-tauri/src/` y `docs/` → cero aciertos. No hay lectura de DICOM ni
   NIfTI, ni metadatos de adquisición, ni ventaneo (window/level), ni soporte de
   whole-slide gigapíxel. El sistema ingiere JPG/WebP
   (`project_file.rs:49-57`), con un aviso textual de que lo con pérdida
   descarta información. Tres presets del catálogo del prompt (nnU-Net,
   TotalSegmentator: CT/MRI; HIPT, CTransPath, UNI: WSI) son inalcanzables sin
   esto.
2. **Sin volumetría 3D.** El esquema es 2D puro (`width`/`height` en
   `ImageEntry`); no hay eje Z, espaciado de vóxel ni series de cortes. nnU-Net
   3D y buena parte de MONAI quedan fuera de alcance mientras eso siga así.

### Nota de arquitectura sobre SAM (relevante para la Fase 2)

La asistencia SAM ya implementada usa **AMG**: encode, grilla de puntos, decoder
en lote, filtrado y NMS, con los candidatos efímeros que nunca se persisten en
`project.json` (`docs/roadmap_sam.md`, `src-tauri/src/inference/sam/amg.rs`,
`sam/state.rs`). Los modelos son ONNX aportados por el usuario, guardados a
nivel de aplicación en `{data_dir}/sam_models/`, no por proyecto. MedSAM y μSAM
encajan en este camino sin cambio de arquitectura (mismo par encoder/decoder).
SAM3, que predice instancias directamente al estilo DETR, **no** encaja: exige
otro camino de inferencia, no otros pesos. Es un punto de no retorno a declarar
en la Fase 2.

---

## Puntos marcados como no verificables con la información actual

- Si el informe PDF incluye la versión de la aplicación y de las dependencias
  Python: no se encontró en `trainingReportService.ts`, pero el volcado de
  `config` es dinámico y podría arrastrarlas según lo que el backend inyecte.
- Si el paquete de entrenamiento de la nube fija versiones exactas de
  dependencias (relevante para "versión del pipeline" del contrato): requiere
  leer `training/cloud/` y los generadores de `scripts.rs`, fuera del alcance de
  esta pasada.
- Comportamiento real del colapso multi-autor de iroh cuando dos peers escriben
  `images/{id}/annots` en la misma ventana: el código de lectura hace que gane
  la última entrada del stream, pero el orden del stream de `get_many` no se
  verificó empíricamente.
