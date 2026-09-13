use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::AppState;
use tauri::State;

#[tauri::command]
pub async fn export_dataset(
    project_id: String,
    format: String,
    output_path: String,
    normalize_to_jpg: Option<bool>,
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Export)
        .await?;

    let fmt = study_format(&format);
    crate::study::emit_quiet(
        crate::study::events::EXPORT_START,
        serde_json::json!({ "format": fmt }),
    );
    let t0 = std::time::Instant::now();
    let res = crate::export::export_dataset(
        &state,
        &project_id,
        &format,
        &output_path,
        normalize_to_jpg.unwrap_or(false),
        &app,
    );
    crate::study::emit_quiet(
        crate::study::events::EXPORT_END,
        serde_json::json!({
            "ok": res.is_ok(),
            "format": fmt,
            // Un dataset no pasa por el contrato de modelo: solo el modelo
            // exportado puede marcar `contract_valid`.
            "contract_valid": false,
            "duration_ms": t0.elapsed().as_millis() as u64,
        }),
    );
    res
}

/// Normaliza el nombre de formato para que no viaje texto libre al registro.
fn study_format(format: &str) -> String {
    format
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(24)
        .collect::<String>()
        .to_lowercase()
}
