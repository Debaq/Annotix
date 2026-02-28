use tauri::State;
use crate::store::AppState;
use crate::import::{DetectionResult, ImportResult};

#[tauri::command]
pub fn detect_import_format(file_path: String) -> Result<DetectionResult, String> {
    crate::import::detect_format(&file_path)
}

#[tauri::command]
pub fn import_dataset(
    file_path: String,
    project_name: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<ImportResult, String> {
    crate::import::import_dataset(&state, &file_path, &project_name, &app)
}
