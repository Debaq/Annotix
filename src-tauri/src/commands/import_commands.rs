use tauri::State;
use crate::db::Database;
use crate::import::{DetectionResult, ImportResult};

#[tauri::command]
pub fn detect_import_format(file_path: String) -> Result<DetectionResult, String> {
    crate::import::detect_format(&file_path)
}

#[tauri::command]
pub fn import_dataset(
    file_path: String,
    project_name: String,
    db: State<'_, Database>,
    app: tauri::AppHandle,
) -> Result<ImportResult, String> {
    crate::import::import_dataset(&db, &file_path, &project_name, &app)
}
