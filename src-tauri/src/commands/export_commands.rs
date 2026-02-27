use tauri::State;
use crate::db::Database;

#[tauri::command]
pub async fn export_dataset(
    project_id: i64,
    format: String,
    output_path: String,
    db: State<'_, Database>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let db_ref = &*db;
    crate::export::export_dataset(db_ref, project_id, &format, &output_path, &app)
}
