# Modo estudio

Registro local de eventos de uso para alimentar un estudio experimental sobre
el flujo de trabajo de Annotix. Se activa desde **Configuración → Modo estudio**
y está apagado por defecto.

Este documento es normativo: un test de Rust
(`study::tests::documentacion_cubre_todos_los_eventos`) falla si el código emite
un evento que no está aquí, o si aquí aparece un evento que el código no conoce.

## Propósito y garantías

Qué se registra:

- Qué paso del flujo está activo y cuánto dura.
- Qué herramienta se usa, cuántos ajustes hay antes de confirmar una anotación
  y si la anotación vino de una propuesta asistida.
- Tiempos de entrenamiento, inferencia e importación/exportación.
- Períodos de inactividad y errores mostrados, por categoría.
- Dominio y propósito de cada petición de red saliente.
- Una huella de hardware y sistema operativo.

Qué **no** se registra, por diseño:

- Ninguna ruta ni nombre de archivo.
- Ningún texto escrito por el usuario (nombres de proyecto, de clase, notas).
- Ninguna captura ni contenido de imagen, video, audio o serie temporal.
- Nada que identifique la máquina: sin número de serie, sin dirección MAC, sin
  nombre de equipo, sin nombre de usuario.
- Ningún identificador interno en claro: los de trayectoria de video viajan
  como hash.

El escritor aplica además una red de seguridad: rechaza cualquier valor de
texto del payload que contenga `/` o `\` o que pase de 128 caracteres.

Con el modo desactivado no se abre ni se crea ningún archivo, y `emit` retorna
de inmediato sin cruzar el puente hacia el backend.

## Archivos

```
<dir_datos_app>/study_logs/<session_id>_<inicioISO8601>.jsonl
```

En Linux, `<dir_datos_app>` es `~/.local/share/annotix`. Un archivo por sesión,
solo anexado: nunca se reescribe ni se trunca. Cada evento se escribe en una
sola llamada y se vacía al sistema de archivos en el acto, así que una muerte
del proceso deja como mucho una línea a medio escribir, y nunca corrompe las
anteriores.

Al arrancar, la aplicación revisa los archivos que quedaron sin cerrar y les
anexa un `session.end` con motivo `crash_recovered`, continuando la cadena.

## Formato de línea

Una línea JSON por evento. Los campos comunes, presentes en todos:

| campo | tipo | significado |
|---|---|---|
| `session_id` | texto | identificador de sesión elegido en configuración |
| `condition` | texto | etiqueta de condición experimental (puede ir vacía) |
| `seq` | entero | contador creciente desde 0, sin huecos |
| `t_mono_ms` | entero | milisegundos de reloj monotónico desde `session.start` |
| `t_wall` | texto | ISO 8601 UTC, solo referencial |
| `event` | texto | nombre del evento (tabla de más abajo) |
| `app_version` | texto | semver, y `+<hash corto de git>` si estaba disponible |
| `prev_hash` | texto | SHA-256 de la línea anterior completa; vacío en la primera |
| `hash` | texto | SHA-256 del propio evento sin el campo `hash` |
| `payload` | objeto | campos propios del evento |

Todas las duraciones del análisis se calculan con `t_mono_ms`; `t_wall` solo
sirve para situar la sesión en el calendario.

### Cadena de hash

El objeto del evento se serializa en JSON canónico —claves ordenadas
alfabéticamente, sin espacios— y el campo `hash` se **añade al final del texto**:

```text
{"app_version":…,"condition":…,…,"t_wall":…,"hash":"<sha256>"}
```

Verificar una línea es por lo tanto una operación puramente textual, sin
depender de cómo cada lenguaje serialice números u objetos:

1. Buscar la última aparición de `,"hash":"` en la línea.
2. Todo lo que está antes, más `}`, es el texto base.
3. `hash` es el SHA-256 hexadecimal de ese texto base.
4. `prev_hash` de la línea siguiente es el SHA-256 de la línea completa
   (sin el salto de línea final).

Editar, insertar o borrar una línea rompe la cadena a partir de ahí.

### Verificación

Desde la aplicación, el comando `study_log_verify(path)` recorre el archivo y
comprueba la cadena de hash, que `seq` empiece en 0 y crezca de uno en uno, que
`t_mono_ms` no retroceda y que todos los eventos pertenezcan a la taxonomía.
Devuelve el número de eventos, si hubo cola truncada y la lista de errores.

La herramienta de análisis hace la misma verificación en Python:

```bash
python3 tools/study_analysis/analyze.py ~/.local/share/annotix/study_logs/*.jsonl -o metrics.csv
```

## Exportación

**Configuración → Modo estudio → Exportar registros** abre el directorio de
sesiones. El comando `study_log_export(session_id, dest_dir)` copia los archivos
de una sesión a la carpeta elegida y escribe un `manifest.json` con, y solo con:
`session_id`, `condition`, `app_version`, número de eventos, `t_mono_ms` final,
el SHA-256 de cada archivo y el resultado de la verificación.

## Taxonomía de eventos

`payload` indica los campos adicionales al conjunto común.

### Sesión

| event | payload |
|---|---|
| `session.start` | `hardware` (ver más abajo), `os`, `os_version`, `screen_w`, `screen_h` |
| `session.end` | `reason` ∈ {`user`, `app_close`, `crash_recovered`} |

`hardware` contiene `cpu_model`, `cores_physical`, `cores_logical`,
`mem_total_mb`, `gpu_present`, `gpu_name`. Todo se obtiene del sistema local,
sin llamadas de red.

### Ciclo de vida del flujo

Cada evento lleva `project_kind` (tipo de proyecto de la plataforma) y
`modality` ∈ {`image_bbox`, `image_mask`, `image_point`, `video_track`,
`timeseries_event`, `other`}. La modalidad se deriva del tipo de proyecto; si
un proyecto mezcla modalidades, se usa la de la herramienta activa.

| event | payload |
|---|---|
| `project.create` | `project_kind`, `modality` |
| `project.open` | `project_kind`, `modality` |
| `data.import.start` | `n_items`; se emite con el primer progreso que trae el total, porque el número de elementos solo se conoce al abrir el archivo |
| `data.import.end` | `n_items`, `ok` |
| `annot.first` | sin campos; se emite una sola vez por sesión, junto al primer `annot.commit` |
| `annot.complete` | `n_items_annotated`; el usuario marca el conjunto como listo o inicia un entrenamiento con anotaciones |
| `train.start` | `backend`, `mode` ∈ {`local`, `package`, `remote`, `browser`}, `n_train`, `n_val`, `epochs_planned` |
| `train.epoch` | `epoch`, `duration_ms`, `mem_peak_mb` |
| `train.end` | `ok`, `duration_ms`, `epochs_done`, `error_class` |
| `export.start` | `format` |
| `export.end` | `ok`, `format`, `contract_valid` |

`error_class` es una categoría, nunca el mensaje de error. En `train.end` sale
de clasificar la salida de error del proceso (`oom`, `cuda`,
`missing_dependency`, `missing_file`, `permission`, `dataset`, `script`,
`runtime`, `cancelled`, `unknown`, o `none` cuando terminó bien).

`contract_valid` solo puede ser cierto al exportar un **modelo**: significa que
el artefacto existe, no está vacío y su extensión corresponde al formato
pedido. Al exportar un **dataset** se registra siempre `false`, porque un
dataset no pasa por el contrato de modelo; así, `completed_cycle` del análisis
nunca se activa por una exportación de datos.

### Pasos del flujo

| event | payload |
|---|---|
| `step.enter` | `step_id`, `modality` |
| `step.exit` | `step_id`, `duration_ms` |

`step_id` es un identificador estable, definido en un solo lugar
(`src-tauri/src/study/events.rs`, con espejo en `src/features/study/studySteps.ts`)
y nunca derivado de rutas de la interfaz ni de nombres de botones:

`create_project`, `import_data`, `configure_classes`, `annotate`,
`review_assisted`, `configure_training`, `train`, `evaluate`, `export`.

### Configuración declarativa

| event | payload |
|---|---|
| `config.change` | `scope` ∈ {`project`, `training`, `inference`, `annotation`}, `key`, `from_type`, `to_type`, `is_default_before`, `is_default_after` |

No se registran valores, solo el nombre del parámetro y si el valor era o no el
predeterminado. Única excepción: los parámetros numéricos de entrenamiento
`epochs`, `batch_size`, `learning_rate` e `image_size` sí registran `from` y `to`.

### Anotación

| event | payload |
|---|---|
| `tool.select` | `tool_id`, `modality` |
| `annot.commit` | `tool_id`, `modality`, `origin`, `duration_ms`, `n_edits` |
| `annot.delete` | `tool_id`, `modality`, `origin` |
| `assist.propose` | `n_proposals`, `latency_ms` |
| `video.keyframe.set` | `track_id_hash`, `frame_idx` |
| `video.keyframe.review` | `track_id_hash`, `frame_idx`, `changed` |
| `video.consolidate` | `n_tracks`, `n_frames_total`, `n_frames_keyed`, `n_frames_reviewed`, `n_frames_interpolated_unreviewed` |

`origin` ∈ {`manual`, `assisted_accepted`, `assisted_edited`, `assisted_rejected`}.
`duration_ms` se cuenta desde el `tool.select` o desde el `annot.commit`
anterior, lo que sea posterior. `n_edits` es el número de ajustes hechos antes
de confirmar. `track_id_hash` es el SHA-256 del identificador interno de la
trayectoria, nunca el identificador.

### Fricción

| event | payload |
|---|---|
| `idle.start` | sin campos; se emite tras 60 s sin entrada del usuario |
| `idle.end` | `duration_ms` |
| `help.open` | `topic_id` ∈ {`shortcuts`, `repository`, `tour`} |
| `error.shown` | `error_class` ∈ {`operation_failed`, `render_crash`}, `scope` = `step_id` activo (o `app` si no hay ninguno) |

La inactividad se detecta por ausencia de eventos de entrada (teclado, ratón,
rueda). No hay ninguna señal visible para el usuario.

### Red

| event | payload |
|---|---|
| `net.request` | `host`, `purpose`, `bytes_out`, `bytes_in`, `ok` |

`host` es solo el dominio, sin ruta, credenciales, puerto ni parámetros.
`purpose` ∈ {`update_check`, `model_weights`, `remote_training`, `collab_p2p`,
`remote_llm`, `other`}. `bytes_in` es el `Content-Length` que declara el
servidor, y vale 0 cuando la respuesta llega en trozos sin declararlo;
`bytes_out` se mide cuando el cuerpo va en JSON.

`remote_llm` no está en la lista original de la sección 3.7 del documento del
estudio: se agregó porque Annotix consulta modelos de lenguaje remotos para
generar frases de grabación guiada, y dejar ese tráfico como `other` habría
hecho fallar la auditoría, que es precisamente lo que esa sección busca evitar.

Todo el tráfico HTTP saliente pasa por `src-tauri/src/net/mod.rs`, que exige un
propósito explícito. Dos pruebas lo sostienen: una recorre el código y falla si
algún módulo construye su propio cliente HTTP, y otra falla si alguna petición
queda declarada como `other`. Quedan fuera de esta ruta, por no ser HTTP de la
aplicación: el transporte de la capa P2P, que se registra aparte en sus puntos
de sesión, y el navegador que controla la automatización, que navega por su
cuenta.

### Inferencia

| event | payload |
|---|---|
| `infer.run` | `backend`, `model_hash`, `n_items`, `latency_ms_p50`, `latency_ms_p95` |

`model_hash` es el SHA-256 del archivo de modelo, no su nombre ni su ruta.
`backend` es `onnx` para la ruta nativa y `torch` para la de Python. Los
percentiles se calculan por rango más cercano, el mismo criterio que usa la
herramienta de análisis.

## Qué no se pudo instrumentar

- **`assist.propose` en lotes**: solo se emite en la inferencia sobre una
  imagen, donde la propuesta y la espera del usuario coinciden. Una inferencia
  por lotes no es una propuesta que el usuario esté esperando, y emitir un
  evento por imagen distorsionaría la latencia del evento.
- **Tráfico del navegador de automatización**: la automatización conduce un
  Chrome real, que navega por su cuenta y no pasa por el cliente HTTP de la
  aplicación. Queda fuera de `net.request`.
- **`mem_peak_mb`**: se lee de `VmHWM` del proceso de entrenamiento, que solo
  expone Linux. En macOS y Windows se registra 0.

## Herramienta de análisis

`tools/study_analysis/analyze.py` produce un CSV por sesión con las métricas
del estudio. Ver `tools/study_analysis/README.md` para las columnas. Sus
pruebas generan un `.jsonl` sintético y son, de hecho, una segunda
implementación del formato: una prueba de Rust
(`study::tests::el_analizador_python_valida_un_archivo_real`) escribe un
archivo con el escritor real y comprueba que el analizador de Python lo valida,
de modo que las dos implementaciones no puedan separarse en silencio.
