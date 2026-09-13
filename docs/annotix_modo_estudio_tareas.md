# Annotix — Modo estudio: tareas de implementación

## Contexto para el agente

Annotix es una aplicación de escritorio (Rust + Tauri en la capa nativa, React + TypeScript en la interfaz) sin base de datos: cada proyecto vive en un único documento estructurado en disco con escritura atómica. Se necesita un **modo estudio** que, activado desde configuración, registre eventos de uso en un archivo local de solo anexado para alimentar un estudio experimental. El registro debe ser invisible para el usuario durante la sesión, no debe capturar contenido (nada de nombres de archivo, texto, rutas ni capturas), y no debe alterar ningún comportamiento de la aplicación.

Antes de tocar código: explora el repositorio, identifica dónde vive la configuración de usuario, el bus de eventos o el punto central de comandos Tauri, el ciclo de vida del entrenamiento, el motor de inferencia asistida, la anotación de video por trayectorias y el cliente de red. Propón la ubicación de cada componente nuevo antes de implementarlo.

Restricciones globales:
- No modificar la interfaz visible fuera de la pantalla de configuración.
- No introducir dependencias nuevas salvo que sea imprescindible; justificar cada una.
- Todo evento registrado debe corresponder a un evento de la lista de la sección 3. No agregar eventos ad hoc.
- Pruebas unitarias para cada componente nuevo.
- Documentar el esquema de eventos en `docs/` (o el directorio de documentación existente).

---

## Tarea 1 — Configuración del modo estudio

**Dónde:** pantalla de configuración existente.

Agregar una sección "Modo estudio" con:
- Interruptor de activación (por defecto desactivado).
- Campo `session_id` (texto, obligatorio al activar; alfanumérico y guiones, 3–32 caracteres).
- Campo `condition` (texto opcional, 0–32 caracteres; para etiquetar la condición experimental).
- Botón "Exportar registros" que abre el directorio donde se guardan los archivos de sesión.
- Texto fijo debajo del interruptor: "Registra eventos de uso y tiempos en un archivo local. No registra contenido, nombres de archivo ni capturas."

Criterios de aceptación:
- Con el modo desactivado no se escribe ningún archivo.
- Al activar sin `session_id` válido, el interruptor no se enciende y se muestra error inline.
- El estado (activado, `session_id`, `condition`) persiste entre reinicios de la aplicación.
- Al activar, se emite el evento `session.start`; al desactivar o cerrar la aplicación, `session.end`.

---

## Tarea 2 — Escritor de registro (backend Rust)

Implementar un módulo `study_log` con:

- Un archivo por sesión: `<dir_datos_app>/study_logs/<session_id>_<inicio_ISO8601>.jsonl`.
- Formato: una línea JSON por evento (JSON Lines). Solo anexado; nunca reescribir ni truncar.
- Escritura sincronizada con `flush` por evento o por lote de ≤ 1 s; no perder eventos si la aplicación se cierra abruptamente.
- **Cadena de hash:** cada línea incluye `prev_hash` (SHA-256 de la línea anterior completa; cadena vacía en la primera) y `hash` (SHA-256 del propio evento sin el campo `hash`). Permite verificar después que el archivo no fue editado.
- Marca temporal doble: `t_mono_ms` (reloj monotónico desde `session.start`, en milisegundos, entero) y `t_wall` (ISO 8601 UTC, solo referencial). Todas las duraciones se calculan con `t_mono_ms`.
- Campos comunes obligatorios en todo evento: `session_id`, `condition`, `seq` (entero creciente desde 0), `t_mono_ms`, `t_wall`, `event` (nombre), `app_version` (versión semántica + hash corto de git si está disponible), `prev_hash`, `hash`.
- Un comando Tauri `study_log_emit(event, payload)` invocable desde la interfaz, y una función Rust interna equivalente para eventos que se originan en el backend (entrenamiento, red, inferencia).
- Si el modo estudio está desactivado, `emit` retorna inmediatamente sin efectos.

Pruebas:
- Escritura de 10 000 eventos sin pérdida ni desorden de `seq`.
- Verificación de la cadena de hash sobre un archivo generado.
- Cierre abrupto simulado: el archivo queda con líneas completas (ninguna truncada).

Además: una utilidad de línea de comandos o comando Tauri `study_log_verify(path)` que recorre el archivo y valida la cadena de hash y la monotonía de `seq` y `t_mono_ms`.

---

## Tarea 3 — Taxonomía de eventos

Implementar exactamente estos eventos. `payload` indica los campos adicionales al conjunto común. Ningún campo de `payload` puede contener rutas, nombres de archivo, texto libre del usuario ni identificadores de pacientes.

### 3.1 Sesión
| event | payload |
|---|---|
| `session.start` | `hardware` (ver Tarea 4), `os`, `os_version`, `screen_w`, `screen_h` |
| `session.end` | `reason` ∈ {`user`, `app_close`, `crash_recovered`} |

### 3.2 Ciclo de vida del flujo (H1)
Cada evento lleva `project_kind` (uno de los tipos de proyecto de la plataforma) y `modality` ∈ {`image_bbox`, `image_mask`, `image_point`, `video_track`, `timeseries_event`, `other`}.

| event | payload |
|---|---|
| `project.create` | `project_kind`, `modality` |
| `project.open` | `project_kind`, `modality` |
| `data.import.start` | `n_items` |
| `data.import.end` | `n_items`, `ok` (bool) |
| `annot.first` | primer evento `annot.commit` de la sesión, emitido una sola vez |
| `annot.complete` | el usuario marca el conjunto como listo o inicia entrenamiento con anotaciones; `n_items_annotated` |
| `train.start` | `backend` (motor), `mode` ∈ {`local`, `package`, `remote`, `browser`}, `n_train`, `n_val`, `epochs_planned` |
| `train.epoch` | `epoch`, `duration_ms`, `mem_peak_mb` |
| `train.end` | `ok`, `duration_ms`, `epochs_done`, `error_class` (categoría, sin mensaje libre) |
| `export.start` | `format` |
| `export.end` | `ok`, `format`, `contract_valid` (bool: pasó la validación del contrato de modelo) |

`modality` se deriva del tipo de proyecto; si un proyecto mezcla modalidades, usar la de la herramienta activa.

### 3.3 Pasos del flujo (H2)
| event | payload |
|---|---|
| `step.enter` | `step_id` (identificador estable, ver abajo), `modality` |
| `step.exit` | `step_id`, `duration_ms` |

`step_id` debe ser un identificador estable definido en un solo archivo (`study_steps.ts` o equivalente) y no derivado de rutas de la interfaz ni de nombres de botones. Lista mínima: `create_project`, `import_data`, `configure_classes`, `annotate`, `review_assisted`, `configure_training`, `train`, `evaluate`, `export`. Si la interfaz tiene pasos que no calzan, agregarlos a la lista con justificación, no inventar en línea.

### 3.4 Configuración declarativa (H2)
| event | payload |
|---|---|
| `config.change` | `scope` ∈ {`project`, `training`, `inference`, `annotation`}, `key` (nombre del parámetro), `from_type`, `to_type`, `is_default_before`, `is_default_after` |

No registrar valores, solo el nombre del parámetro y si el valor era o no el predeterminado. Excepción: parámetros numéricos de entrenamiento (`epochs`, `batch_size`, `learning_rate`, `image_size`) sí registran `from` y `to`.

### 3.5 Anotación (eje transversal)
| event | payload |
|---|---|
| `tool.select` | `tool_id`, `modality` |
| `annot.commit` | `tool_id`, `modality`, `origin` ∈ {`manual`, `assisted_accepted`, `assisted_edited`, `assisted_rejected`}, `duration_ms` (desde `tool.select` o desde el `annot.commit` anterior, lo que sea posterior), `n_edits` (número de ajustes antes de confirmar) |
| `annot.delete` | `tool_id`, `modality`, `origin` |
| `assist.propose` | `n_proposals`, `latency_ms` (inferencia) |
| `video.keyframe.set` | `track_id_hash` (hash del identificador interno, no el identificador), `frame_idx` |
| `video.keyframe.review` | `track_id_hash`, `frame_idx`, `changed` (bool) |
| `video.consolidate` | `n_tracks`, `n_frames_total`, `n_frames_keyed`, `n_frames_reviewed`, `n_frames_interpolated_unreviewed` |

### 3.6 Fricción (H1)
| event | payload |
|---|---|
| `idle.start` | emitido cuando no hay entrada de usuario durante ≥ 60 s |
| `idle.end` | `duration_ms` |
| `help.open` | `topic_id` (si existe ayuda integrada; si no, omitir el evento) |
| `error.shown` | `error_class`, `scope` (categoría del error mostrado al usuario, sin mensaje libre) |

La detección de inactividad se hace por ausencia de eventos de entrada (teclado, ratón, rueda); no usar ventanas emergentes ni ninguna señal visible.

### 3.7 Red (auditoría)
| event | payload |
|---|---|
| `net.request` | `host` (solo dominio), `purpose` ∈ {`update_check`, `model_weights`, `remote_training`, `collab_p2p`, `other`}, `bytes_out`, `bytes_in`, `ok` |

Debe emitirse desde el punto único por donde sale todo tráfico de la aplicación. Si hay más de un cliente HTTP, unificarlos o instrumentar todos. `purpose = other` debe hacer fallar una prueba unitaria: todo tráfico saliente tiene que estar clasificado.

### 3.8 Inferencia
| event | payload |
|---|---|
| `infer.run` | `backend`, `model_hash` (hash del archivo de modelo), `n_items`, `latency_ms_p50`, `latency_ms_p95` |

---

## Tarea 4 — Huella de hardware

En `session.start`, capturar sin llamadas de red: modelo de procesador, núcleos físicos y lógicos, memoria total en MB, presencia y nombre de acelerador gráfico (si el sistema lo expone), sistema operativo y versión, versión de la aplicación y hash de git. Nada que identifique a la máquina de forma única (sin números de serie, sin direcciones MAC, sin nombre de equipo).

---

## Tarea 5 — Exportación y anonimización

Comando `study_log_export(session_id)` que:
- Copia el o los archivos de la sesión a una carpeta elegida por el usuario.
- Genera un `manifest.json` con: `session_id`, `condition`, `app_version`, número de eventos, `t_mono_ms` final, hash de cada archivo, resultado de `study_log_verify`.
- No incluye nada más.

---

## Tarea 6 — Herramienta de análisis (repositorio separado o carpeta `tools/study_analysis/`)

Script en Python (`pandas`) que lee uno o más `.jsonl` y produce un CSV por sesión con las métricas del estudio:

- `completed_cycle` (bool): existe `export.end` con `ok = true` y `contract_valid = true`.
- `t_first_model_ms`: `t_mono_ms` del primer `export.end` exitoso menos `t_mono_ms` de `project.create`.
- `n_blocks`: número de intervalos `idle` con `duration_ms ≥ 300 000`, más número de `help.open`.
- `blocks_by_step`: desglose de bloqueos por `step_id` activo.
- `steps_sequence`: lista ordenada de `step_id` únicos en orden de primera entrada (para comparar entre modalidades).
- `n_config_changes` y `n_config_changes_nondefault`.
- `annot_median_ms` por `tool_id` y `origin`.
- `assist_correction_rate`: `assisted_edited / (assisted_accepted + assisted_edited + assisted_rejected)`.
- `assist_rejection_rate`.
- `video_keyed_ratio`: `n_frames_keyed / n_frames_total` del último `video.consolidate`.
- `video_unreviewed_ratio`: `n_frames_interpolated_unreviewed / n_frames_total`.
- `train_total_ms`, `train_epoch_median_ms`, `train_mem_peak_mb`.
- `infer_latency_p50_ms`, `infer_latency_p95_ms`.
- `net_hosts`: lista de dominios contactados con `purpose`; `net_unclassified` debe ser 0.
- `hash_chain_valid` (bool).

Incluir pruebas con un `.jsonl` de ejemplo generado sintéticamente.

---

## Tarea 7 — Documentación

Archivo `docs/study-mode.md` con:
- Propósito y garantías (qué se registra, qué no).
- Esquema completo de eventos (copia de la sección 3, mantenida sincronizada con el código; una prueba debe fallar si se emite un evento no documentado).
- Formato de archivo y verificación de la cadena de hash.
- Instrucciones de exportación.

---

## Orden sugerido

1. Tarea 2 (escritor) con pruebas.
2. Tarea 1 (configuración) conectada al escritor.
3. Tarea 3 en este orden: 3.1, 3.2, 3.3, 3.6, 3.5, 3.4, 3.7, 3.8. Después de cada bloque, ejecutar una sesión manual corta y verificar el archivo con `study_log_verify`.
4. Tarea 4.
5. Tarea 5.
6. Tarea 7 (la prueba de sincronía esquema–código se agrega aquí y se corre en CI).
7. Tarea 6.

Al terminar cada tarea, reportar: archivos tocados, decisiones de ubicación, y cualquier evento de la taxonomía que no pudo emitirse desde el código actual y por qué.
