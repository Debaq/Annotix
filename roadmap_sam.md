# Roadmap SAM (Segment Anything) — Annotix

Integración transversal de SAM como asistente de segmentación para todas las
herramientas de marcación de imagen. El flujo principal es **AMG (Automatic
Mask Generation)**: generar 20–200 máscaras candidatas y dejar al usuario
asignar clase con un click + tecla. Existe un modo alternativo de refinamiento
click-por-click (reusa el decoder con prompts manuales).

---

## Flujo de usuario (AMG)

1. Usuario activa SAM Assist (tecla `S`) con una tool activa (BBox/OBB/Mask/Polygon).
2. Backend corre AMG: encode + grilla de puntos + decoder batched + filtrado.
3. Overlay en frontend (offscreen canvas) muestra máscaras coloreadas.
4. Sliders (granularidad multimask, score, NMS, overlap) refiltran en frontend
   sin re-correr AMG.
5. Click sobre una máscara + tecla de clase (1-0, Q-P) → se convierte al formato
   de la tool activa, se inserta como `AnnotationEntry` y desaparece del overlay.
6. Repetir hasta clasificar todo lo relevante.
7. Cambio de imagen: candidatos no asignados se descartan (efímeros, nunca
   persisten en `project.json`).
8. Regla: "donde ya hay anotación, no hay máscara candidata" (filtro bbox IoU > 0.5).

Modo refinamiento click-por-click (botón secundario): mismo encoder cacheado,
decoder con prompts manuales (puntos pos/neg + bbox).

---

## Decisiones cerradas

| # | Decisión | Valor |
|---|---|---|
| A | Grilla decoder | 16×16 default, 32×32 "HQ mode" en settings. **Batching obligatorio**. |
| B | Almacenamiento máscara | Logits uint8, 256 lado largo, 3 multimask por punto. Upscale bilinear + threshold 0.0 al aceptar. Caso `tool=Mask`: re-correr decoder con el punto de la máscara para resolución nativa. |
| C | Overlay | Frontend offscreen canvas. Backend manda bitmaps lowres + metadata; frontend compone PNG coloreado. |
| D | Hit-test | Frontend con `id_map` Uint16Array 256×256. Topmost = score más bajo arriba. Recalcular al cambiar filtros. |
| E | Multimask | 3 por punto cacheadas. Slider "granularidad" global = `activeMaskIdx` en `useSamStore`, sin IPC. |
| F | Atajos clase | Sistema existente `useKeyboardShortcuts` (1-0, Q-P). SAM intercepta solo si hay máscara en hover + `samAssistActive`. |
| — | Conversión mask→anotación | **Rust** (`conversion.rs`). Usa `geo` para DP simplify. |
| — | Vínculo encoder/decoder | `pair_id = "{encoder_id}:{decoder_id}"`. Sin schema nuevo. |
| — | Cache embedding | 1 slot en v1; estructura `HashMap` lista para LRU. |
| — | Descarga modelos | v1 manual (upload UI existente). HF auto-descarga queda para más adelante. |
| — | Execution provider | CPU only inicialmente. |
| — | `sam_predict` | Sync (es interactivo, <50ms). |
| — | Preview en vivo | Solo al click, no debounced sobre mouse move. |
| — | Ghosting total | Si tool ∈ {keypoints, landmarks, pan}. Toolbar deshabilitado con tooltip. |

---

## Tipos core (Rust + mirror TS)

```rust
// src-tauri/src/inference/sam/mod.rs
pub struct SamPoint { x: f32, y: f32, label: u8 }   // label: 1=pos, 0=neg
pub struct SamPrompts { points, bbox: Option<[f32;4]>, multimask_output: bool }
pub struct SamPrediction { masks_lowres: Vec<Vec<u8>>, scores, best_index, lowres_size, orig_size }

pub struct AmgConfig {
    points_per_side: u32,               // 16
    pred_iou_thresh: f32,               // 0.7
    stability_score_thresh: f32,        // 0.85
    box_nms_thresh: f32,                // 0.7
    min_mask_region_area: u32,          // 100
    overlap_with_existing_thresh: f32,  // 0.5
}

pub struct SamMask {
    id: String,
    masks_lowres: [Vec<u8>; 3],   // logits uint8, 256 lado largo
    scores: [f32; 3],
    bbox: [f32; 4],               // tamaño original [x,y,w,h]
    orig_size: (u32, u32),
    lowres_size: (u32, u32),
    color_seed: u32,              // hash(id)
}

pub enum SamAmgPhase { Encoding, DecodingBatch, Filtering, Done }
pub struct SamAmgProgress { phase, current, total, image_id }
pub enum MaskTarget { Bbox, Obb, Polygon, Mask }
```

---

## Comandos Tauri

| Comando | Entrada | Salida | Estado |
|---|---|---|---|
| `sam_load_model` | `project_id, encoder_model_id, decoder_model_id` | `pair_id: String` | ✅ PR2 |
| `sam_encode_image` | `project_id, image_id` | `SamEncodeInfo {image_id, orig_size, cached}` | ✅ PR2 |
| `sam_predict` | `prompts: SamPrompts` | `SamPrediction` | ✅ PR3 |
| `sam_auto_generate_masks` | `project_id, image_id, config: AmgConfig, existing_bboxes?` | `Vec<SamMask>` + evento `sam:amg_progress` | ✅ PR4 |
| `sam_get_candidates` | `image_id` | `Vec<SamMask>` | ✅ PR2 (vacío si no hay AMG) |
| `sam_refilter_candidates` | `image_id, existing_bboxes, overlap_thresh` | `Vec<SamMask>` | ✅ PR4 |
| `sam_accept_mask` | `image_id, mask_id, active_multimask_idx, target, dp_tolerance` | `AnnotationEntry.data` | ⏳ PR5 |
| `sam_clear_cache` | — | `()` | ✅ PR2 |

Evento: `sam:amg_progress` → `{phase, current, total, image_id}`.

---

## Invalidación de cache

- Cambio de proyecto → `SamState.clear_all()` (modelo + cache + candidates)
- Cambio de modelo → `SamState.clear_runtime()` (cache + candidates)
- Cambio de imagen (nuevo `sam_encode_image`) → candidates limpios
- Insertar/eliminar anotación en imagen → `sam_refilter_candidates` (solo overlap, no re-AMG)

---

## Estado de PRs

### ✅ PR1 — Esqueleto + tipos (completado)

- Deps Cargo: `imageproc 0.25`, `geo 0.29`
- Módulo `src-tauri/src/inference/sam/` con 8 submódulos (stubs)
- `SamState` como `tauri::State` separado de `AppState`
- `src-tauri/src/commands/sam_commands.rs` con 8 comandos (stubs)
- Registrados en `lib.rs` `generate_handler!`
- Mirror TS en `src/lib/db.ts` + wrappers en `src/lib/tauriDb.ts`
- `cargo check` limpio

### ✅ PR2 — Encoder + cache (completado)

Implementado:
- `preprocess_image` — decode, resize 1024 lado largo bilinear, normalización ImageNet,
  tensor `[3,1024,1024]` con padding cero
- `load_encoder` / `run_encoder` — sesión ONNX, `Tensor::from_array`, extrae primer output f32
- `load_decoder` — carga sesión (aún no se ejecuta)
- `sam_load_model` — resuelve paths via `get_model_file_path`, carga sesiones, invalida runtime
- `sam_encode_image` — cachea `SamEmbeddingCache { image_id, project_id, orig_size, input_size, embedding }`. Idempotente por `(project_id, image_id)`. Invalida candidates viejos.
- `sam_clear_cache` — limpia embedding + candidates (no sesiones)

### ✅ PR3 — Decoder + sam_predict manual (completado)

Implementado:
- `decoder::run_decoder(session, embedding, point_coords, point_labels, num_points, orig_hw)` → `DecoderRun { masks, mask_shape[B,M,H,W], scores }`
- Inputs nombrados: `image_embeddings` `[1,256,64,64]`, `point_coords` `[1,N,2]`, `point_labels` `[1,N]`, `mask_input` `[1,1,256,256]` ceros, `has_mask_input` `[1]=0`, `orig_im_size` `[2]=[h,w]`
- Identificación de outputs por rango (4D=masks, ≤2D=scores) → robusto a variaciones de nombres MobileSAM/SAM ViT/SAM2
- `postprocess::logits_to_u8` — mapeo lineal `128 ↔ 0.0` con factor 8 (satura ~±16 logits)
- `postprocess::downscale_u8_mask` — bilinear con `image::imageops::resize`, short-circuit si ya cabe en 256
- `sam_predict`:
  - Arma coords/labels desde `SamPrompts.points` (+ bbox opcional como 2 puntos labels 2/3, + padding point label -1 si sin bbox)
  - Transforma coords ORIG → SAM input space con `transform_points`
  - Llama decoder con `orig_im_size=(h,w)` real; masks vienen upscaladas
  - Downscale a 256 lado largo; devuelve 3 máscaras (o 1 si `multimask_output=false`) + scores + `best_index=argmax`

Pendiente revisar en PR4: el `orig_im_size` real hace que el decoder upscale cada máscara al tamaño de la imagen (caro con AMG). Para PR4 considerar pasar `orig_im_size` escalado a 256 lado largo y/o export ONNX custom.

### ✅ PR4 — AMG + candidates + progreso (completado)

Implementado:
- `amg::run_amg(sessions, embedding, orig_size, input_size, image_id, config, existing_bboxes, progress)`:
  1. Grilla `N²` puntos en centros de celdas (coords ORIGINALES)
  2. Por punto: `run_decoder` con `orig_im_size` escalado a **256 lado largo** → masks lowres nativas sin upscale caro
  3. Stability score sobre logits f32: `|{x>+1}| / |{x>-1}|`
  4. Filtros per-mask: `pred_iou_thresh`, `stability_score_thresh`, `min_mask_region_area`
  5. Elige best multimask (argmax score entre las que pasan)
  6. NMS sobre bbox del best con `box_nms_thresh`
  7. Filtra overlap bbox-IoU contra `existing_bboxes`
  8. Progress emit cada ~8 puntos + fases `DecodingBatch` / `Filtering` / `Done`
- `refilter_by_overlap` — barato, sin re-correr decoder
- `sam_auto_generate_masks` — orquesta, guarda en `SamState.candidates[image_id]`
- `sam_refilter_candidates` — actualiza el slot y devuelve filtrado
- `color_seed` = FNV-1a 32-bit de `id` (uuid v4)

Notas:
- Decoder se llama `N²` veces (batch=1) — el export oficial no soporta múltiples grupos. Para `points_per_side=16` son 256 calls.
- `orig_im_size` escalado a 256 funciona: el decoder remueve padding proporcionalmente con base en esas dimensiones, consistente con preprocess.

### ⏳ PR5 — Conversión mask → formatos

- `postprocess::upscale_and_threshold` — bilinear lowres→orig + threshold 128
- `conversion::mask_to_annotation(mask, target, dp_tolerance)`:
  - `Bbox` → `{x, y, width, height}` del contorno axis-aligned
  - `Obb` → `{x, y, width, height, rotation}` vía minAreaRect (impl propia sobre contorno con rotating calipers, o aproximación)
  - `Polygon` → `{points: [{x,y}], closed: true}` con `geo::algorithm::simplify::Simplify` (Douglas-Peucker)
  - `Mask` → `{base64png}` reusando encoder de `pixel_commands.rs`
- `sam_accept_mask` — pega todo: upscale, caso especial re-encode para `tool=Mask`, invoca conversión, elimina candidato del cache, devuelve `Value` listo para `AnnotationEntry.data`

### ⏳ PR6 — UI sub-modo SAM (frontend)

- `useSamStore` (Zustand): `samAssistActive`, `candidates`, `activeMaskIdx` (0/1/2), `hoverMaskId`, `filters {predIouMin, stabilityMin, nmsThresh}`, `idMap: Uint16Array(256×256)`
- `src/features/sam/`:
  - `SamToolbarButton.tsx` — botón + tooltip ghosted, atajo `S`
  - `SamOverlay.tsx` — layer Konva con imagen compuesta offscreen
  - `SamSliders.tsx` — granularidad (0/1/2), score, NMS
  - `useSamComposite.ts` — recompone overlay + id_map offscreen al cambiar filtros
  - `useSamHitTest.ts` — lee id_map por coord
- Integración en `CanvasStage`:
  - Si `samAssistActive`: intercepta mousemove (hover), click (asignar), keydown (clases)
  - Canal asignar: `class_shortcut` → `sam_accept_mask` → `saveAnnotations` existente → remove del candidates frontend
- Wire eventos: `onSamAmgProgress` → toast/modal progreso
- Invalidación frontend: cambio de `currentImageId` → `samClearCache` + volver a ofrecer AMG

### ⏳ PR7 — Modo refinamiento click-por-click

- Botón secundario "Refinar con click" (sub-modo dentro de SAM Assist)
- `SamRefineHandler`:
  - Click izq: agrega `SamPoint{label:1}`
  - Shift+click: `SamPoint{label:0}`
  - Drag: bbox
  - `Enter`: acepta (pasa por misma conversión y pipeline de `sam_accept_mask`, pero con `SamPrediction` directo, no `SamMask`)
  - `Esc`: descarta
- `Tab`: ciclar entre las 3 máscaras multimask antes de aceptar

### ⏳ PR8 — Polish

- Ghosting total cuando tool ∈ {keypoints, landmarks, pan}
- HQ mode toggle (32×32) en settings de proyecto
- Indicador "encoding…" durante primer embedding
- Preset MobileSAM (detección automática por hash)
- Licencias en `DOCS/SAM_LICENSES.md` (Apache 2.0 MobileSAM, Apache 2.0 SAM ViT, Apache 2.0 SAM2)

---

## Riesgos y pendientes

- **Shapes de outputs decoder varían** entre MobileSAM y SAM2 → PR3 debe detectar y normalizar
- **minAreaRect**: `imageproc` no lo trae. Implementar con rotating calipers sobre convex hull del contorno
- **Memoria candidatos**: 200 × 3 × 256² × 1B ≈ 40MB — OK
- **Filtro overlap pixel-a-pixel** para proyectos mask/polygon: v1 usa bbox IoU; revisitar en PR posterior si los usuarios lo piden
- **Threading AMG**: decoder batched es CPU-bound; spawnear en thread para no bloquear runtime Tauri

---

## Archivos clave

```
src-tauri/src/inference/sam/
 ├ mod.rs          — tipos públicos
 ├ encoder.rs      — ✅ PR2
 ├ decoder.rs      — load ✅ / run ⏳ PR3
 ├ preprocess.rs   — ✅ PR2
 ├ postprocess.rs  — ⏳ PR3/PR5
 ├ conversion.rs   — ⏳ PR5
 ├ amg.rs          — ⏳ PR4
 └ state.rs        — ✅ PR1

src-tauri/src/commands/sam_commands.rs — 8 comandos
src-tauri/src/lib.rs                    — manage(SamState) + generate_handler!
src/lib/db.ts                           — tipos mirror
src/lib/tauriDb.ts                      — wrappers invoke
```
