//! Una función por herramienta, sobre [`AppState`]. Devuelven JSON y no escriben
//! en `audit.jsonl`: eso lo hace [`call`], que envuelve a todas por igual.

mod export;
mod import;
mod project;
mod session;

use serde_json::{json, Value};

use crate::store::project_file::ProjectFile;
use crate::store::state::AppState;

use super::meta::McpMeta;

pub const ACTOR: &str = "agent:mcp";

/// Herramientas que sólo leen: su resultado no se copia al registro.
const SOLO_LECTURA: &[&str] = &[
    "project_list",
    "project_status",
    "agreement_report",
    "conflicts_list",
    "audit_read",
    "audit_verify",
];

pub fn call(state: &AppState, tool: &str, args: &Value) -> Result<Value, String> {
    let res = dispatch(state, tool, args);
    registrar(state, tool, args, &res);
    res
}

fn dispatch(state: &AppState, tool: &str, a: &Value) -> Result<Value, String> {
    match tool {
        "project_create" => project::create(state, a),
        "project_list" => project::list(state),
        "project_status" => project::status(state, a),
        "project_delete" => project::delete(state, a),
        "import_images" => import::images(state, a),
        "images_delete" => import::delete_images(state, a),
        "import_annotations" => import::annotations(state, a),
        "session_create" => session::create(state, a),
        "session_close" => session::close(state, a),
        "agreement_report" => session::agreement(state, a),
        "conflicts_list" => session::conflicts(state, a),
        "export" => export::export(state, a),
        "audit_read" => export::audit_read(state, a),
        "audit_verify" => export::audit_verify(state, a),
        _ => Err(format!("Herramienta desconocida: {}", tool)),
    }
}

// ─── Registro ───────────────────────────────────────────────────────────────

fn registrar(state: &AppState, tool: &str, args: &Value, res: &Result<Value, String>) {
    let project_id = args
        .get("project")
        .and_then(|v| v.as_str())
        .and_then(|p| project::resolve(state, p).ok())
        .or_else(|| {
            res.as_ref()
                .ok()
                .and_then(|r| r.get("project_id"))
                .and_then(|v| v.as_str())
                .map(String::from)
        });
    let Some(pid) = project_id else { return };
    let Ok(dir) = state.project_dir(&pid) else { return };
    if !dir.exists() {
        return; // el proyecto se borró: lo anota `project::delete` aparte
    }
    crate::audit::set_actor(&pid, Some(ACTOR.to_string()));
    let (ok, result) = match res {
        Ok(v) if SOLO_LECTURA.contains(&tool) => (true, Value::Null),
        Ok(v) => (true, v.clone()),
        Err(e) => (false, json!(e)),
    };
    crate::audit::record_quiet(
        &dir,
        &pid,
        crate::audit::events::MCP_ACTION,
        json!({ "tool": tool, "args": args, "ok": ok, "result": result }),
    );
}

// ─── Utilidades de argumentos ───────────────────────────────────────────────

pub(crate) fn req_str<'a>(a: &'a Value, k: &str) -> Result<&'a str, String> {
    a.get(k)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Falta el argumento '{}'", k))
}

pub(crate) fn opt_str<'a>(a: &'a Value, k: &str) -> Option<&'a str> {
    a.get(k).and_then(|v| v.as_str()).filter(|s| !s.is_empty())
}

pub(crate) fn exigir_confirm(a: &Value, accion: &str) -> Result<(), String> {
    if a.get("confirm").and_then(|v| v.as_bool()) == Some(true) {
        Ok(())
    } else {
        Err(format!(
            "{} es destructivo: repite la llamada con confirm=true",
            accion
        ))
    }
}

/// Resuelve el proyecto de los argumentos y deja el estado fresco: otro proceso
/// (la app) puede haber escrito desde la última llamada, y el cache de este proceso
/// no debe pisarlo.
pub(crate) fn proyecto(state: &AppState, a: &Value) -> Result<String, String> {
    let id = project::resolve(state, req_str(a, "project")?)?;
    state.evict_from_cache(&id);
    Ok(id)
}

pub(crate) fn meta_de(state: &AppState, id: &str) -> Result<McpMeta, String> {
    McpMeta::load(&state.project_dir(id)?)
}

// ─── Cegado ─────────────────────────────────────────────────────────────────

/// ¿Está la sesión ciega y sin resolver?
///
/// Mientras lo esté, ninguna herramienta devuelve más que conteos. Una imagen está
/// resuelta cuando tiene una etiqueta adjudicada, o cuando todas las lecturas
/// pedidas están entregadas y coinciden del todo (no hay nada que adjudicar).
pub(crate) fn ciego_sin_resolver(pf: &ProjectFile, meta: &McpMeta) -> bool {
    let Some(sesion) = meta.session.as_ref().filter(|_| meta.blind) else {
        return false;
    };
    let cola = crate::store::agreement::cola_de_discrepancias(pf, 500);
    let cola_completa = cola.len() >= 500;
    let discrepantes: std::collections::HashSet<&str> =
        cola.iter().map(|d| d.image_id.as_str()).collect();
    let repl = meta.replication();
    pf.images.iter().any(|img| {
        if !sesion.assignments.contains_key(&img.id) {
            return false;
        }
        let adjudicada = img
            .annotations
            .iter()
            .any(|an| an.origin.as_deref() == Some("adjudicated"));
        if adjudicada {
            return false;
        }
        img.submitted_readings() < repl
            || cola_completa
            || discrepantes.contains(img.id.as_str())
    })
}
