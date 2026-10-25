use serde_json::{json, Value};

use crate::agreement::kappa::cohen;
use crate::agreement::overlap::emparejar;
use crate::mcp::meta::{asignar, LocalSession};
use crate::store::project_file::{AnnotationEntry, ImageEntry, ProjectFile};
use crate::store::state::AppState;

use super::{ciego_sin_resolver, exigir_confirm, meta_de, proyecto};

/// Reparte las imágenes entre los lectores con una semilla. Idempotente: con los
/// mismos lectores y semilla devuelve la sesión que ya hay; con otros, se niega
/// (cambiar el reparto a mitad de una lectura ciega la invalidaría).
pub fn create(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let readers: Vec<String> = a
        .get("readers")
        .and_then(|v| v.as_array())
        .ok_or("Falta 'readers'")?
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();
    let mut unicos = readers.clone();
    unicos.sort();
    unicos.dedup();
    if unicos.len() != readers.len() {
        return Err("Hay lectores repetidos".into());
    }
    let seed = a
        .get("assignment_seed")
        .and_then(|v| v.as_u64())
        .ok_or("Falta 'assignment_seed' (entero)")?;

    let dir = state.project_dir(&id)?;
    let mut meta = meta_de(state, &id)?;
    if let Some(s) = &meta.session {
        if s.readers == readers && s.seed == seed {
            return Ok(resumen(&id, s, false));
        }
        return Err("Ya hay una sesión con otros lectores o semilla; no se reasigna".into());
    }
    let ids: Vec<String> = state.with_project(&id, |pf| pf.images.iter().map(|i| i.id.clone()).collect())?;
    if ids.is_empty() {
        return Err("El proyecto no tiene imágenes que repartir".into());
    }
    let asignacion = asignar(&ids, &readers, meta.replication(), seed)?;
    let sesion = LocalSession {
        readers,
        seed,
        created: chrono::Utc::now().to_rfc3339(),
        closed: false,
        assignments: asignacion,
    };
    let r = resumen(&id, &sesion, true);
    meta.session = Some(sesion);
    meta.save(&dir)?;
    Ok(r)
}

fn resumen(id: &str, s: &LocalSession, creada: bool) -> Value {
    let mut por_lector = serde_json::Map::new();
    for l in &s.readers {
        let n = s.assignments.values().filter(|v| v.contains(l)).count();
        por_lector.insert(l.clone(), json!(n));
    }
    json!({"project_id": id, "created": creada, "readers": s.readers, "seed": s.seed,
           "n_images": s.assignments.len(), "assigned_by_reader": por_lector})
}

pub fn close(state: &AppState, a: &Value) -> Result<Value, String> {
    exigir_confirm(a, "Cerrar la sesión")?;
    let id = proyecto(state, a)?;
    let dir = state.project_dir(&id)?;
    let mut meta = meta_de(state, &id)?;
    let s = meta.session.as_mut().ok_or("El proyecto no tiene sesión")?;
    let ya = s.closed;
    s.closed = true;
    meta.save(&dir)?;
    Ok(json!({"project_id": id, "closed": true, "was_closed": ya}))
}

fn entregadas(img: &ImageEntry) -> Vec<&Vec<AnnotationEntry>> {
    img.readings
        .iter()
        .filter(|r| r.status == "submitted")
        .map(|r| &r.annotations)
        .collect()
}

fn de_clase(anns: &[AnnotationEntry], c: i64) -> Vec<AnnotationEntry> {
    anns.iter().filter(|a| a.class_id == c).cloned().collect()
}

/// Acuerdo global (el mismo cálculo que la app) más IoU y κ de presencia por clase.
fn por_clase(pf: &ProjectFile) -> Vec<Value> {
    pf.classes
        .iter()
        .map(|c| {
            let (mut ious, mut pares) = (Vec::new(), Vec::new());
            for img in &pf.images {
                let capas = entregadas(img);
                for i in 0..capas.len() {
                    for j in (i + 1)..capas.len() {
                        let (a, b) = (de_clase(capas[i], c.id), de_clase(capas[j], c.id));
                        pares.push((!a.is_empty() as i64, !b.is_empty() as i64));
                        if !a.is_empty() || !b.is_empty() {
                            ious.push(emparejar(&a, &b, 0.3).iou_medio());
                        }
                    }
                }
            }
            let iou = (!ious.is_empty()).then(|| ious.iter().sum::<f64>() / ious.len() as f64);
            json!({"class_id": c.id, "class": c.name, "iou_mean": iou,
                   "presence_kappa": cohen(&pares), "n_pairs": pares.len()})
        })
        .collect()
}

pub fn agreement(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let meta = meta_de(state, &id)?;
    state.with_project(&id, |pf| {
        let comparables = pf.images.iter().filter(|i| i.submitted_readings() >= 2).count();
        if ciego_sin_resolver(pf, &meta) {
            // Ciego y sin resolver: sólo conteos. Ni siquiera el acuerdo agregado,
            // que con pocas imágenes delataría qué dijo cada lector.
            return json!({"project_id": pf.id, "blind_locked": true,
                          "comparable_images": comparables,
                          "note": "Sesión ciega sin resolver: sólo se devuelven conteos"});
        }
        let global = crate::store::agreement::calcular_acuerdo(pf);
        json!({"project_id": pf.id, "blind_locked": false, "comparable_images": comparables,
               "overall": global, "by_class": por_clase(pf)})
    })
}

pub fn conflicts(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let meta = meta_de(state, &id)?;
    let limit = a.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
    state.with_project(&id, |pf| {
        let cola = crate::store::agreement::cola_de_discrepancias(pf, 500);
        if ciego_sin_resolver(pf, &meta) {
            return json!({"project_id": pf.id, "blind_locked": true,
                          "n_conflicts": cola.len(),
                          "note": "Sesión ciega sin resolver: sólo se devuelve el conteo"});
        }
        json!({"project_id": pf.id, "blind_locked": false, "n_conflicts": cola.len(),
               "conflicts": cola.into_iter().take(limit).collect::<Vec<_>>()})
    })
}
