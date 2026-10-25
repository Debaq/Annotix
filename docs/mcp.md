# Servidor MCP

`annotix-mcp` deja que un agente de IA (Claude Code, por stdio) haga el trabajo
administrativo y repetitivo de un proyecto sin abrir la interfaz. **El agente no
es un lector**: no anota, no adjudica y no ve lo que anotó cada lector mientras la
sesión ciega no esté resuelta. La doble lectura ciega no cambia; el MCP sólo evita
el trabajo manual que la rodea.

Es una capa fina: cada herramienta llama a la lógica que ya usa la app
(`store`, `audit`, `agreement`, `export`). Código en `src-tauri/src/mcp/`.

## Compilar y registrar

```bash
cd src-tauri && cargo build --release --bin annotix-mcp
```

Copia `.mcp.json.example` a `.mcp.json` (o `claude mcp add`) y ajusta las rutas:

```json
{
  "mcpServers": {
    "annotix": {
      "command": "/ruta/a/Annotix/src-tauri/target/release/annotix-mcp",
      "env": { "ANNOTIX_MCP_PROJECTS_DIR": "/ruta/a/tus/proyectos" }
    }
  }
}
```

- Transporte stdio, sin red ni token: quien puede lanzar el proceso ya tiene los
  permisos del usuario. Nada de credenciales en el repo.
- Sin `ANNOTIX_MCP_PROJECTS_DIR` usa la carpeta de proyectos de la app
  (`~/.local/share/annotix/config.json`).
- **Cierra la app o no la uses sobre el mismo proyecto a la vez**: el MCP relee el
  proyecto del disco en cada llamada, pero la app tiene su propia copia en memoria
  y puede pisar lo que el MCP escribió.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `project_create(name, classes[{id,name,color}], replication, blind)` | Crea el proyecto (tipo `bbox`). Idempotente por nombre. |
| `project_list` / `project_status(project)` | Progreso por lector, pendientes, conflictos abiertos. Sólo conteos. |
| `import_images(project, dir \| manifest_csv, mode=copy\|symlink)` | Deduplica por sha256 del archivo original; devuelve importadas/omitidas. |
| `import_annotations(project, coco_json, origin, model_version, status="prelabel")` | Cajas COCO como **pre-etiquetas** (`predictions`), con `model_id = origin-model_version`. No son anotaciones ni lecturas. |
| `session_create(project, readers[], assignment_seed)` | Reparte cada imagen a `replication` lectores, equilibrado y reproducible con la semilla. |
| `agreement_report(project)` | Acuerdo global (el de la app) + IoU medio y κ de presencia por clase. |
| `conflicts_list(project)` | Cola de desacuerdos. |
| `export(project, format=coco\|yolo, only=adjudicated\|all, include_audit)` | Zip con la capa consolidada; con `include_audit` añade `audit.jsonl`. |
| `audit_read(project, since)` / `audit_verify(project)` | Lee (desde un `seq` o fecha ISO) y verifica la cadena de hash. |
| `project_delete`, `images_delete`, `session_close` | **Destructivas**: exigen `confirm=true`. |

`project` acepta el id o el nombre exacto.

## Reglas de seguridad

- **Auditoría.** Cada llamada escribe un evento `mcp.action` en `audit.jsonl` con
  `actor = agent:mcp`, la herramienta, los argumentos y si salió bien (las que sólo
  leen no copian el resultado). Los cambios de datos añaden además su evento de
  dominio (`data.imported`, `data.exported`, `classes.changed`). Borrar un proyecto
  se lleva su `audit.jsonl`; por eso esa acción se anota también en
  `{datos_app}/mcp_deleted_projects.jsonl`.
- **Cegado.** Una sesión es «ciega sin resolver» si `blind` está activo y alguna
  imagen asignada no tiene aún todas sus lecturas entregadas, o las tiene pero
  discrepan y nadie las ha adjudicado. Mientras sea así, `project_status`,
  `agreement_report` y `conflicts_list` sólo devuelven conteos y
  `export` no saca nada que no esté adjudicado. Ninguna herramienta devuelve el
  contenido de las capas de los lectores en ningún estado: no hay una que las lea.
  Es un cegado **de la aplicación**, igual que el de P2P (ver
  `docs/lectura-multiple.md`); quien lea los archivos del proyecto a mano las ve.
- **Sin escritura de lectores.** No existen herramientas que creen, editen o
  borren anotaciones de un lector ni que adjudiquen (hay un test).
- **Idempotencia.** Repetir `project_create`, `import_images`, `import_annotations`
  o `session_create` con los mismos argumentos no duplica nada.

## Dónde guarda cosas

`project.json` no cambia. Lo que no tenía sitio va en `mcp.json`, junto a él: las
reglas (`replication`, `blind`), la sesión local (lectores, semilla, asignación) y
`sha256 → id de imagen` para el dedupe. Las pre-etiquetas viven en
`ImageEntry.predictions` con `status = "prelabel"`.

## Qué falta

- La UI no sabe leer la asignación local: los lectores siguen entrando por una
  sesión P2P. Hoy `session_create` deja la asignación y las reglas declaradas, y
  `project_status` las cruza con las capas que haya en `readings`.
- Las pre-etiquetas no se muestran en la UI mientras tengan `status = "prelabel"`
  (la galería enseña las `pending`). Aceptarlas es un acto del lector.
- Sólo proyectos de cajas (`bbox`) y exportación COCO/YOLO.
- `mode=symlink` sólo en Unix.
