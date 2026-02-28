use tauri::State;
use crate::store::AppState;

#[tauri::command]
pub async fn export_dataset(
    project_id: String,
    format: String,
    output_path: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    crate::export::export_dataset(&state, &project_id, &format, &output_path, &app)
}
