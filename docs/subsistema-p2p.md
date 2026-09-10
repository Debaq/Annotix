# Subsistema P2P — revisión

Revisión del 2026-09-10 sobre `src-tauri/src/p2p/` (3 836 líneas en 9 archivos).

## Tamaño de los módulos

| Archivo | Líneas | Contenido |
|---|---|---|
| `sync.rs` | 1 441 | observador del documento, descarga de blobs, latido |
| `session.rs` | 899 | crear, unirse, pausar, reanudar, salir; lista de pares |
| `distribution.rs` | 422 | distribución de trabajo y estadísticas |
| `node.rs` | 266 | nodo iroh, estado global, permisos |
| `mod.rs` | 241 | tipos públicos, roles, reglas |
| `locks.rs` | 178 | bloqueos de presencia, asignación de lotes |
| `ticket.rs` | 167 | códigos de sesión y clave de anfitrión |
| `crypto.rs` | 146 | cifrado del secreto del anfitrión |
| `protocol.rs` | 76 | mensajes de gossip |

## Reconexión

El endpoint se construye con `Endpoint::builder().preset(N0)` (`node.rs:160`), que activa
descubrimiento por pkarr, DNS y retransmisores. Eso mantiene alcanzables a los pares aunque el
ticket salga con direcciones parciales, y cubre el caso entre redes distintas.

`doc.subscribe()` (`sync.rs:1076`) es un stream del motor local, no de la conexión de red: no se
cierra cuando se cae la red. El evento `p2p:session-status` con estado `disconnected` solo se
emite cuando el observador termina de verdad — documento cerrado o nodo apagado. Cuando el par
vuelve, iroh-docs re-sincroniza y `SyncFinished` reemite `connected`.

Al arrancar el nodo se espera a `endpoint.online()` con un tope de 8 s antes de generar tickets,
porque `doc.share()` captura la información de direcciones del endpoint; si corre antes de estar
en línea el ticket sale incompleto. Pasado el tope se continúa apoyándose en el descubrimiento.

## Comandos expuestos (25)

Sesión: `create_session`, `join_session`, `leave_session`, `pause_session`, `resume_session`,
`get_session_info`, `get_all_sessions`, `update_rules`, `get_rules`, `update_peer_role`,
`list_peers`.

Trabajo: `lock_image`, `unlock_image`, `get_image_lock`, `assign_batch`, `distribute_work`,
`adjust_assignment`, `get_distribution`, `get_work_stats`.

Datos: `sync_annotations`, `resume_download`, `submit_data`, `approve_data`, `reject_data`,
`list_pending_approvals`.

## Alcance del documento replicado

Claves presentes en el documento iroh:

```
meta/project            meta/rules            meta/session_closed
meta/host_node_id       meta/host_secret_hash meta/peers/{node_id}
classes/{id}
images/{id}/meta        images/{id}/annots    images/{id}/blob      images/{id}/lock
batches/{id}
```

Se sincronizan imágenes, anotaciones y clases. Videos, audio y series temporales no forman parte
del documento; se comparten por exportación TIX.

La resolución de conflictos es la de iroh-docs: por clave, última escritura gana, con el
identificador de autor como desempate.

## Robustez de la sincronización

- La descarga de blobs reintenta hasta 8 veces con 3 s de espera (`sync.rs:511`, `sync.rs:916`).
- Antes de pedir un blob se intenta leerlo del almacén local, porque la política de descarga por
  defecto del documento ya puede haberlo traído (`sync.rs:936`). Sin esa comprobación una imagen
  quedaba marcada como pendiente de forma permanente.
- La entrada `meta` de una imagen puede llegar por gossip antes que su blob, así que su lectura
  se procesa en tarea aparte con reintentos (`sync.rs:1094`).
- Tras aplicar cambios remotos se emite `db:images-changed` para refrescar galería e imagen
  abierta; sin eso las marcas remotas solo aparecían al reabrir el proyecto.
- Escritura de imagen a archivo temporal y renombrado, con saneamiento del nombre de archivo.

## Roles y permisos

`PeerRole` (`mod.rs:29`): `LeadResearcher`, `Annotator`, `DataCurator`. El investigador principal
tiene todos los permisos. Los demás combinan las capacidades del rol con las reglas de sesión
(`can_upload`, `can_export`, `can_edit_classes`, `can_delete`, `require_data_approval`).

`check_permission` (`node.rs:110`) devuelve `Ok` cuando no hay sesión activa para el proyecto, de
modo que el trabajo local no pasa por control de permisos.

## Presencia y bloqueos

`LOCK_TTL_MS` es de 3 minutos y el frontend renueva cada 60 s (`useImagePresence.ts`). El hook
declara el propósito: presencia, no exclusión mutua — no consume el booleano que devuelve
`lock_image`.

El indicador de la interfaz (`ImageLockIndicator`) se alimenta del evento `p2p:image-locked` que
emite el observador del documento (`sync.rs:1269`), el cual sí ve escrituras de cualquier autor.

Nota de implementación: `lock_image` y `get_image_lock` (`locks.rs:37`, `locks.rs:110`) leen con
`doc.get_exact(session.author_id, …)`, que devuelve solo la entrada del propio autor. Si en algún
momento se quisiera exclusión mutua real, habría que leer con `get_one(Query::key_exact(…))` como
hace el resto de `sync.rs`.

## Seguridad

El secreto del anfitrión se genera con 32 bytes aleatorios, se persiste cifrado con
ChaCha20-Poly1305 (`crypto.rs`) y se compara por hash blake3. Los nombres de archivo recibidos por
sincronización se sanean antes de escribir a disco.

## Cobertura de pruebas

9 de los 68 tests de `tests.rs` cubren P2P: permisos por rol, serialización de roles con alias
heredados, modos de bloqueo, reglas de sesión por defecto y su deserialización sin campos nuevos,
estados de sesión y aprobación, ida y vuelta de mensajes de gossip, y validación de tickets.
