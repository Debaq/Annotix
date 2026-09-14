# Registro de auditoría del proyecto

Cada proyecto lleva un `audit.jsonl` dentro de su carpeta con **los cambios que
afectan al ground truth**: qué etiqueta se creó, editó o borró, qué predicción se
aceptó o se rechazó, cuándo se consolidó un video, cuándo se redefinieron las
clases, qué sujeto se asignó a qué muestras, cómo se declaró el reparto, y qué
entró, se entrenó y salió del proyecto.

Responde una pregunta que antes no tenía respuesta: **quién cambió qué, cuándo, y
en qué estado estaban los datos con los que se entrenó un modelo**. El contrato de
modelo (etapa 8 del plan biomédico) transcribe el tramo correspondiente.

---

## Qué no es

No es telemetría de uso. Eso es el **modo estudio** (`docs/study-mode.md`), que es
**anónimo por diseño**: rechaza rutas, nombres y texto de más de 128 caracteres, y
sólo existe mientras dura una sesión de estudio declarada.

Los dos comparten la mecánica de la cadena (`src-tauri/src/hashchain.rs`) y nada
más. Sus políticas de privacidad son opuestas y por eso son dos subsistemas
separados, con nombres que no se confunden:

| | Modo estudio | Auditoría |
|---|---|---|
| Archivo | `{datos_app}/study_logs/{sesión}_{fecha}.jsonl` | `{proyecto}/audit.jsonl` |
| Cuándo | sólo con el modo estudio activado | siempre |
| Contenido | anónimo; sin ids, rutas ni texto libre | ids en claro y autoría |
| Para qué | medir cómo se usa la herramienta | responder por los datos |

---

## Qué guarda cada línea

```json
{"actor":"Ana","event":"annotations.saved","payload":{"image_id":"…","created":["…"],"deleted":[]},
 "prev_hash":"…","project_id":"…","seq":42,"t_wall":"2026-09-13T21:44:10.031Z","hash":"…"}
```

- `actor`: el nombre con el que se entró a la sesión P2P, o `local` fuera de una.
- `seq`: número de orden. Continúa entre arranques de la app.
- `prev_hash`: SHA-256 de la línea anterior completa. Vacío en la primera.
- `hash`: SHA-256 del texto de la propia línea sin el sufijo `,"hash":"…"`.

**No guarda el contenido de las etiquetas**: ni geometrías ni máscaras. Registrar
que la anotación `a1` de la imagen `img7` cambió de clase responde la pregunta;
copiar su máscara en base64 haría del registro otra copia del proyecto.

---

## Taxonomía

Un evento que no esté en esta lista lo rechaza el escritor
(`src-tauri/src/audit/events.rs`), y hay un test que falla si divergen.

| Evento | Cuándo | Payload |
|---|---|---|
| `log.opened` | al abrir el registro (arranque de la app) | `app_version`, `discarded_partial_line` |
| `annotations.saved` | un guardado que cambió algo | `image_id`, `created[]`, `edited[]`, `deleted[]` |
| `predictions.accepted` | predicciones convertidas en etiquetas | `image_id`, `annotation_ids[]`, `model_ids[]` |
| `predictions.rejected` | una predicción refutada | `image_id`, `prediction_ids[]`, `model_id` |
| `video.consolidated` | bake de los tracks de un video | `video_id`, `n_tracks`, `n_frames` |
| `annotations.adjudicated` | discrepancia entre lecturas resuelta | `image_id`, `decided_by`, `n_annotations`, `over_readings[]` |
| `classes.changed` | alta, baja, renombrado o reordenado de clases | `before[]`, `after[]` |
| `subjects.assigned` | carga del sujeto | `via`, `subject`, `n_samples` |
| `split_policy.changed` | declaración de la política de partición | `policy` |
| `augmentation_plan.changed` | declaración del plan de augmentación | `plan` |
| `data.imported` | importación que creó el proyecto | `file`, `n_images`, `n_annotations` |
| `data.exported` | exportación a cualquier formato | `format`, `file`, `ok` |
| `training.started` | lanzamiento de un entrenamiento | `job_id`, `backend`, `model_id`, `task`, `execution_mode`, `class_ids` |
| `training.finished` | fin del entrenamiento, salga como salga | `job_id`, `status`, `has_model` |

Un guardado que no cambia nada no escribe línea: el guardado se dispara también
al cambiar de imagen, y registrar eso llenaría el archivo de ruido que esconde lo
que sí pasó.

---

## Qué garantiza, y qué no

**Garantiza** que el archivo no se puede editar por el medio sin que se note:

- retocar una línea rompe su propio `hash`;
- borrar una línea rompe el `prev_hash` de la siguiente;
- una escritura que no llegó a disco deja un salto en `seq`.

**No garantiza** que nadie pueda tirar el archivo entero y empezar otro —para eso
haría falta un ancla fuera del proyecto—, ni que quien escribe diga la verdad
sobre su nombre. Es un registro a prueba de accidentes y de retoques, no a prueba
de un adversario con acceso al disco.

### Cierre abrupto

Si el proceso muere a mitad de una escritura, la última línea queda incompleta.
Esa línea **no está en la cadena** —nadie enlaza su hash—, así que al volver a
abrir el registro se descarta y el primer evento nuevo lo declara con
`discarded_partial_line: true`. El verificador, mientras tanto, informa la cola
truncada sin invalidar nada de lo anterior.

---

## Cómo se comprueba

Desde la app: **Galería → Gestionar sujetos → Estado del corpus**, sección
«Registro de auditoría», botón de verificar.

Desde fuera, sin la app: cada línea es JSON y la cuenta es textual, así que
cualquier lenguaje la reproduce.

```python
import hashlib, json

prev = ""
for n, linea in enumerate(open("audit.jsonl", encoding="utf-8"), 1):
    linea = linea.rstrip("\n")
    base, _, declarado = linea.rpartition(',"hash":"')
    base += "}"
    declarado = declarado.removesuffix('"}')
    if hashlib.sha256(base.encode()).hexdigest() != declarado:
        print(f"línea {n}: el evento fue modificado")
    if json.loads(linea)["prev_hash"] != prev:
        print(f"línea {n}: no enlaza con la anterior")
    prev = hashlib.sha256(linea.encode()).hexdigest()
```

---

## Coste

Una escritura por evento, con `flush`. Dos mil guardados —una sesión intensa de
verdad— tardan bastante menos de un segundo en total; hay un test que falla si eso
deja de ser cierto, porque un registro que estorba al canvas se acaba apagando.
