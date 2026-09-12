# Subsistema de video

Revisión del 2026-09-10.

## Modelo de datos

Todo reside dentro de `project.json`.

```
VideoEntry           id, name, file, fps_extraction, fps_original,
                     total_frames, duration_ms, width, height, uploaded, status
 └ tracks[]          TrackEntry:    id, class_id, label, enabled
     └ keyframes[]   KeyframeEntry: frame_index, bbox_x, bbox_y,
                                    bbox_width, bbox_height, is_keyframe, enabled
```

Los fotogramas no son un tipo aparte: son `ImageEntry` del proyecto con dos campos poblados,
`video_id` y `frame_index` (`project_file.rs:99-102`). Por eso aparecen en la galería y entran en
exportación y entrenamiento como cualquier otra imagen.

`frame_index` es el número de fotograma **muestreado** (0, 1, 2…), no el índice del fotograma
original del video. Keyframes, interpolación y consolidación trabajan en ese espacio.

Las cajas de keyframe se guardan en **porcentaje 0–100** del ancho y alto de la imagen. El puente
al lienzo las convierte a píxeles al mostrarlas y de vuelta a porcentaje al guardarlas
(`useVideoAnnotationBridge.ts:57-77`). La consolidación las convierte a píxeles con
`pct_bbox_to_px` (`store/videos.rs`), porque una `AnnotationEntry` de tipo `bbox` está en píxeles
en todo el resto del programa.

`KeyframeEntry` no tiene identificador propio: la clave es `frame_index` dentro del track, y es
también el criterio de borrado.

## Sondeo del archivo

`get_video_info` (`video_commands.rs:14`) abre el contenedor con `ffmpeg-the-third`, toma el mejor
stream de video y lee ancho, alto y fps desde `avg_frame_rate`, con 30 como respaldo si el
denominador es cero.

## Extracción de fotogramas

`do_extract_frames` (`video_commands.rs:242`) corre en `spawn_blocking` y decodifica el video en un
solo pase:

1. Marca el video como `extracting` y emite `db:videos-changed`.
2. Crea el decodificador y un escalador a RGB24 con filtro bilineal.
3. Muestrea en dominio de PTS:
   ```rust
   let pts_per_second = time_base_den / time_base_num;
   let pts_interval   = (pts_per_second / fps_extraction) as i64;
   ```
   Descarta los fotogramas con `pts < next_pts`; al aceptar uno hace `next_pts = pts + pts_interval`,
   reanclando al PTS real del fotograma tomado en vez de a un ideal acumulado.
4. Copia el buffer RGB fila por fila descartando el relleno de *stride*, codifica al formato del
   proyecto (`jpg` o `webp`) y escribe a disco. Nombre:
   `{uuid}_{video_id}_frame_{contador:06}.{ext}`.
5. Genera miniatura de 256 px, siempre en JPG para uniformar con el resto de la galería.
6. Acumula las entradas en memoria y vuelca a `project.json` cada **50** fotogramas
   (`BATCH_FLUSH_SIZE`), en vez de reescribir el archivo por cada uno.
7. Emite `video:extraction-progress` como máximo cada 100 ms, con el porcentaje topado en 99; el
   total estimado es `duración_s × fps_extraction`. Al terminar emite un evento final con 100 que
   sobrescribe el limitado.
8. Vacía el decodificador con `send_eof`, hace el volcado final y marca el video `ready`.

## Reanudación

`resume_pending_extractions` (`video_commands.rs:183`) corre al iniciar la aplicación: recorre los
directorios de proyectos, busca videos que quedaron en `extracting` y relanza. El salto se calcula
contando las imágenes existentes con ese `video_id` y descartando esas primeras del contador. No
hace *seek*: el video se vuelve a decodificar entero; lo que se ahorra es la codificación y la
escritura de las que ya existen.

## Interpolación

Lineal entre el keyframe anterior y el siguiente, sobre las cuatro componentes de la caja:

```
t = (frame - prev.frame) / (next.frame - prev.frame)
x = prev.x + (next.x - prev.x) · t        (ídem y, width, height)
```

Hay dos implementaciones, con el mismo criterio:

- **Frontend** (`interpolation.ts`) — requiere vecino a ambos lados. El estado habilitado
  resultante es `prev.enabled && next.enabled`.
- **Backend** (`store/videos.rs`, `interpolate_bbox`) — requiere vecino a ambos lados; sin uno de
  ellos devuelve `None`. Si cualquiera de los dos extremos está deshabilitado devuelve
  `(0, 0, 0, 0, false)`, que la consolidación descarta.

Ninguna de las dos extrapola: fuera del intervalo `[primer keyframe, último keyframe]` de un track
no hay caja, ni en el editor ni en el dataset. El contador del botón de consolidar sigue el mismo
criterio y cuenta solo fotogramas que existen, no un rango de enteros.

## Consolidación (bake)

`bake_video_tracks` (`video_commands.rs:654`):

1. Lee los tracks una vez y precomputa los pares `(class_id, keyframes)` de los tracks habilitados
   con al menos un keyframe.
2. En un solo `with_project_mut` recorre las imágenes del proyecto, filtra las del video, e
   interpola cada track en el `frame_index` de cada una.
3. Convierte la caja de porcentaje a píxeles con el tamaño del fotograma y la pasa a
   `AnnotationEntry` de tipo `bbox`, con `source: "track"`, `trackId` del track de origen e
   identificador nuevo.
4. Quita del fotograma solo las anotaciones que tienen `trackId` —lo que puso un bake anterior— y
   añade las nuevas. Lo anotado a mano o por inferencia sobre el mismo fotograma se conserva.
   Si un track desapareció y el fotograma se queda sin ninguna anotación, vuelve a `pending`.
5. Emite `db:images-changed`. Devuelve el número de fotogramas consolidados.

`source: "track"` distingue lo interpolado de lo anotado por una persona, que es lo que permite
medir qué fracción de un dataset es sintética.

Los proyectos creados antes de la versión 3 del formato pasan por
`io::migrate_project`, que reescala a píxeles las cajas que un bake antiguo dejó en porcentaje.

## Flujo de trabajo del usuario

**Subir.** Botón de carga y selector nativo de archivo. La aplicación sondea el video y abre un
diálogo que muestra los fps originales y pide la tasa de extracción (5 por defecto), con la cuenta
estimada de fotogramas calculada en vivo. Al confirmar aparece una barra con «extrayendo fotograma
N de M» alimentada por el evento de progreso.

**Navegar.** La línea de tiempo inferior tiene reproducción, paso atrás y adelante, y un
multiplicador de velocidad que cicla entre 1x, 2x, 4x y 8x — la reproducción avanza un fotograma
cada 200 ms divididos por la velocidad, y se detiene sola al llegar al final. La barra se puede
pinchar o arrastrar para saltar a cualquier punto. A la derecha, el contador «Frame N / total».
Sobre la barra se dibujan rombos en la posición de cada keyframe, con el color de su clase.

**Anotar.** El flujo es por objeto, no por fotograma:

1. Se elige la clase con las teclas rápidas (`1`–`0`, `Q`–`P`).
2. `T` crea un track nuevo con esa clase. También se crea solo al dibujar la primera caja.
3. Se dibuja la caja sobre el objeto, lo que escribe un keyframe en el fotograma actual.
4. Se avanza a otro fotograma y se mueve o redimensiona la caja: eso escribe otro keyframe ahí.
   Entre ambos, la caja se interpola sola.
5. Se repite solo en los puntos donde el objeto cambia de trayectoria.

Las cajas interpoladas son editables igual que las de keyframe: tocar una convierte ese fotograma
en keyframe. Durante el arrastre la caja se mueve con estado local para que sea fluida y se
persiste al soltar. `Supr` borra el keyframe del fotograma actual.

**Ocultar un objeto en un tramo.** El icono de ojo sobre una caja la marca deshabilitada en ese
fotograma; si no había keyframe ahí, primero lo crea. Los tramos deshabilitados no producen
anotaciones al consolidar, que es la forma de manejar un objeto que sale de cuadro y vuelve.

**Panel de tracks.** Lista lateral con un punto del color de la clase, la etiqueta, el contador de
keyframes (`12kf`), un rombo cuando hay keyframe en el fotograma actual, un ojo para mostrar u
ocultar el track completo y una papelera para borrarlo. Los tracks ocultos se ven atenuados.

**Consolidar.** El botón de bake convierte todos los tracks habilitados en anotaciones por
fotograma y devuelve cuántos fotogramas se anotaron. A partir de ahí esos fotogramas son imágenes
anotadas normales del proyecto.

**Atajos en la vista de video:** `1`–`0` y `Q`–`P` para clase, `T` para track nuevo, `H` y `B`
para desplazamiento y caja, `PageUp` / `PageDown` para fotograma anterior y siguiente, `Supr` para
borrar el keyframe actual.

## Componentes del frontend

| Archivo | Función |
|---|---|
| `VideoView.tsx` | composición de la vista y manejo de teclado |
| `VideoAnnotationCanvas.tsx` | dibujo sobre el fotograma actual |
| `VideoTimeline.tsx` | línea de tiempo, reproducción, velocidad, marcas de keyframe |
| `VideoTrackList.tsx` / `VideoTrackItem.tsx` | panel de tracks |
| `VideoUploader.tsx` | selección de archivo, diálogo de fps, progreso |
| `VideoCard.tsx` | tarjeta del video en el listado del proyecto |
| `useVideoNavigation.ts` | fotograma actual y desplazamiento |
| `useVideoTracks.ts` | CRUD de tracks y keyframes |
| `useInterpolation.ts` | cajas del fotograma actual |
| `useVideoFrames.ts` | listado de fotogramas |
| `useVideoAnnotationBridge.ts` | puente entre el lienzo de imagen y el sistema de tracks |
| `useCurrentVideo.ts` | video activo |
