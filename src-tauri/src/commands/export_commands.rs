use tauri::State;
use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::AppState;

#[tauri::command]
pub async fn export_dataset(
    project_id: String,
    format: String,
    output_path: String,
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Export).await?;
    crate::export::export_dataset(&state, &project_id, &format, &output_path, &app)
}
