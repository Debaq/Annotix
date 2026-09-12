# Warnings pendientes de lint

Estado tras la pasada de limpieza (commits `0c92c09`, `6c0c1bd`, `8c2fb94`)
y del saneo de `exhaustive-deps` (canvas y anotadores de audio), el tipado de
Konva y los structs de request en Rust.

| Verificador | Errores | Warnings | Nota |
|---|---|---|---|
| `tsc --noEmit` | 0 | — | limpio |
| `cargo check --all-targets` | 0 | — | limpio |
| `cargo fmt --check` | 0 | — | limpio |
| `cargo test --lib` | 0 | — | 114 passed |
| `eslint` | 0 | **56** | techo `--max-warnings 130` |
| `cargo clippy --all-targets` | 0 | **22** | todos `too_many_arguments` |

---

## Rust — clippy (22)

Todos son la misma regla: `clippy::too_many_arguments` (umbral 7). No hay
ningún otro warning. Ninguno es bug; son señal de firmas que ya pasaron el
punto donde conviene agrupar params en un struct.

### 11 argumentos

| Función | Ubicación |
|---|---|
| `start_onnx_native` | `src-tauri/src/inference/runner.rs:132` |

### 10 argumentos

| Función | Ubicación |
|---|---|
| `create_video` | `src-tauri/src/store/videos.rs:311` |
| `sync_new_image_to_doc` | `src-tauri/src/p2p/sync.rs:1125` |

### 9 argumentos

| Función | Ubicación |
|---|---|
| `script_to_notebook` | `src-tauri/src/training/notebook.rs:43` |
| `start_cloud_training` | `src-tauri/src/training/cloud/mod.rs:102` |
| `start_python_inference` | `src-tauri/src/inference/runner.rs:331` |
| `draw_bbox` | `src-tauri/src/export/preview_rasterized.rs:202` |
| `update_track` | `src-tauri/src/commands/video_commands.rs:762` |
| `run_automation` | `src-tauri/src/browser_automation/step_engine.rs:12` |

### 8 argumentos

| Función | Ubicación |
|---|---|
| `prepare_dataset_for_backend` | `src-tauri/src/training/dataset.rs:882` |
| `prepare_detection_dataset` | `src-tauri/src/training/dataset.rs:170` |
| `prepare_image_entry` | `src-tauri/src/store/images.rs:197` |
| `run_amg` | `src-tauri/src/inference/sam/amg.rs:38` |
| `parse_yolov8` | `src-tauri/src/inference/ort_runner.rs:574` |
| `run_inference_prepared` | `src-tauri/src/inference/ort_runner.rs:332` |
| `compute_mask_polygon` | `src-tauri/src/inference/ort_runner.rs:1194` |
| `draw_obb` | `src-tauri/src/export/preview_rasterized.rs:257` |
| `toggle_keyframe_enabled` | `src-tauri/src/commands/video_commands.rs:840` |
| `save_tts_recording` | `src-tauri/src/commands/tts_commands.rs:28` |
| `register_output` | `src-tauri/src/commands/audio_edit_commands.rs:117` |
| `save_transcription` | `src-tauri/src/commands/audio_commands.rs:45` |
| `upload_audio` | `src-tauri/src/commands/audio_commands.rs:9` |

### Los cuatro pares `commands` ↔ `store` — hecho

Los casos que se repetían a ambos lados (`upload_inference_model`,
`update_model_config`, `set_keyframe`, `save_audio_annotation`) ya usan un
struct `#[derive(Deserialize)] #[serde(rename_all = "camelCase")]` por par,
declarado en el módulo del store: `UploadModelRequest`,
`UpdateModelConfigRequest` (`store/inference.rs`), `SetKeyframeRequest`
(`store/videos.rs`) y `SaveAudioAnnotationRequest` (`store/audio.rs`).

El comando Tauri lo recibe como único parámetro y lo reenvía; el frontend
envía el objeto bajo la clave `request` (`inferenceService.ts`,
`lib/tauriDb.ts`). Además del warning, quita el riesgo de cruzar argumentos
del mismo tipo: `upload_inference_model` tenía cuatro `String` seguidos
(ruta, nombre, formato, tarea) y `save_audio_annotation` tres
`Option<String>` (transcripción, hablante, idioma), todos intercambiables
sin error de compilación.

### Cómo atacar el resto

Los casos sin par (`run_inference_prepared`, `parse_yolov8`, `draw_bbox`,
`run_amg`, `prepare_detection_dataset`) admiten el mismo tratamiento con un
struct de config local al módulo, sin tocar el frontend.

Quedan fuera de ese patrón `sync_new_image_to_doc` y `run_automation`, que
requieren mirar el flujo completo antes de tocar la firma.

---

## Frontend — ESLint (119)

| Regla | Count | Severidad |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 68 | Baja — tipado laxo en límites de I/O y eventos |
| `react-hooks/exhaustive-deps` | 27 | **Media-alta** — riesgo real de stale closures |

Ver `docs/roadmap-lint-cleanup.md` para el plan por fases; este documento
solo refleja el conteo actual.

### Hotspots

| Archivo | Total | de los cuales `exhaustive-deps` |
|---|---|---|
| `src/features/inference/components/InferencePanel.tsx` | 4 | 1 |
| `src/utils/translationUtils.ts` | 4 | 0 |
| `src/features/training/components/TrainingPanel.tsx` | 3 | 3 |
| `src/features/sam/components/SamOverlay.tsx` | 3 | 0 |
| `src/features/projects/components/ProjectCard.tsx` | 3 | 0 |
| `src/features/inference/components/ModelUploader.tsx` | 3 | 0 |

Ya no hay ningún archivo con más de 4. Los 27 `exhaustive-deps` que quedan
están repartidos en 20 archivos, casi todos con 1 o 2; el único con 3 es
`TrainingPanel.tsx`. Los 29 `no-explicit-any` restantes son casi todos
accesos a campos no declarados en un tipo (`(project as any).xxx`,
`(model.metadata as any).yyy`), que se arreglan ampliando el tipo, no
casteando.

### `AnnotationCanvas.tsx` — hecho

Los 14 `exhaustive-deps` del canvas de anotación están cerrados. Lo que
quedaba ahí eran cuatro patrones distintos, no uno:

- **Handlers como dependencia (9 hooks).** `bboxHandler`…`maskHandler` son
  instancias creadas una sola vez vía `useRef`, así que declararlas no
  cambia cuándo corre cada efecto. Sumadas y listo.
- **Efecto de carga de imagen.** Dependía de `image?.id` pero leía también
  `image.projectId`. Meter el objeto `image` entero habría recargado la
  imagen —con reset de zoom— cada vez que el store refresca la entidad;
  se extrajeron `loadImageId` / `loadProjectId` como deps.
- **Efecto del `MaskHandler`.** Leía `activeTool`, `konvaImage` e
  `initializeMaskHandler` dentro de un `.then()`. Ampliar las deps lo habría
  disparado en cada cambio de imagen, haciendo `finish()` de la máscara
  contra la imagen equivocada — exactamente el bug que la regla pretende
  evitar. Se accede a esos tres por ref (valor fresco, trigger intacto).
- **Efecto de CLAHE/sharpness.** Leía el estado `processedImage`, que nunca
  se usaba en el render; como dependencia habría creado un ciclo
  efecto→`setProcessedImage`→efecto. Convertido a `processedImageRef`.

Moraleja para los archivos que quedan: el autofix es correcto solo en el
primer patrón. En los otros tres, agregar la dependencia introduce el bug.

### Konva y estado de dibujo — hecho

Los `any` del canvas eran de dos clases:

- **Eventos y refs de Konva (29).** La librería ya exporta los tipos:
  `KonvaEventObject<MouseEvent | WheelEvent | DragEvent | Event>` para los
  handlers y los props de los seis renderers, `Konva.Stage` / `Transformer` /
  `Layer` para los refs. Al tiparlos aparecieron dos null-checks que faltaban:
  `findOne()` devuelve `Node | undefined` y `.filter(Boolean)` no lo estrecha,
  así que podían colarse `undefined` en `nodes()`; y `getPointerPosition()`
  devuelve `null` cuando el puntero sale del stage, pero `handleWheel` leía
  `.x` / `.y` directamente.
- **Estado de dibujo (10).** Ahora `RectDrawingData` y `TransformedBox` en
  `types/handlers.ts`, con `DrawingState<T>` genérico.

### Anotadores de audio — hecho

Los 10 `exhaustive-deps` de `SpeechRecognitionAnnotator`,
`SoundEventDetectionAnnotator` y `TtsRecorder` están cerrados. Tres causas:

- **`useAudioPlayer` / `useMicRecorder` devuelven un objeto literal nuevo en
  cada render**, aunque sus campos (`togglePlay`, `seek`, `stop`) sean
  `useCallback` estables. Listar `player` o `recorder` como dependencia
  recrearía el hook en cada render; desestructurar los campos lo resuelve.
- **Efectos de carga (`audio` → estado local).** Dependían de `audio.id` pero
  leían `audio.segments` / `audio.events`. Meter el objeto entero pisaría las
  ediciones locales sin guardar en cada refresco del store; se usa un ref con
  el último id cargado y se sale temprano si no cambió.
- **Auto-guardado con debounce.** `handleSave` cambia en cada edición y
  `onSaved` / `onSentencesChange` vienen del padre sin `useCallback`:
  añadirlos a las deps reinicia el timer en cada render y el guardado nunca
  llega a dispararse. Se toma `handleSave` por ref.

De paso se corrigió el guard "no auto-guardar al cargar" de
`SpeechRecognitionAnnotator`, que comparaba `segments === audio.segments`
cuando el load hace una copia — nunca era cierto, así que guardaba una vez de
más en cada cambio de audio. Ahora es un flag explícito.

### Prioridad sugerida

1. **`exhaustive-deps` en `TrainingPanel.tsx` (3)**, `AudioClassificationAnnotator.tsx` (2),
   `useAnnotations.ts` (2), `useInferenceModels.ts` (2), `useP2pSession.ts` (2),
   `useTauriPathDrop.ts` (2); el resto son sueltos.
2. **`no-explicit-any` (68)** — mecánico, sin riesgo. Empezar por
   `translationUtils.ts` y los handlers/renderers de canvas, que son tipos
   internos y no límites de I/O.

El techo de `--max-warnings` se puede bajar ya de 130 a 65.
