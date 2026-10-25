//! JSON-RPC 2.0 por stdio (un mensaje por línea), el transporte local de MCP.
//!
//! Sin red: lee de stdin y escribe en stdout; los logs van a stderr para no
//! ensuciar el canal. No hay token porque no hay socket: quien puede lanzar el
//! proceso ya tiene los permisos del usuario. Dónde viven los proyectos se decide
//! con la configuración local de Annotix, o con `ANNOTIX_MCP_PROJECTS_DIR`.

use std::io::{BufRead, Write};

use serde_json::{json, Value};

use crate::store::state::AppState;

use super::ops;

const PROTOCOLO: &str = "2024-11-05";

fn herramienta(name: &str, desc: &str, props: Value, req: &[&str]) -> Value {
    json!({"name": name, "description": desc,
           "inputSchema": {"type": "object", "properties": props, "required": req}})
}

pub fn herramientas() -> Vec<Value> {
    let s = json!({"type": "string"});
    let p = json!({"type": "string", "description": "id o nombre exacto del proyecto"});
    let confirm = json!({"type": "boolean", "description": "debe ser true"});
    vec![
        herramienta("project_create", "Crea un proyecto de detección (idempotente por nombre).",
            json!({"name": s, "replication": {"type":"integer"}, "blind": {"type":"boolean"},
                   "classes": {"type":"array","items":{"type":"object",
                       "properties":{"id":{"type":"integer"},"name":s,"color":s},"required":["id","name"]}}}),
            &["name", "classes"]),
        herramienta("project_list", "Lista los proyectos.", json!({}), &[]),
        herramienta("project_status", "Progreso por lector, pendientes y conflictos abiertos (solo conteos).",
            json!({"project": p}), &["project"]),
        herramienta("project_delete", "DESTRUCTIVO: borra el proyecto entero.",
            json!({"project": p, "confirm": confirm}), &["project", "confirm"]),
        herramienta("import_images", "Importa imágenes de un directorio o CSV; deduplica por sha256.",
            json!({"project": p, "dir": s, "manifest_csv": s,
                   "mode": {"type":"string","enum":["copy","symlink"]}}), &["project"]),
        herramienta("images_delete", "DESTRUCTIVO: borra imágenes por id.",
            json!({"project": p, "image_ids": {"type":"array","items":s}, "confirm": confirm}),
            &["project", "image_ids", "confirm"]),
        herramienta("import_annotations", "Importa cajas COCO como PRE-ETIQUETAS (no cuentan como lectura).",
            json!({"project": p, "coco_json": s, "origin": s, "model_version": s,
                   "status": {"type":"string","enum":["prelabel"]},
                   "class_ids": {"type":"array","items":{"type":"integer"},"description":"sólo estas clases"},
                   "name_prefixes": {"type":"array","items":s,"description":"sólo imágenes cuyo file_name empiece así"},
                   "model_sha256": s}),
            &["project", "coco_json", "origin", "model_version"]),
        herramienta("session_create", "Reparte imágenes entre lectores con semilla reproducible.",
            json!({"project": p, "readers": {"type":"array","items":s}, "assignment_seed": {"type":"integer"}}),
            &["project", "readers", "assignment_seed"]),
        herramienta("session_close", "DESTRUCTIVO: cierra la sesión.",
            json!({"project": p, "confirm": confirm}), &["project", "confirm"]),
        herramienta("agreement_report", "IoU por clase y kappa de presencia. En sesión ciega sin resolver, solo conteos.",
            json!({"project": p}), &["project"]),
        herramienta("conflicts_list", "Desacuerdos entre lectores. En sesión ciega sin resolver, solo el conteo.",
            json!({"project": p, "limit": {"type":"integer"}}), &["project"]),
        herramienta("export", "Exporta COCO o YOLO (solo la capa consolidada).",
            json!({"project": p, "format": {"type":"string","enum":["coco","yolo"]},
                   "only": {"type":"string","enum":["adjudicated","all"]},
                   "include_audit": {"type":"boolean"}, "output": s}), &["project"]),
        herramienta("audit_read", "Lee audit.jsonl desde un seq (entero) o una fecha ISO.",
            json!({"project": p, "since": {}, "limit": {"type":"integer"}}), &["project"]),
        herramienta("audit_verify", "Verifica la cadena de hash de audit.jsonl.",
            json!({"project": p}), &["project"]),
    ]
}

/// Atiende un mensaje. `None` para notificaciones (no se responde).
pub fn manejar(state: &AppState, msg: &Value) -> Option<Value> {
    let id = msg.get("id").cloned();
    let metodo = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let ok = |r: Value| id.clone().map(|i| json!({"jsonrpc":"2.0","id":i,"result":r}));
    let err = |code: i64, m: String| id.clone().map(|i| json!({"jsonrpc":"2.0","id":i,"error":{"code":code,"message":m}}));

    match metodo {
        "initialize" => ok(json!({
            "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or(PROTOCOLO),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "annotix-mcp", "version": env!("CARGO_PKG_VERSION")}})),
        "ping" => ok(json!({})),
        "tools/list" => ok(json!({"tools": herramientas()})),
        "tools/call" => {
            let nombre = msg["params"]["name"].as_str().unwrap_or("");
            let args = msg["params"].get("arguments").cloned().unwrap_or(json!({}));
            let (texto, es_error) = match ops::call(state, nombre, &args) {
                Ok(v) => (serde_json::to_string_pretty(&v).unwrap_or_default(), false),
                Err(e) => (e, true),
            };
            ok(json!({"content": [{"type":"text","text": texto}], "isError": es_error}))
        }
        m if m.starts_with("notifications/") => None,
        _ if id.is_none() => None,
        _ => err(-32601, format!("Método desconocido: {}", metodo)),
    }
}

pub fn run_stdio() -> Result<(), String> {
    let state = AppState::new()?;
    if let Ok(d) = std::env::var("ANNOTIX_MCP_PROJECTS_DIR") {
        if let Ok(mut c) = state.config.lock() {
            c.projects_dir = Some(d.into());
        }
    }
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for linea in stdin.lock().lines() {
        let linea = linea.map_err(|e| e.to_string())?;
        if linea.trim().is_empty() {
            continue;
        }
        let respuesta = match serde_json::from_str::<Value>(&linea) {
            Ok(m) => manejar(&state, &m),
            Err(e) => Some(json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":e.to_string()}})),
        };
        if let Some(r) = respuesta {
            writeln!(out, "{}", r).map_err(|e| e.to_string())?;
            out.flush().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
