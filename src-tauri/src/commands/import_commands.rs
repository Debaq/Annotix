use tauri::State;
use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::AppState;
use crate::import::{DetectionResult, ImportResult};

#[tauri::command]
pub fn detect_import_format(file_path: String) -> Result<DetectionResult, String> {
    crate::import::detect_format(&file_path)
}

#[tauri::command]
pub async fn import_dataset(
    file_path: String,
    project_name: String,
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: tauri::AppHandle,
) -> Result<ImportResult, String> {
    p2p.check_permission(P2pPermission::UploadData).await?;
    crate::import::import_dataset(&state, &file_path, &project_name, &app)
}
