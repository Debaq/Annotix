# Auditoría — series temporales y video

Revisión del 2026-09-12 sobre `src/features/video`, `src/features/timeseries`,
`src-tauri/src/store/{videos,timeseries}.rs`, `src-tauri/src/commands/{video,timeseries,csv}_commands.rs`
y sus puntos de contacto con export, entrenamiento y P2P. Ordenado por impacto.

> **Estado: todos los hallazgos corregidos** el 2026-09-12, con las funciones nuevas que faltaban
> (exportador de series, herramienta de clasificación, parser de CSV con fechas, cancelación de
> extracción, sincronización P2P de video y series). Cada sección termina con la corrección
> aplicada. El formato de `project.json` pasa a la versión 3 con dos migraciones automáticas
> (`io::migrate_project`): v1→v2 reescala las cajas consolidadas de video a píxeles, v2→v3 mueve
> los datos de las series a `timeseries/{id}.json`. 26 tests nuevos cubren lo corregido.

---

# Parte 1 — Video

## V1. El bake escribe porcentajes en un campo que todo el resto del stack lee como píxeles

**Dónde.** `useVideoAnnotationBridge.ts:69-74` (`pxToPct`) guarda los keyframes en porcentaje 0–100.
`videos.rs:334` (`set_keyframe`) los persiste tal cual. `video_commands.rs:706-709` (`bake_video_tracks`)
los vuelca directamente:

```rust
data: serde_json::json!({ "x": x, "y": y, "width": w, "height": h }),
```

`db.ts:103-108` define `BBoxData` como **píxeles**. `dataset.rs:309-313` y todos los exportadores
llaman `normalize_coordinates(bbox.x, …, image.width, image.height)`, que divide por el tamaño de
la imagen (`converters.rs:2-4`). No hay ninguna conversión intermedia — lo verifiqué en el bake, en
`parse_bbox` (`export/mod.rs:68`) y en toda la ruta de export.

**Qué implica.** Una caja que cubre el 50 % del ancho de un frame 1920×1080 se guarda como `x=50`
y se exporta como `50/1920 = 0.026`. Todas las anotaciones consolidadas de video salen colapsadas
contra la esquina superior izquierda, con un factor de error de `ancho/100` (19× en 1080p). Afecta
por igual a los 11 formatos de export y al dataset de entrenamiento. En el editor se ven bien
porque el bridge deshace la conversión al pintar; el error solo aparece en el dataset final.

**Alcance.** Todo proyecto de video consolidado es un dataset inutilizable, en silencio. Este es el
hallazgo con mayor impacto de la auditoría.

**Corrección aplicada.** `bake_video_tracks` convierte con `pct_bbox_to_px(x, y, w, h, img.width,
img.height)` antes de escribir la anotación (`store/videos.rs`, `commands/video_commands.rs`). Los
proyectos ya consolidados se arreglan en `io::migrate_v1_baked_bboxes_to_pixels`: recalcula la
interpolación en porcentaje de cada track sobre cada fotograma y reescala solo las anotaciones que
coinciden numéricamente con lo que habría escrito el bake antiguo, así que lo anotado a mano no se
toca. Tests: `migration_v1_rescales_baked_bboxes_to_pixels`,
`migration_v1_leaves_projects_without_videos_alone`, `pct_bbox_to_px_scales_by_frame_size`.

## V2. El bake destruye anotaciones manuales y de inferencia del frame

**Dónde.** `video_commands.rs:719` — `img.annotations = new_annotations`, con el comentario
«video frames solo tienen anotaciones de bake».

**Qué implica.** La premisa del comentario no se cumple: los frames extraídos son `ImageEntry`
normales, aparecen en la galería, se pueden anotar a mano y son destino válido de la inferencia
ONNX (`source: "ai"`). Cualquiera de esas anotaciones desaparece al pulsar Consolidar, sin aviso ni
deshacer. Peor, el borrado es selectivo: un frame donde ningún track produce caja conserva lo que
tuviera (`:716-718`), así que dentro del rango de un track se pierde el trabajo manual y fuera no.

**Corrección aplicada.** `AnnotationEntry` gana `track_id: Option<String>`. El bake quita solo las
anotaciones con `track_id` y añade las nuevas; lo anotado a mano o por inferencia se conserva. Si un
track desaparece y el fotograma se queda sin nada, vuelve a `pending`.

## V3. Las anotaciones interpoladas se marcan como `source: "user"`

**Dónde.** `video_commands.rs:711`.

**Qué implica.** Una caja interpolada entre dos keyframes distantes 30 frames es una estimación
lineal, no una etiqueta humana. Al marcarse `user` queda indistinguible de la verdad de referencia
real, y no hay forma de medir qué fracción del dataset es sintética ni de excluirla en una
evaluación. Para un proyecto con un preprint publicado que apunta al repo, es un problema de
trazabilidad del dataset, no solo de higiene.

**Corrección aplicada.** Las anotaciones de consolidación llevan `source: "track"` y el `trackId`
del track de origen.

## V4. `currentFrameIndex` es un índice de array, pero el bake usa `frame_index`

**Dónde.** `useVideoNavigation.ts:14-23` define `currentFrameIndex` como posición dentro del array
`frames`, y ese valor es el que `useVideoAnnotationBridge.ts:130` persiste como `frameIndex` del
keyframe. `video_commands.rs:697` consolida contra `img.frame_index`, el índice real de extracción.
`images.rs:437` ordena por `frame_index`, así que ambos coinciden **solo si la secuencia está
completa y sin huecos**.

**Qué implica.** Basta borrar un frame desde la galería, o que una extracción quede a medias, para
que ambos índices se desalineen: los keyframes marcados en el frame N se consolidan en el frame N+k.
La desviación crece con cada hueco anterior y es silenciosa.

**Corrección aplicada.** `useVideoNavigation` distingue `position` (posición en el array, que es
lo que mueven los botones y la barra) de `currentFrameIndex` (el `frameIndex` real, que es lo que se
guarda en los keyframes), con un mapa `frameIndex → posición`. La línea de tiempo coloca los rombos
de keyframe traduciendo por ese mapa, y el contador muestra el `frameIndex` real entre paréntesis
cuando difiere de la posición.

## V5. Tres definiciones distintas de «qué frames cubre un track»

**Dónde.**
- Editor: `interpolation.ts:76-95` extiende (hold) el keyframe más cercano fuera del rango.
- Bake: `video_commands.rs:768` devuelve `None` sin `prev` o sin `next` — no extrapola.
- Contador de la UI: `VideoView.tsx:49-61` cuenta solo el intervalo `[min, max]` de keyframes.

**Qué implica.** Los frames anteriores al primer keyframe y posteriores al último se muestran
anotados en el lienzo y no generan nada al consolidar. El usuario ve cajas que no llegan al dataset.
El contador del botón sí acierta, con lo cual el número y el lienzo se contradicen entre sí.
`docs/subsistema-video.md:87-88` ya describe la diferencia, pero como comportamiento, no como
defecto.

**Corrección aplicada.** El editor deja de extrapolar: `interpolation.ts` exige vecino a ambos
lados, igual que el backend, y ambas implementaciones lo dicen en un comentario que apunta a la
otra. El contador del botón cuenta fotogramas que existen de verdad, no un rango de enteros. Tests:
`interpolate_bbox_does_not_extrapolate`, `interpolate_bbox_is_linear_between_keyframes`,
`interpolate_bbox_returns_exact_keyframe`, `interpolate_bbox_disabled_extreme_disables_span`.

## V6. Borrar una caja interpolada no hace nada visible

**Dónde.** `useVideoAnnotationBridge.ts:161-172` — `deleteAnnotation` llama a `removeKeyframe(trackId,
frameIndex)`.

**Qué implica.** Si el frame actual no tiene keyframe propio, `delete_keyframe` (`videos.rs:381`)
no encuentra nada que quitar, devuelve `Ok(())` y la caja sigue ahí (se vuelve a interpolar). El
usuario pulsa Supr y no pasa nada. Lo mismo con el atajo de teclado de `VideoView.tsx:143-151`, que
además borra el keyframe del *primer* track que tenga uno en ese frame, no el de la caja
seleccionada.

**Corrección aplicada.** `deleteAnnotation` del puente hace lo que el usuario ve: si la caja es un
keyframe y es el único del track, borra el track; si tiene hermanos, borra ese keyframe; si es
interpolada, crea un keyframe deshabilitado para que desaparezca de ese fotograma. El atajo se
movió a `VideoAnnotationCanvas`, que es quien conoce la selección, y opera sobre la caja
seleccionada.

## V7. Los mutadores fallan en silencio cuando el video o el track no existe

**Dónde.** Todo `videos.rs`: `create_track:250`, `update_track:283`, `set_keyframe:334`,
`delete_keyframe:381`, `toggle_keyframe_enabled:398`, `update_video_status:196`. Todos tienen la
forma `if let Some(v) = … { … }` y devuelven `Ok(())` cuando el `if let` no entra.

**Qué implica.** Una escritura contra un id inexistente —una carrera con un borrado, un id antiguo
tras recargar, un peer desincronizado— se reporta como éxito. El frontend muestra el cambio
aplicado y no lo está. Aplica igual a `save_ts_annotations` (`timeseries.rs:104`).

**Corrección aplicada.** `videos.rs` usa `with_project_mut_ret` y un `TrackLookup` que distingue
«no existe el video» de «no existe el track», y devuelve `Err` con el id concreto. `delete_keyframe`
y `toggle_keyframe_enabled` también fallan si no había keyframe en ese fotograma. `set_keyframe`
rechaza además coordenadas no finitas, que serde no puede serializar. Lo mismo en
`save_ts_annotations` y `delete_timeseries`.

## V8. `set_keyframe` devuelve un identificador que no persiste

**Dónde.** `videos.rs:329` genera `kf_id` con `Uuid::new_v4()`, nunca lo guarda en el
`KeyframeEntry` (que no tiene campo `id`) y lo devuelve en `:366`.

**Qué implica.** El id que recibe el frontend no referencia nada. `VideoKeyframe.id` (`db.ts:396`)
sugiere lo contrario. Ruido que invita a construir sobre una referencia inválida.

**Corrección aplicada.** `set_keyframe` devuelve `()`; el tipo `VideoKeyframe` pierde `id` y
`trackId`, que tampoco existían en el backend.

## V9. `trackUuid` se recibe, se descarta y se declara obligatorio en el tipo

**Dónde.** `create_track` acepta `_track_uuid` y lo ignora (`videos.rs:243`); `TrackEntry` no lo
guarda y `TrackResponse` no lo devuelve. El frontend genera uno con `crypto.randomUUID()`
(`useVideoTracks.ts:23`) y lo envía. `VideoTrack.trackUuid` (`db.ts:388`) es obligatorio, e
`InterpolatedBBox.trackUuid` (`:408`) se rellena con `track.trackUuid` —siempre `undefined`—
en `interpolation.ts:22`.

**Corrección aplicada.** Fuera el parámetro `track_uuid` del comando, el `crypto.randomUUID()` del
frontend y el campo `trackUuid` de `VideoTrack` e `InterpolatedBBox`. El id del track es el que
genera el backend.

## V10. La extracción no se puede cancelar y una fallida se reintenta en cada arranque

**Dónde.** `video_commands.rs:178-224` (`resume_pending_extractions`) busca todo video en estado
`extracting` al iniciar la app y relanza. No hay comando de cancelación ni bandera de aborto dentro
de `do_extract_frames`.

**Qué implica.** Si la extracción aborta por un error de decodificación (`:437`, `:441`, `:446`
propagan con `?`), el estado queda en `extracting` para siempre y el intento se repite en cada
arranque, volviendo a fallar. Un video de una hora a 5 fps tampoco se puede parar una vez lanzado.
Nada impide además lanzar `extract_video_frames` dos veces sobre el mismo video, ni que el resume
automático colisione con una extracción manual: ambas escriben frames con el mismo `frame_index`.

**Corrección aplicada.** `AppState` lleva el registro de extracciones en curso:
`begin_extraction` reserva el video y devuelve `false` si ya hay una —lo que impide la carrera entre
el resume del arranque y una pulsación del usuario—, `cancel_extraction` marca la parada y el bucle
de decodificación la comprueba en cada fotograma. El comando nuevo es `cancel_video_extraction`, con
botón en el aviso de progreso. Una extracción cancelada deja el video en `pending` y conserva lo
extraído; una fallida lo deja en `error`, así que el resume automático ya no la reintenta en cada
arranque.

## V11. Frames huérfanos en disco tras un fallo a mitad de extracción

**Dónde.** `video_commands.rs:229` — flush a `project.json` cada 50 frames
(`BATCH_FLUSH_SIZE`), pero la imagen y su thumbnail se escriben a disco por frame (`:378`, `:388`).

**Qué implica.** Un corte deja hasta 49 imágenes y 49 thumbnails en `images/` y `thumbnails/` que
no están en `project.json`. No los limpia nada: ni el resume (que cuenta por `pf.images`, `:141`) ni
`delete_video` (`videos.rs:209-227`, que solo borra lo referenciado). Ocupan espacio de forma
indefinida.

**Corrección aplicada.** `cleanup_orphan_frames` corre antes de cada extracción o reanudación:
borra los archivos de fotograma de ese video que no están en `project.json` (los identifica por el
patrón `_{video_id}_frame_` del nombre) y los thumbnails que no corresponden a ninguna imagen del
proyecto.

## V12. Sin validación de `fps_extraction` en el backend

**Dónde.** `video_commands.rs:311` — `pts_interval = (pts_per_second / fps_extraction) as i64`.

**Qué implica.** El diálogo hace `Math.max(1, …)` (`VideoUploader.tsx:161`) pero `max={60}` es solo
una pista de la UI, y el comando es invocable directamente. Con `fps_extraction = 0` el intervalo
se satura a `i64::MAX` y se extrae un único frame; con un valor enorme se extraen todos los frames
del video. Ninguno de los dos casos se rechaza.

**Corrección aplicada.** `validate_fps` acota a [0,01, 240] y rechaza no finitos, tanto en
`upload_video` como al arrancar la extracción.

## V13. Otros

- `VideoUploader.tsx:69-83`: si `extractFrames` lanza, `unlisten()` no se ejecuta — el listener del
  evento de progreso queda vivo hasta recargar.
- `VideoView.tsx:66-75`: `handleBake` no captura errores; un bake fallido no muestra nada.
- `useVideoAnnotationBridge.ts:128` y `:184`: `await new Promise(r => setTimeout(r, 50))` tras crear
  un track — una espera arbitraria en lugar de encadenar con el resultado real. Con el disco lento
  o un proyecto grande, el keyframe puede llegar antes de que el track esté disponible.
- `pxToPct` divide por `imageWidth` (`:70`); con la imagen aún sin cargar es 0 y se persisten
  `Infinity`/`NaN`, que `serde_json` no puede serializar.
- El interpolador del backend (`video_commands.rs:762-764`) asume `keyframes` ordenado. Lo garantiza
  `set_keyframe`, pero no un `project.json` editado a mano ni una futura ruta de importación.
- Los tracks solo existen si `project.type === 'bbox'` (`VideoView.tsx:44`). Video con polígonos,
  keypoints u OBB cae al lienzo de imagen normal, sin tracking.
- Cero tests: no hay ninguno sobre `interpolate_bbox`, `bake_video_tracks` ni `set_keyframe`
  (`tests.rs`). V1 lo habría detectado un test de extremo a extremo del bake.

**Corrección aplicada.** El listener del progreso se suelta en el `finally`; `handleBake` captura el
error y lo muestra bajo el botón; fuera las esperas de 50 ms del puente (el `trackId` que devuelve
`createTrack` basta para encadenar); `pxToPct` devuelve `null` sin dimensiones de imagen en vez de
persistir `Infinity`; el interpolador ordena los keyframes antes de usarlos, en los dos lados.
Siguen en pie, como límites conocidos y no como defectos: los tracks solo existen en proyectos
`bbox`, y video con polígonos o keypoints se anota fotograma a fotograma.

---

# Parte 2 — Series temporales

## T1. Callejón sin salida: se anota, pero no se puede exportar ni entrenar

**Dónde.** `formatMapping.ts:164-174` devuelve `[]` para los nueve tipos de serie temporal.
`export_dataset` (`export/mod.rs`) solo recorre imágenes; ningún exportador lee `pf.timeseries`.
El pipeline de entrenamiento (`training/dataset.rs`) tampoco lo contempla.

**Qué implica.** El usuario importa un CSV, anota puntos, rangos, eventos y anomalías, y no hay
ninguna salida del programa: las anotaciones solo existen dentro de `project.json`. Nueve de los
veinte tipos de proyecto ofrecidos terminan en un callejón sin salida.

**Corrección aplicada.** `export/timeseries_export.rs` añade dos formatos, ofrecidos ahora en los
nueve tipos junto a `.tix`:

- `timeseries-csv`: un CSV por serie (`timestamp`, una columna por variable, `label`), más
  `annotations.csv` con todas las anotaciones en bruto y `classes.csv`.
- `timeseries-json`: un JSON por serie con los datos y sus anotaciones juntos.

La etiqueta por punto sale de las anotaciones: un rango cubre su intervalo, punto/evento/anomalía
marcan su marca de tiempo, y la clasificación etiqueta la serie entera. Los huecos salen como celda
vacía, que pandas lee como NaN.

De paso: `prepare_timeseries_dataset` (`training/dataset.rs`) esperaba `{columns, rows}` o un array
de objetos, dos formas que el programa nunca ha generado, así que el CSV de entrenamiento salía
vacío para cualquier serie real. Ahora lee el formato que produce el importador y escribe la misma
columna `label`. Tests: `timeseries_csv_export_labels_points_and_keeps_gaps`,
`timeseries_export_rejects_project_without_series`.

## T2. No hay forma de anotar un proyecto de clasificación de series

**Dónde.** `TSAnnotationTool` (`useTSAnnotations.ts:9`) ofrece `point | range | event | anomaly |
select`. El tipo `'classification'` existe en `TimeSeriesAnnotation` (`db.ts:200`) con su
`ClassificationAnnotation` (`:224`), pero ninguna herramienta lo produce y el lienzo no lo pinta
(`TimeSeriesCanvas.tsx:147-205`).

**Qué implica.** `timeseries-classification` —etiqueta global de la serie, el caso más común— no
tiene interfaz. Y no hay filtrado de herramientas por tipo de proyecto, al contrario que en imagen
(`toolsConfig.ts:37`): las cinco herramientas se ofrecen idénticas para clustering, imputación,
previsión y regresión, donde la mayoría no tiene sentido.

**Corrección aplicada.** `useTSAnnotations` expone `setSeriesClassification` y
`seriesClassification`; la barra de herramientas muestra un selector de clase para la serie completa
cuando el tipo de proyecto lo usa, y una clasificación nueva reemplaza la anterior en vez de
acumularse. `timeseries/utils/tsToolsConfig.ts` define qué herramientas ofrece cada uno de los nueve
tipos, con el mismo papel que `toolsConfig.ts` en imagen. Atajo nuevo `ts-tool-classification` (C).

## T3. Las anotaciones que no caen en un timestamp exacto desaparecen del gráfico

**Dónde.** `TimeSeriesCanvas.tsx:155`, `:170-171`, `:186`, `:199` — todas las ramas de pintado
resuelven la posición con `data.timestamps.indexOf(ann.data.timestamp)` y omiten la anotación si
devuelve `-1`.

**Qué implica.** La comparación es de igualdad exacta entre `f64`. Al anotar el valor viene del
propio array (`:229`), así que normalmente coincide; pero cualquier anotación llegada por otra vía
—una importación, una edición del JSON, un cambio en el CSV de origen— se vuelve invisible sin
mensaje, aunque siga contando en el panel lateral y en el contador de la barra. Además es O(n) por
anotación en cada render: con 100 anotaciones sobre una serie de 100 000 puntos son 10⁷
comparaciones por fotograma de interfaz.

**Corrección aplicada.** Un `Map<timestamp, índice>` memoizado resuelve la posición, y cuando la
marca no cae sobre un punto se usa el más cercano en vez de descartar la anotación.

## T4. Las anotaciones de la primera clase se pintan grises

**Dónde.** `TimeSeriesCanvas.tsx:151` — `const classColor = ann.classId ? … : '#666'`.

**Qué implica.** `save_classes` (`projects.rs:266-267`) asigna los ids por posición, así que la
clase 0 siempre existe. Con `classId === 0` la comprobación de veracidad falla y la anotación se
pinta del gris por defecto en lugar del color de su clase. Debe ser `ann.classId != null`.

**Corrección aplicada.** Es lo que hace ahora.

## T5. Las anomalías se pintan siempre en `y = 0`

**Dónde.** `TimeSeriesCanvas.tsx:200`.

**Qué implica.** El marcador rojo se dibuja en el cero del eje, no sobre el valor anómalo. En una
serie que no pasa por cero (temperaturas, precios) el punto queda fuera del área visible del
gráfico. `AnomalyAnnotation` no guarda el valor, solo `score` (`db.ts:234-238`).

**Corrección aplicada.** `AnomalyAnnotation` gana `value?`, que se rellena al marcar con el valor
del punto; al pintar se usa ese valor, y si falta, el de la serie en ese instante.

## T6. El parser de CSV rechaza las series con fechas y silencia los errores de datos

**Dónde.** `csv_commands.rs:34-124`.

**Qué implica.** Tres problemas encadenados:

1. El timestamp se parsea solo como `f64` (`:88`); las filas que no lo consiguen se saltan
   (`continue`). Un CSV con `2026-01-15` o `2026-01-15T10:00:00Z` —el formato dominante en series
   temporales— pierde todas las filas y falla con «No valid data rows found in CSV», sin explicar
   la causa real.
2. Los valores no numéricos se convierten en `0.0` (`:94`), no en un hueco. Una celda vacía o `NA`
   entra al dataset como un cero real y contamina cualquier estadística posterior.
3. El troceo es `split(delimiter)` plano (`:84`), sin las comillas de RFC 4180. Un campo
   `"Madrid, ES"` rompe el conteo de columnas: `validate_csv` lo declara inválido, o `parse_csv`
   descarta la fila en `:86`.

Ninguno de los tres informa de cuántas filas se descartaron.

**Corrección aplicada.** `csv_commands.rs` reescrito sobre el crate `csv` (ya estaba en
`Cargo.toml`):

- Comillas y delimitadores según RFC 4180; una fila irregular se descarta y se cuenta, en vez de
  invalidar el archivo entero.
- La columna de tiempo se detecta con una muestra de 20 filas: numérica, fecha (RFC-3339 y trece
  formatos habituales de pandas/Excel, convertidos a milisegundos UTC) o, si no hay ninguna
  utilizable, el número de fila.
- Los valores no numéricos entran como `null` —hueco— y no como `0.0`.
- `CSVParseReport` devuelve filas descartadas por formato, por marca de tiempo ilegible, valores
  ausentes y el formato de tiempo detectado; el importador lo muestra tras importar.
- Tope de 256 MB por archivo.

Tests: `parse_csv_accepts_iso_dates`, `parse_csv_accepts_datetime_with_time`,
`parse_csv_keeps_numeric_timestamps`, `parse_csv_respects_quoted_fields`,
`parse_csv_reports_missing_values_as_gaps`, `parse_csv_reports_dropped_rows`,
`parse_csv_falls_back_to_row_index_without_time_column`, `validate_csv_accepts_quoted_commas`.

## T7. Serie completa dentro de `project.json`, reescrito entero en cada anotación

**Dónde.** `project_file.rs:146` guarda `data: serde_json::Value` con los arrays completos.
`useTSAnnotations.ts:71` reenvía **todo** el array de anotaciones en cada alta, edición o borrado, y
`io.rs` serializa y reescribe el `project.json` completo.

**Qué implica.** Con una serie de 500 000 puntos, cada clic que coloca una anotación reserializa
esos 500 000 puntos a disco. La imagen equivalente vive como archivo aparte y solo su metadato entra
en el JSON; las series no. Escala mal por diseño y la latencia crece con el tamaño de los datos, no
con el de la anotación.

**Corrección aplicada.** Los datos viven en `timeseries/{id}.json` (escritura atómica) y
`project.json` guarda solo metadatos, anotaciones y un resumen (`pointCount`, `seriesCount`,
`columns`) con el que la galería se pinta sin abrir ni una serie. `list_timeseries` ya no devuelve
datos; `get_timeseries` los lee del archivo. Migración v2→v3 automática. Tests:
`migration_v2_moves_timeseries_data_to_files`, `describe_data_counts_points_and_series`.

## T8. Escrituras con estado obsoleto: anotar rápido pierde anotaciones

**Dónde.** `useTSAnnotations.ts:56-70` — `addAnnotation` construye `[...annotations, nueva]` sobre
el `annotations` capturado en el closure y lo envía entero.

**Qué implica.** Dos anotaciones creadas antes de que la primera resuelva parten del mismo array
base: la segunda escritura pisa la primera. `updateAnnotation` y `deleteAnnotation` tienen el mismo
patrón. No es hipotético: `saveAnnotations` reescribe el `project.json` completo (T7), con lo cual
la ventana de la carrera se abre más cuanto mayor es la serie.

**Corrección aplicada.** Todas las mutaciones pasan por un `mutate(transform)` que calcula la lista
nueva desde `setAnnotations(prev => …)` y encadena los guardados en una cola, de modo que dos
escrituras en vuelo no se pisan.

## T9. La interfaz de series no escucha sus propios eventos

**Dónde.** El backend emite `db:timeseries-changed` en las cuatro rutas de `timeseries_commands.rs`.
Del lado del frontend solo lo escucha `useClassCounts.ts:50`. `useTimeSeries.ts:29` y
`useCurrentTimeSeries.ts:31` recargan con un `useEffect` manual sobre el id.

**Qué implica.** Al contrario que video, que usa `useTauriQuery` con sus eventos
(`useVideoTracks.ts:16`), las vistas de series no se refrescan ante un cambio externo. El evento se
emite y nadie lo aprovecha.

**Corrección aplicada.** `useTimeSeries` y `useCurrentTimeSeries` pasan a `useTauriQuery` con
`db:timeseries-changed`.

## T10. P2P no sincroniza ni series temporales ni videos

**Dónde.** `p2p/sync.rs:418-419` — el `ProjectFile` que se arma al unirse a una sesión fija
`timeseries: vec![]` y `videos: vec![]`.

**Qué implica.** Un peer que entra a un proyecto de series temporales recibe un proyecto vacío; en
uno de video recibe los frames como imágenes sueltas, sin tracks ni keyframes, y al consolidar
sobrescribe lo que el anfitrión hubiera consolidado. Nada en la interfaz advierte de la limitación,
y los permisos P2P sí se comprueban en todos esos comandos (`timeseries_commands.rs:20`,
`video_commands.rs:534`), lo que sugiere que la cobertura se dio por hecha.

**Corrección aplicada.** El documento iroh gana tres familias de claves: `videos/{id}/meta`,
`videos/{id}/tracks` y `timeseries/{id}/{meta,data,annots}`. Los fotogramas viajan como imágenes
normales, con `videoId`/`frameIndex` en su meta, que es lo que necesita el peer para anotar el video
que la distribución de trabajo le asigna (el archivo de video en sí no viaja: son cientos de MB y se
anota sobre los fotogramas). `project_to_doc` publica todo eso al abrir sesión, `doc_to_project` lo
reconstruye al unirse —escribiendo los datos de cada serie a su archivo—, y el watcher aplica en
vivo los cambios de tracks y de series. Los comandos de track y de serie publican al doc tras cada
mutación, con el mismo patrón que `sync_annotations_to_doc`.

## T11. Otros

- `timeseriesService.ts:17-23`: `create` descarta el parámetro `annotations`, que el backend sí
  acepta (`timeseries_commands.rs:17`). Importar una serie ya anotada es imposible.
- `CSVImporter.tsx:63` y `:94`: usa `alert()`, que bloquea el webview; el proyecto ya tiene
  `@/lib/dialogs` para esto y lo usa en `TimeSeriesGallery.tsx:26`.
- `CSVImporter.tsx:74`: `fileName.replace('.csv', '')` reemplaza la primera aparición en cualquier
  posición, no la extensión — `datos.csv.backup.csv` queda como `datos.backup.csv`.
- `CSVImporter.tsx:89` llama a `reload()` después de `addTimeSeries`, que ya recarga
  (`useTimeSeries.ts:38`): dos lecturas completas por importación.
- `csv_commands.rs:35`: `read_to_string` carga el CSV entero en memoria sin tope de tamaño, y de ahí
  pasa íntegro a `project.json` (T7).
- `timeseries.rs:104-115`: `save_ts_annotations` no comprueba que la serie exista (mismo defecto que
  V7), y deja `status: "annotated"` con la lista vacía si el remapeo de clases se llevó por delante
  todas las anotaciones.
- Cero tests de `parse_csv`, `validate_csv` y del ciclo de anotaciones de serie temporal.

**Corrección aplicada.** Los ocho puntos: `create` acepta y reenvía las anotaciones; los `alert()`
pasan a mensajes dentro del propio importador (y el informe de importación se muestra ahí);
`stripCsvExtension` usa `/\.csv$/i`; fuera el `reload()` redundante —el evento ya recarga—; tope de
256 MB en el CSV y datos fuera de `project.json`; `save_ts_annotations` devuelve `Err` si la serie no
existe y `save_classes` devuelve la serie a `pending` si el remapeo la dejó sin anotaciones; y los
tests citados arriba.

---

# Estado de las correcciones

| Hallazgo | Qué era | Estado |
|---|---|---|
| V1 | Bake escribía porcentajes como píxeles | Corregido + migración v1→v2 |
| V2 | Bake destruía anotaciones manuales y de IA | Corregido (`trackId`) |
| V3 | Interpolado marcado como `user` | Corregido (`source: "track"`) |
| V4 | Índice de array usado como `frameIndex` | Corregido |
| V5 | Tres criterios de cobertura de track | Unificado en uno |
| V6 | Borrar una caja interpolada no hacía nada | Corregido |
| V7 | Mutadores con éxito falso | Devuelven `Err` |
| V8 | `set_keyframe` devolvía un id fantasma | Devuelve `()` |
| V9 | `trackUuid` recibido y descartado | Eliminado |
| V10 | Extracción sin cancelar, reintento infinito | Cancelación + estado `error` |
| V11 | Fotogramas huérfanos en disco | `cleanup_orphan_frames` |
| V12 | `fps_extraction` sin validar | `validate_fps` |
| V13 | Listener fugado, bake sin error, esperas fijas | Corregido |
| T1 | Series sin ninguna exportación | Dos formatos nuevos + dataset arreglado |
| T2 | Clasificación de serie sin interfaz | Herramienta + config por tipo |
| T3 | Anotaciones invisibles por igualdad exacta | Mapa + punto más cercano |
| T4 | Clase 0 pintada de gris | Corregido |
| T5 | Anomalías pintadas en y=0 | Sobre su valor real |
| T6 | CSV sin fechas, sin comillas, ceros inventados | Parser reescrito + informe |
| T7 | Serie entera reescrita por anotación | Datos en archivo propio (v3) |
| T8 | Escrituras perdidas por estado obsoleto | Actualizador funcional + cola |
| T9 | Vistas de series sin escuchar sus eventos | `useTauriQuery` |
| T10 | P2P sin video ni series | Claves nuevas en el doc iroh |
| T11 | Ocho detalles menores | Corregidos |

Cobertura nueva: 26 tests en `src-tauri/src/tests.rs` (110 en total, todos en verde). La lógica de
la consolidación se extrajo a `bake_annotations_for_frame` (`store/videos.rs`) para poder probarla
sin `AppState`; entre sus tests está el invariante que V1 rompía:
`baked_bbox_normalizes_to_the_same_fraction_as_the_keyframe` comprueba que una caja consolidada, al
normalizarse para YOLO, recupera la misma fracción del fotograma que declaraba el keyframe.
