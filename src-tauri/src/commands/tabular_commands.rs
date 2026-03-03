use tauri::State;

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::AppState;
use crate::store::project_file::TabularDataEntry;
use crate::store::tabular::TabularPreview;

#[tauri::command]
pub async fn upload_tabular_file(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    project_id: String,
    source_path: String,
    file_name: String,
) -> Result<TabularDataEntry, String> {
    p2p.check_permission(P2pPermission::UploadData).await?;
    state.upload_tabular_file(&project_id, &source_path, &file_name)
}

#[tauri::command]
pub async fn create_tabular_data(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    project_id: String,
    name: String,
    columns: Vec<String>,
) -> Result<TabularDataEntry, String> {
    p2p.check_permission(P2pPermission::UploadData).await?;
    state.create_tabular_data(&project_id, &name, columns)
}

#[tauri::command]
pub async fn update_tabular_rows(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    project_id: String,
    data_id: String,
    rows: Vec<Vec<String>>,
) -> Result<(), String> {
    p2p.check_permission(P2pPermission::Annotate).await?;
    state.update_tabular_rows(&project_id, &data_id, rows)
}

#[tauri::command]
pub fn list_tabular_data(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<TabularDataEntry>, String> {
    state.with_project(&project_id, |pf| {
        pf.tabular_data.clone()
    })
}

#[tauri::command]
pub fn get_tabular_preview(
    state: State<'_, AppState>,
    project_id: String,
    data_id: String,
    max_rows: Option<usize>,
) -> Result<TabularPreview, String> {
    state.get_tabular_preview(&project_id, &data_id, max_rows.unwrap_or(100))
}

#[tauri::command]
pub fn update_tabular_config(
    state: State<'_, AppState>,
    project_id: String,
    data_id: String,
    target_column: Option<String>,
    feature_columns: Vec<String>,
    task_type: Option<String>,
) -> Result<(), String> {
    state.update_tabular_config(&project_id, &data_id, target_column, feature_columns, task_type)
}

#[tauri::command]
pub async fn delete_tabular_data(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    project_id: String,
    data_id: String,
) -> Result<(), String> {
    p2p.check_permission(P2pPermission::Delete).await?;
    state.delete_tabular_data(&project_id, &data_id)
}
