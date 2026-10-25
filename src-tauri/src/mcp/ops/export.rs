use std::io::Write;

use serde_json::{json, Value};

use crate::export::{coco, yolo};
use crate::store::state::AppState;

use super::{ciego_sin_resolver, meta_de, opt_str, proyecto};

fn adjudicada(img: &crate::store::project_file::ImageEntry) -> bool {
    img.annotations
        .iter()
        .any(|a| a.origin.as_deref() == Some("adjudicated"))
}

/// Exporta COCO o YOLO. Exporta sólo la capa consolidada (`annotations`): nunca
/// las capas de los lectores ni las pre-etiquetas. Con la sesión ciega sin
/// resolver, `only=all` se limita igualmente a lo adjudicado.
pub fn export(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let formato = opt_str(a, "format").unwrap_or("coco");
    let solo = opt_str(a, "only").unwrap_or("adjudicated");
    if !["coco", "yolo"].contains(&formato) || !["adjudicated", "all"].contains(&solo) {
        return Err("format: coco|yolo; only: adjudicated|all".into());
    }
    let con_audit = a.get("include_audit").and_then(|v| v.as_bool()).unwrap_or(false);
    let meta = meta_de(state, &id)?;
    let pf = state.read_project_file(&id)?;
    let bloqueada = ciego_sin_resolver(&pf, &meta);

    let imagenes: Vec<_> = pf
        .images
        .iter()
        .filter(|i| !i.annotations.is_empty())
        .filter(|i| (solo == "all" && !bloqueada) || adjudicada(i))
        .cloned()
        .map(|mut i| {
            i.readings.clear();
            i.predictions.clear();
            i.annotations.retain(|an| pf.classes.iter().any(|c| c.id == an.class_id));
            i
        })
        .filter(|i| !i.annotations.is_empty())
        .collect();
    if imagenes.is_empty() {
        return Err(format!("No hay imágenes exportables (only={}, ciego sin resolver={})", solo, bloqueada));
    }

    let dir = state.project_dir(&id)?;
    let salida = match opt_str(a, "output") {
        Some(p) => std::path::PathBuf::from(p),
        None => dir.join("exports").join(format!("{}_{}_{}.zip", pf.name, formato, solo)),
    };
    if let Some(p) = salida.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let images_dir = state.project_images_dir(&id)?;
    let file = std::fs::File::create(&salida).map_err(|e| e.to_string())?;
    let r = match formato {
        "coco" => coco::export(&pf, &imagenes, &images_dir, file, |_| {}),
        _ => yolo::export(&pf, &imagenes, &images_dir, file, false, |_| {}),
    };
    state.audit(
        &id,
        crate::audit::events::DATA_EXPORTED,
        json!({"format": formato, "file": salida.display().to_string(), "ok": r.is_ok()}),
    );
    r?;

    if con_audit {
        let plano = crate::audit::cifrado::leer(&dir.join(crate::audit::log::FILE_NAME))?.plano;
        let f = std::fs::OpenOptions::new().read(true).write(true).open(&salida).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new_append(f).map_err(|e| e.to_string())?;
        zip.start_file("audit.jsonl", zip::write::SimpleFileOptions::default()).map_err(|e| e.to_string())?;
        zip.write_all(plano.as_bytes()).map_err(|e| e.to_string())?;
        zip.finish().map_err(|e| e.to_string())?;
    }
    Ok(json!({"project_id": id, "file": salida.display().to_string(), "format": formato,
              "only": solo, "n_images": imagenes.len(), "includes_audit": con_audit,
              "blind_locked": bloqueada}))
}

/// Lee `audit.jsonl` desde un `seq` (entero) o una marca de tiempo ISO.
pub fn audit_read(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let ruta = state.project_dir(&id)?.join(crate::audit::log::FILE_NAME);
    if !ruta.exists() {
        return Ok(json!({"project_id": id, "events": []}));
    }
    let limite = a.get("limit").and_then(|v| v.as_u64()).unwrap_or(500) as usize;
    let desde_seq = a.get("since").and_then(|v| v.as_u64());
    let desde_t = a.get("since").and_then(|v| v.as_str());
    let plano = crate::audit::cifrado::leer(&ruta)?.plano;
    let eventos: Vec<Value> = plano
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter(|e| match (desde_seq, desde_t) {
            (Some(s), _) => e["seq"].as_u64().map_or(false, |x| x >= s),
            (_, Some(t)) => e["t_wall"].as_str().map_or(false, |x| x >= t),
            _ => true,
        })
        .take(limite)
        .collect();
    Ok(json!({"project_id": id, "n": eventos.len(), "events": eventos}))
}

pub fn audit_verify(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let r = crate::audit::verify_project(&state.project_dir(&id)?)?;
    serde_json::to_value(r).map(|v| json!({"project_id": id, "report": v})).map_err(|e| e.to_string())
}
