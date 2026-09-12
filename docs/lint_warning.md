# Warnings pendientes de lint

**Ninguno.** Los seis verificadores están en cero.

| Verificador | Errores | Warnings | Techo |
|---|---|---|---|
| `tsc --noEmit` | 0 | — | — |
| `eslint` | 0 | **0** | `--max-warnings 0` |
| `cargo check --all-targets` | 0 | — | — |
| `cargo clippy --all-targets` | 0 | **0** | — |
| `cargo fmt --check` | 0 | — | — |
| `cargo test --lib` | 0 | — | 123 passed |

`npm run lint` corre con `--max-warnings 0`: cualquier warning nuevo rompe el
build.

---

## Cómo se cerraron

### ESLint — `no-explicit-any` (29 → 0)

Ningún caso se resolvió con un cast nuevo ni con un `eslint-disable`:

- **Campos no declarados en un tipo.** `InferenceModelMetadata` (`model_info`,
  `color_palette`, `preprocess`, más index signature) y
  `Project.inferenceModelCount`, que el `ProjectSummary` de Rust ya enviaba.
- **Globals del `window`.** `__samComposite` y `webkitAudioContext` con
  `declare global` en el módulo que los usa.
- **Uniones discriminadas.** Narrowing por `in` sobre `AnnotationData` en
  `useKeyboardShortcuts`; `RangeAnnotation` en `useTSAnnotations`.
- **Tipos que ya exportaba la librería.** `AnnotationOptions` de
  `chartjs-plugin-annotation`, `LucideIcon`, `ArrayLike<number>` para el
  fallback de bytes de máscara SAM.
- **Tipos propios que faltaban.** `ToolType` exportado desde `uiStore`;
  `(Annotation | null)[]` en `maskReclassify`, que era lo que el filter final
  ya asumía; interfaz local para la respuesta de la API de commits de GitHub.
- **Código muerto.** `withTranslationLogging` no se usaba en ningún lado.

Tres bugs salieron a la luz al tipar:

1. `InferencePanel` leía `(project as any).images` para avisar de anotaciones
   antes de reemplazar clases, pero `get_project` devuelve un `ProjectSummary`
   sin imágenes: el aviso nunca aparecía. Ahora consulta `imageService`.
2. Mover keypoints o landmarks con las flechas reconstruía cada punto como
   `{x, y}`, perdiendo `visible` y `name`.
3. La rama `(file as any).path` de `SamSettingsSection` era inalcanzable:
   `open()` de plugin-dialog devuelve `string | null`.

### Clippy — `too_many_arguments` (22 → 0)

Todos por agrupación en struct. Ninguno cambió comportamiento; cada struct
junta valores que ya viajaban juntos desde el mismo origen.

| Struct | Reemplaza |
|---|---|
| `InferenceParams` | params de `run_inference_prepared` + `parse_yolov8` |
| `MaskBox` + tupla proto | `compute_mask_polygon` |
| `InferenceJob` | `start_onnx_native` (11), `start_python_inference` (9) |
| `BBoxData` / `OBBData` | `draw_bbox`, `draw_obb` |
| `UploadAudioRequest`, `SaveTranscriptionRequest`, `SaveTtsRecordingRequest` | comandos de audio y TTS |
| `UpdateTrackRequest`, `ToggleKeyframeRequest` | comandos de tracks |
| `PreparedOutput` | tupla de 4 entre `prepare_output` y `register_output` |
| `NewImage`, `NewVideo` | `prepare_image_entry`, `create_video` |
| `AmgImage` | `run_amg` |
| `SplitIndices`, `DatasetSpec` | dataset de training y su router por backend |
| `NotebookInfo`, `CloudJobSpec`, `AutomationJob` | notebook, cloud, navegador |
| `&ImageEntry` | `sync_new_image_to_doc` |

Los comandos Tauri que pasaron a struct siguen el patrón ya existente
(`SetKeyframeRequest`, `SaveAudioAnnotationRequest`): struct `Deserialize` con
`rename_all = "camelCase"` en el módulo del store, y el frontend envía el
objeto bajo la clave `request`.

Como ese contrato solo falla en runtime, `src/tests.rs` fija el JSON exacto que
manda `tauriDb.ts` / `inferenceService.ts` para los nueve comandos que usan
`request` (`ipc_*_matches_frontend_payload`).

### Fases anteriores

`no-unused-vars` (66), `react-refresh` (5) y `exhaustive-deps` (52) se
cerraron antes; el detalle de los patrones de `exhaustive-deps` —y de cuándo
agregar la dependencia introduce el bug que la regla pretende evitar— está en
el historial de este archivo y en `docs/roadmap-lint-cleanup.md`.
