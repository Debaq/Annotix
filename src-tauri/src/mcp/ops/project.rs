use serde_json::{json, Value};

use crate::store::project_file::ClassDef;
use crate::store::state::AppState;

use super::{ciego_sin_resolver, exigir_confirm, meta_de, proyecto, req_str};
use crate::mcp::meta::McpMeta;

/// Acepta el id o el nombre exacto (si es único).
pub(crate) fn resolve(state: &AppState, quien: &str) -> Result<String, String> {
    let todos = state.list_projects()?;
    if let Some(p) = todos.iter().find(|p| p.id == quien) {
        return Ok(p.id.clone());
    }
    let por_nombre: Vec<_> = todos.iter().filter(|p| p.name == quien).collect();
    match por_nombre.len() {
        1 => Ok(por_nombre[0].id.clone()),
        0 => Err(format!("No existe el proyecto '{}'", quien)),
        n => Err(format!("{} proyectos se llaman '{}': usa el id", n, quien)),
    }
}

fn clases(a: &Value) -> Result<Vec<ClassDef>, String> {
    let arr = a
        .get("classes")
        .and_then(|c| c.as_array())
        .ok_or("Falta 'classes'")?;
    arr.iter()
        .map(|c| {
            Ok(ClassDef {
                id: c.get("id").and_then(|v| v.as_i64()).ok_or("clase sin 'id'")?,
                name: c
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or("clase sin 'name'")?
                    .to_string(),
                color: c
                    .get("color")
                    .and_then(|v| v.as_str())
                    .unwrap_or("#888888")
                    .to_string(),
                description: None,
            })
        })
        .collect()
}

/// Idempotente por nombre: si ya existe un proyecto con ese nombre y las mismas
/// clases, devuelve el existente; si las clases difieren, se niega.
pub fn create(state: &AppState, a: &Value) -> Result<Value, String> {
    let name = req_str(a, "name")?;
    let classes = clases(a)?;
    let replication = a.get("replication").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
    let blind = a.get("blind").and_then(|v| v.as_bool()).unwrap_or(false);
    if replication == 0 {
        return Err("replication debe ser >= 1".into());
    }

    if let Some(p) = state.list_projects()?.into_iter().find(|p| p.name == name) {
        let mismas = p.classes.len() == classes.len()
            && p.classes
                .iter()
                .zip(&classes)
                .all(|(x, y)| x.id == y.id && x.name == y.name);
        if !mismas {
            return Err(format!(
                "Ya existe '{}' con otras clases; no se toca",
                name
            ));
        }
        let meta = meta_de(state, &p.id)?;
        return Ok(json!({"project_id": p.id, "created": false,
                         "replication": meta.replication, "blind": meta.blind}));
    }

    let id = state.create_project(name, "bbox", &classes, None)?;
    let meta = McpMeta {
        replication,
        blind,
        ..Default::default()
    };
    meta.save(&state.project_dir(&id)?)?;
    state.audit(
        &id,
        crate::audit::events::CLASSES_CHANGED,
        json!({"before": [], "after": classes.iter().map(|c| json!({"id": c.id, "name": c.name})).collect::<Vec<_>>()}),
    );
    Ok(json!({"project_id": id, "created": true, "replication": replication, "blind": blind}))
}

pub fn list(state: &AppState) -> Result<Value, String> {
    let ps = state.list_projects()?;
    Ok(json!(ps
        .iter()
        .map(|p| json!({"project_id": p.id, "name": p.name, "n_images": p.image_count,
                        "n_classes": p.classes.len(), "locked": p.locked}))
        .collect::<Vec<_>>()))
}

/// Progreso agregado. Nunca devuelve el contenido de una anotación.
pub fn status(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let meta = meta_de(state, &id)?;
    state.with_project(&id, |pf| {
        let repl = meta.replication();
        let bloqueada = ciego_sin_resolver(pf, &meta);
        let cola = crate::store::agreement::cola_de_discrepancias(pf, 500);
        let abiertos = cola
            .iter()
            .filter(|d| {
                !pf.images.iter().any(|i| {
                    i.id == d.image_id
                        && i.annotations
                            .iter()
                            .any(|x| x.origin.as_deref() == Some("adjudicated"))
                })
            })
            .count();

        let (sesion, progreso, pendientes) = match &meta.session {
            Some(s) => {
                let mut prog = serde_json::Map::new();
                for lector in &s.readers {
                    let (mut asignadas, mut entregadas, mut en_curso) = (0, 0, 0);
                    for img in pf.images.iter().filter(|i| {
                        s.assignments
                            .get(&i.id)
                            .map_or(false, |l| l.contains(lector))
                    }) {
                        asignadas += 1;
                        match img
                            .readings
                            .iter()
                            .find(|r| &r.author_id == lector || r.author_name.as_deref() == Some(lector))
                        {
                            Some(r) if r.status == "submitted" => entregadas += 1,
                            Some(_) => en_curso += 1,
                            None => {}
                        }
                    }
                    prog.insert(
                        lector.clone(),
                        json!({"assigned": asignadas, "submitted": entregadas, "in_progress": en_curso}),
                    );
                }
                let pend = pf
                    .images
                    .iter()
                    .filter(|i| s.assignments.contains_key(&i.id) && i.submitted_readings() < repl)
                    .count();
                (
                    json!({"readers": s.readers, "seed": s.seed, "closed": s.closed}),
                    Value::Object(prog),
                    pend,
                )
            }
            None => (
                Value::Null,
                Value::Null,
                pf.images.iter().filter(|i| i.annotations.is_empty() && !i.is_background).count(),
            ),
        };

        json!({
            "project_id": pf.id, "name": pf.name,
            "n_images": pf.images.len(), "n_classes": pf.classes.len(),
            "replication": meta.replication, "blind": meta.blind,
            "session": sesion, "progress_by_reader": progreso,
            "pending_images": pendientes,
            "n_prelabeled_images": pf.images.iter().filter(|i| !i.predictions.is_empty()).count(),
            "open_conflicts": abiertos,
            "blind_locked": bloqueada,
        })
    })
}

/// Borra el proyecto entero. Como la carpeta se lleva su propio `audit.jsonl`, la
/// constancia se escribe además en el directorio de datos, que sobrevive.
pub fn delete(state: &AppState, a: &Value) -> Result<Value, String> {
    exigir_confirm(a, "Borrar un proyecto")?;
    let id = proyecto(state, a)?;
    let nombre = state.with_project(&id, |pf| pf.name.clone())?;
    let linea = json!({"t": chrono::Utc::now().to_rfc3339(), "actor": super::ACTOR,
                       "tool": "project_delete", "project_id": id, "name": nombre});
    let ruta = state.data_dir.join("mcp_deleted_projects.jsonl");
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ruta)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", linea).map_err(|e| e.to_string())?;
    state.delete_project(&id)?;
    Ok(json!({"project_id": id, "deleted": true}))
}
