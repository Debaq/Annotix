use crate::store::AppState;
use crate::store::project_file::TabularDataEntry;
use crate::store::tabular::TabularPreview;

#[tauri::command]
pub fn upload_tabular_file(
    state: tauri::State<AppState>,
    project_id: String,
    source_path: String,
    file_name: String,
) -> Result<TabularDataEntry, String> {
    state.upload_tabular_file(&project_id, &source_path, &file_name)
}

#[tauri::command]
pub fn create_tabular_data(
    state: tauri::State<AppState>,
    project_id: String,
    name: String,
    columns: Vec<String>,
) -> Result<TabularDataEntry, String> {
    state.create_tabular_data(&project_id, &name, columns)
}

#[tauri::command]
pub fn update_tabular_rows(
    state: tauri::State<AppState>,
    project_id: String,
    data_id: String,
    rows: Vec<Vec<String>>,
) -> Result<(), String> {
    state.update_tabular_rows(&project_id, &data_id, rows)
}

#[tauri::command]
pub fn list_tabular_data(
    state: tauri::State<AppState>,
    project_id: String,
) -> Result<Vec<TabularDataEntry>, String> {
    state.with_project(&project_id, |pf| {
        pf.tabular_data.clone()
    })
}

#[tauri::command]
pub fn get_tabular_preview(
    state: tauri::State<AppState>,
    project_id: String,
    data_id: String,
    max_rows: Option<usize>,
) -> Result<TabularPreview, String> {
    state.get_tabular_preview(&project_id, &data_id, max_rows.unwrap_or(100))
}

#[tauri::command]
pub fn update_tabular_config(
    state: tauri::State<AppState>,
    project_id: String,
    data_id: String,
    target_column: Option<String>,
    feature_columns: Vec<String>,
    task_type: Option<String>,
) -> Result<(), String> {
    state.update_tabular_config(&project_id, &data_id, target_column, feature_columns, task_type)
}

#[tauri::command]
pub fn delete_tabular_data(
    state: tauri::State<AppState>,
    project_id: String,
    data_id: String,
) -> Result<(), String> {
    state.delete_tabular_data(&project_id, &data_id)
}
