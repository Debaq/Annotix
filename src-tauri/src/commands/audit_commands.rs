use tauri::State;

use crate::audit::{verify_project, AuditReport};
use crate::store::state::AppState;

/// Verifica el registro de auditoría del proyecto: cadena, orden y taxonomía.
///
/// Se expone porque la garantía no vale de nada si sólo la puede comprobar el
/// propio programa por dentro. Un revisor externo puede además rehacer la cuenta
/// a mano sobre el archivo: cada línea lleva el SHA-256 de la anterior y el suyo
/// propio sobre el texto, sin depender de cómo serialice nada.
#[tauri::command]
pub fn verify_audit_log(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<AuditReport, String> {
    let dir = state.project_dir(&project_id)?;
    verify_project(&dir)
}

/// Últimos eventos del registro, del más reciente al más antiguo.
///
/// Para mirar qué pasó sin abrir el archivo a mano. Devuelve las líneas ya
/// parseadas; el archivo sigue siendo la fuente y se puede leer con cualquier
/// herramienta de JSON Lines.
#[tauri::command]
pub fn read_audit_tail(
    state: State<'_, AppState>,
    project_id: String,
    limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let path = state
        .project_dir(&project_id)?
        .join(crate::audit::log::FILE_NAME);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("No se pudo leer el registro: {}", e))?;
    Ok(content
        .lines()
        .rev()
        .take(limit.clamp(1, 1000))
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect())
}
