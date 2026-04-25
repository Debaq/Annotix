# Roadmap: Optimizaciones JS↔Rust pendientes

Resultado de auditoría de cuellos de botella en la interacción frontend (TS) ↔ backend (Rust/Tauri). Lo que sigue son los items que **no** se implementaron en la primera tanda (commits `b5c8bd3`, `2380ef1`, `fc603a5`, `197f20b`) por ser refactors invasivos o features grandes.

Orden sugerido: por impacto/esfuerzo. Cada item indica archivos clave, riesgo, y criterio de "hecho".

---

## 1. `list_images` summary sin annotations completas

**Impacto:** Alto. Galerías con miles de imágenes deserializan todas las anotaciones por cada `list_images_by_project` aunque la galería solo necesita `annotation_count` para el badge.

**Esfuerzo:** Medio-alto (refactor de consumidores).

**Estado:** Pendiente. Skip en primera tanda por riesgo de regresión.

### Plan
1. Backend `src-tauri/src/store/images.rs`:
   - Nueva struct `ImageSummary { id, projectId, name, blobPath, width, height, videoId, frameIndex, status, annotationCount, lockedBy, lockExpires, downloadStatus }`.
   - Nueva fn `list_image_summaries(project_id) -> Vec<ImageSummary>`.
2. Backend `src-tauri/src/commands/image_commands.rs`:
   - Nuevo command `list_image_summaries_by_project`.
3. Frontend `src/lib/tauriDb.ts`:
   - Tipo `TauriAnnotixImageSummary` y wrapper `listImageSummariesByProject`.
4. Frontend galería:
   - `src/features/gallery/services/imageService.ts:listByProject` → usa summary.
   - `src/features/gallery/hooks/useImages.ts` → filtros con `annotationCount` en vez de `annotations.length`.
   - `src/features/gallery/components/ImageCard.tsx:113,166` → `annotationCount`.
5. Mantener `list_images_by_project` (full) para `useClassCounts` y otros consumidores que necesiten annotations.

### Riesgos
- `image.annotations` se referencia desde múltiples lugares (canvas, undo, video, p2p). Hay que distinguir consumidores de "lista" (galería) vs "una imagen" (`get_image` ya devuelve full).
- TypeScript narrowing: el tipo de retorno cambia, callers que asuman `Annotation[]` rompen en compile-time → bueno, pero hay que actualizarlos uno a uno.

### Hecho cuando
- `list_image_summaries_by_project` retorna sin el campo `annotations`.
- Galería renderiza igual con menos payload (verificar con DevTools Network).
- Ningún componente del flujo galería accede a `image.annotations.length`.

---

## 2. Lazy loading / dirty-flag en `project.json`

**Impacto:** Alto en proyectos >50MB. Cada `with_project_mut` reescribe todo el archivo.

**Esfuerzo:** Alto. Toca el corazón del store.

**Estado:** Pendiente.

### Plan
1. `src-tauri/src/store/state.rs` y `projects.rs`:
   - `CachedProject` con flag `dirty: AtomicBool`.
   - `with_project_mut` marca dirty pero **no** flushea inmediato.
   - Spawn task background que cada 500ms revisa proyectos dirty y flushea.
   - `flush_project` explícito al cerrar app / cambiar de proyecto / antes de export.
2. Considerar separar `project.json` en archivos por sección (`metadata.json`, `images.json`, `videos.json`, `training.json`) si parsearlo entero ya es el cuello.

### Riesgos
- Si la app crashea con dirty pendiente → datos perdidos. Mitigar con flush periódico corto + flush sincrónico en signals/exit hooks.
- Concurrencia: dos `with_project_mut` paralelos sobre mismo proyecto — usar `Mutex` o `RwLock`.

### Hecho cuando
- Drag de bbox no genera escritura a disco por movimiento (verificar con `inotifywait`).
- Cambio de proyecto / cierre app fuerza flush.
- Crash test: matar proceso justo después de un cambio → al reabrir, dato presente o ausente pero archivo no corrupto.

---

## 3. Modal training dedicado

**Impacto:** Medio. UX, no performance.

**Esfuerzo:** Medio. Feature de UI nueva.

**Estado:** Pendiente. Existe progreso por epoch via `training:progress` pero la UI actual es minimal.

### Plan
1. Componente `src/features/training/components/TrainingProgressModal.tsx`:
   - Gráfico loss/precision/recall en tiempo real (Recharts ya en dependencias).
   - ETA dinámico: `(epoch_actual / total) * tiempo_transcurrido` extrapolado.
   - Logs scrolleable (escucha `training:log`, autoscroll opcional).
   - Botón Cancelar (invoca `cancel_training`).
   - Persiste si el usuario cierra/reabre la app (lee estado del job desde `project.json`).
2. Trigger desde `start_training`. Reemplazar diálogo actual.

### Riesgos
- Recharts puede ser pesado si se agregan miles de puntos sin throttle. Limitar a últimos 200 puntos o downsample.

### Hecho cuando
- Training muestra modal con gráfico actualizándose por epoch.
- Cerrar/reabrir app durante training muestra el modal otra vez con los datos.
- Botón Cancelar detiene el job.

---

## 4. Máscaras a filesystem (en vez de base64 en JSON)

**Impacto:** Medio. Reduce tamaño de `project.json` ~33% para proyectos con segmentación.

**Esfuerzo:** Medio. Migración de formato.

**Estado:** Pendiente.

### Plan
1. Backend nuevo dir `{project}/masks/{image_id}/{annotation_id}.png`.
2. `AnnotationEntry.data.maskPath` (string) en lugar de `base64png`.
3. Migración:
   - Al leer `project.json`, si encuentra `base64png` lo escribe a disco y reemplaza con `maskPath`. Marca dirty.
   - Mantener compat de lectura para no romper proyectos existentes durante un release.
4. Export/import: serializar mask al ZIP igual que ahora (nada cambia en el formato `.tix`).
5. Frontend `MaskHandler.ts`: leer mask desde `convertFileSrc(maskPath)` en vez de decodificar base64.

### Riesgos
- P2P sync: actualmente se sincroniza el JSON entero, ahora hay archivos separados. Hay que extender el doc P2P con blobs por máscara.
- Borrado de máscaras huérfanas (cuando se elimina anotación) — agregar GC al delete.

### Hecho cuando
- Proyecto nuevo con máscaras tiene `project.json` < 1MB y `masks/` con PNGs.
- Proyecto viejo se migra al primer abrir sin pérdida.
- Export `.tix` funciona en ambos sentidos.

---

## 5. Inferencia Python: serialización binaria

**Impacto:** Bajo-medio. Solo afecta inferencia con backend Python (.pt).

**Esfuerzo:** Bajo.

**Estado:** Pendiente.

### Plan
- `src-tauri/src/inference/runner.rs:287-350`: actualmente parsea JSON desde stdout línea por línea.
- Cambiar a MessagePack via `rmp-serde` (ya hay precedente en otros sitios) o a `bincode`.
- Script Python emite frames binarios prefijados por longitud.

### Riesgos
- Bajo. Solo afecta el path Python.

### Hecho cuando
- Inferencia con `.pt` parsea binario, perf medido vs antes.

---

## 6. Eventos `db:*-changed` con invalidación selectiva en frontend

**Impacto:** Medio. Hoy todos los hooks re-leen lista completa al recibir cualquier evento.

**Esfuerzo:** Medio-alto. Requiere cambiar `useTauriQuery` para soportar payload-aware invalidation.

**Estado:** Parcial. Backend ya emite payloads selectivos (`{ projectId, action, imageIds }`). Frontend los ignora.

### Plan
1. `src/hooks/useTauriQuery.ts`: aceptar invalidador que reciba el payload y decida si re-fetch o mutar local.
2. Hooks específicos:
   - `useImages`: si action=`updated` y solo hay imageIds, hacer `get_image(id)` por cada uno y mergear en estado en vez de re-listar.
   - `useCurrentImage`: si action=`updated` con imageIds que no incluyen `currentImageId`, ignorar.

### Riesgos
- Estado optimista vs servidor: cuidado con orden de eventos (el listener corre antes/después del save local).
- Bug-prone. Tests recomendados.

### Hecho cuando
- Cambiar 1 anotación en imagen 5 no causa re-fetch de las otras 4999.

---

## 7. P2P sync masivo en batch

**Impacto:** Bajo (solo sesiones P2P activas).

**Esfuerzo:** Bajo-medio.

**Estado:** Pendiente.

### Plan
- `src-tauri/src/commands/image_commands.rs:43-62`: actualmente hace un `sync_new_image_to_doc` por imagen subida.
- Agrupar de a 50 imágenes por llamada al doc P2P.

### Hecho cuando
- Subir 1000 imágenes con sesión P2P activa hace ~20 syncs en vez de 1000.

---

## Ya hecho (referencia)

- ✅ Debounce 300ms en drag de bbox (`useAnnotations.ts`)
- ✅ JSON compacto (no pretty) en `project.json` runtime
- ✅ Spinner carga proyecto + i18n `loadingProject` (10 locales)
- ✅ Asset protocol con fallback a bytes en canvas/galería
- ✅ Eventos `db:*-changed` emiten payload selectivo desde todos los emisores
- ✅ Throttle ~10/seg en `video:extraction-progress` + emit final 100%
- ✅ Import dataset con fases (`detecting`/`parsing`/`saving`/`done`) + UI con texto y `current/total`
- ✅ `analyze_tix_projects` async + `merge:analyze-progress` por archivo + UI
- ✅ Throttle ~10/seg en `upload:progress`
- ✅ Throttle de logs de training
