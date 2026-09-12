# Warnings pendientes de lint

Estado tras la pasada de limpieza (commits `0c92c09`, `6c0c1bd`, `8c2fb94`)
y el saneo de `exhaustive-deps` en `AnnotationCanvas.tsx`.

| Verificador | Errores | Warnings | Nota |
|---|---|---|---|
| `tsc --noEmit` | 0 | — | limpio |
| `cargo check --all-targets` | 0 | — | limpio |
| `cargo fmt --check` | 0 | — | limpio |
| `cargo test --lib` | 0 | — | 114 passed |
| `eslint` | 0 | **105** | techo `--max-warnings 130` |
| `cargo clippy --all-targets` | 0 | **30** | todos `too_many_arguments` |

---

## Rust — clippy (30)

Todos son la misma regla: `clippy::too_many_arguments` (umbral 7). No hay
ningún otro warning. Ninguno es bug; son señal de firmas que ya pasaron el
punto donde conviene agrupar params en un struct.

### 11 argumentos

| Función | Ubicación |
|---|---|
| `start_onnx_native` | `src-tauri/src/inference/runner.rs:132` |
| `set_keyframe` | `src-tauri/src/commands/video_commands.rs:805` |
| `save_audio_annotation` | `src-tauri/src/commands/audio_commands.rs:103` |

### 10 argumentos

| Función | Ubicación |
|---|---|
| `create_video` | `src-tauri/src/store/videos.rs:295` |
| `upload_inference_model` | `src-tauri/src/store/inference.rs:26` |
| `sync_new_image_to_doc` | `src-tauri/src/p2p/sync.rs:1125` |
| `upload_inference_model` | `src-tauri/src/commands/inference_commands.rs:15` |

### 9 argumentos

| Función | Ubicación |
|---|---|
| `script_to_notebook` | `src-tauri/src/training/notebook.rs:43` |
| `start_cloud_training` | `src-tauri/src/training/cloud/mod.rs:102` |
| `set_keyframe` | `src-tauri/src/store/videos.rs:543` |
| `update_model_config` | `src-tauri/src/store/inference.rs:153` |
| `save_audio_annotation` | `src-tauri/src/store/audio.rs:258` |
| `start_python_inference` | `src-tauri/src/inference/runner.rs:331` |
| `draw_bbox` | `src-tauri/src/export/preview_rasterized.rs:202` |
| `update_track` | `src-tauri/src/commands/video_commands.rs:760` |
| `update_model_config` | `src-tauri/src/commands/inference_commands.rs:58` |
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
| `toggle_keyframe_enabled` | `src-tauri/src/commands/video_commands.rs:854` |
| `save_tts_recording` | `src-tauri/src/commands/tts_commands.rs:28` |
| `register_output` | `src-tauri/src/commands/audio_edit_commands.rs:117` |
| `save_transcription` | `src-tauri/src/commands/audio_commands.rs:46` |
| `upload_audio` | `src-tauri/src/commands/audio_commands.rs:10` |

### Cómo atacarlo

Los casos se agrupan en pares `commands/*` ↔ `store/*` con la misma firma
(`upload_inference_model`, `update_model_config`, `set_keyframe`,
`save_audio_annotation`). El comando Tauri deserializa N params y los
reenvía uno a uno al store.

Fix natural: un struct `#[derive(Deserialize)]` por par, que el comando
reciba como único param y pase por referencia al store. Elimina 2 warnings
por struct y reduce el riesgo de cruzar argumentos del mismo tipo (hoy
varios son `String` consecutivos, intercambiables sin error de compilación).

Casos sin par (`run_inference_prepared`, `parse_yolov8`, `draw_bbox`,
`run_amg`, `prepare_detection_dataset`) admiten el mismo tratamiento con un
struct de config local al módulo.

Quedan fuera de ese patrón `sync_new_image_to_doc` y `run_automation`, que
requieren mirar el flujo completo antes de tocar la firma.

---

## Frontend — ESLint (119)

| Regla | Count | Severidad |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 68 | Baja — tipado laxo en límites de I/O y eventos |
| `react-hooks/exhaustive-deps` | 37 | **Media-alta** — riesgo real de stale closures |

Ver `docs/roadmap-lint-cleanup.md` para el plan por fases; este documento
solo refleja el conteo actual.

### Hotspots

| Archivo | Total | de los cuales `exhaustive-deps` |
|---|---|---|
| `src/features/canvas/components/AnnotationCanvas.tsx` | 18 | 0 |
| `src/features/inference/components/InferencePanel.tsx` | 4 | 1 |
| `src/utils/translationUtils.ts` | 4 | 0 |
| `src/features/audio/components/SpeechRecognitionAnnotator.tsx` | 4 | 4 |
| `src/features/training/components/TrainingPanel.tsx` | 3 | 3 |
| `src/features/audio/components/TtsRecorder.tsx` | 3 | 3 |
| `src/features/audio/components/SoundEventDetectionAnnotator.tsx` | 3 | 3 |
| `src/features/sam/components/SamOverlay.tsx` | 3 | 0 |
| `src/features/projects/components/ProjectCard.tsx` | 3 | 0 |
| `src/features/inference/components/ModelUploader.tsx` | 3 | 0 |
| `src/features/canvas/handlers/{OBB,BBox}Handler.ts` | 3+3 | 0 |
| `src/features/canvas/components/renderers/{OBB,BBox}Renderer.tsx` | 3+3 | 0 |

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

### Prioridad sugerida

1. **`exhaustive-deps` en los anotadores de audio (10)** — `SpeechRecognitionAnnotator`,
   `SoundEventDetectionAnnotator`, `TtsRecorder`; archivos chicos, mismo patrón.
2. **`exhaustive-deps` en `TrainingPanel.tsx` (3)** e `InferencePanel.tsx` (1).
3. **`no-explicit-any` (68)** — mecánico, sin riesgo. Empezar por
   `translationUtils.ts` y los handlers/renderers de canvas, que son tipos
   internos y no límites de I/O.

Con (1) y (2) cerrados quedan ~91 warnings; ahí se puede bajar el techo de
`--max-warnings 130` a 100.
