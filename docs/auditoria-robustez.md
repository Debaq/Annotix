# Auditoría — integridad de datos, runner y cobertura de pruebas

Revisión del 2026-09-10.

---

## C. Integridad de datos

### C1. `write_project` no sincroniza a disco ni conserva copia previa

**Dónde.** `io.rs:93-113`.

```rust
std::fs::write(&tmp_path, &content)?;
std::fs::rename(&tmp_path, &path)?;
```

Escribe el archivo temporal y renombra, pero no llama a `sync_all()` sobre el archivo antes del
renombrado ni sincroniza el directorio. El renombrado puede quedar persistido mientras el
contenido sigue en la caché de página del sistema.

**Qué implica.** Un corte de energía a mitad de una sesión puede dejar `project.json` truncado. No
existe `project.json.bak`, y ese archivo contiene todas las anotaciones del proyecto.

**Corrección.** `File::sync_all()` sobre el temporal antes del renombrado, sincronizar el
directorio después, y conservar la versión anterior como copia de seguridad rotativa.

### C2. Mutex bloqueante con E/S dentro, en contexto asíncrono

`AppState` usa `std::sync::Mutex` (`state.rs:22-29`). `with_project_mut` (`projects.rs:388-403`)
llama a `flush_project`, que escribe a disco con el candado tomado, y se invoca desde comandos
Tauri asíncronos. Un proyecto grande bloquea todo acceso a la caché y ocupa un hilo del runtime
durante la escritura.

**Corrección.** Serializar dentro del candado y escribir fuera de él, o mover la escritura a
`spawn_blocking`.

### C3. La caché no tiene límite ni desalojo

`cache: Mutex<HashMap<String, CachedProject>>` (`state.rs:27`) solo se vacía mediante
`evict_from_cache`, que se llama al borrar un proyecto. Los proyectos abiertos permanecen en
memoria durante toda la sesión.

**Corrección.** Desalojo por número de proyectos o por uso menos reciente.

### Detalle adicional

`read_project` (`io.rs:82`) usa `read_to_string` seguido de `from_str`, duplicando el pico de
memoria. `read_project_summary` sí usa `BufReader` con `from_reader`.

---

## D. Runner de entrenamiento

### D1. `wait()` bajo el candado de procesos

`spawn_monitor_thread` (`runner.rs:765-772`) toma el candado de `processes` y dentro llama a
`child.wait()` y al `join()` del hilo de stderr. Mientras un proceso cerró su salida estándar pero
sigue vivo —por ejemplo ultralytics exportando el modelo—, `cancel_training` e `is_running` quedan
bloqueados esperando el candado, de modo que el usuario no puede cancelar durante esa ventana.

**Corrección.** Sacar el `Child` del mapa, soltar el candado, y esperar fuera de él.

### D2. Cancelación sin recolección del proceso

`cancel_training` (`runner.rs:346-354`) hace `remove` del `Child` y `kill()` sin llamar a `wait()`.
El hilo monitor ya no lo encuentra en el mapa, así que nadie lo recoge: en Unix queda un proceso
zombi por cada cancelación hasta que termina la aplicación. El estado en `project.json` sí queda
correcto: lo escribe el comando (`training_commands.rs:279-285`).

**Corrección.** Añadir `let _ = child.wait();` tras el `kill()`.

### D3. El limitador de log no cierra el último lote por tiempo

`emit_log_throttled` (`runner.rs:421-444`) acumula líneas en `pending` y solo emite cuando llega
otra línea pasados 100 ms. Si el proceso calla tras una ráfaga —por ejemplo durante una época
larga—, esas últimas líneas no llegan al visor hasta la siguiente línea.

El volcado final sí está cubierto en las tres rutas de salida: evento `completed`
(`runner.rs:622`), finalización de respaldo (`runner.rs:656`) y error (`runner.rs:787`).

**Corrección.** Un temporizador que vacíe `pending` al vencer la ventana.

### Detalle adicional

`is_running` (`runner.rs:358`) usa `procs.lock().unwrap()`, que provoca pánico si el candado quedó
envenenado por un pánico previo en otro hilo.

---

## E. Cobertura de pruebas

68 pruebas en `src-tauri/src/tests.rs`, distribuidas así:

| Área | Cubre |
|---|---|
| Serialización | ida y vuelta de `ProjectFile`, formato de imagen por defecto |
| Almacenamiento | escritura y lectura, atomicidad (no deja `.tmp`), error si falta el archivo |
| Analizadores | `parse_bbox`, `parse_polygon`, `parse_obb`, búsqueda de clase |
| WebP | detección de extensión, sustitución de extensión, transcodificación |
| Exportación | ida y vuelta YOLO, COCO y Pascal VOC; formato de etiqueta YOLO; esquema COCO |
| Importación | detección de formato YOLO y COCO |
| P2P | permisos por rol, serialización, reglas, gossip, tickets |
| Inferencia | resolución de formato de salida por pista, inferencia de tipo de anotación |
| Entrenamiento | estructura YOLO generada, error con lista vacía, carpetas por clase, determinismo por `project.id` |
| Geometría | normalización, `obb_to_aabbox` a 0° y 45°, área de polígono |

**Sin cobertura**, y coincide con donde están los hallazgos de las otras dos auditorías:

- `compute_split` como función, con sus casos límite;
- uniformidad y estabilidad del barajado;
- formato de etiqueta para la tarea `obb` (que debe tener 9 campos);
- exclusión de imágenes sin anotar del conjunto de entrenamiento;
- recorte de coordenadas al rango `[0, 1]`.
