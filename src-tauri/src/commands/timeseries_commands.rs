use tauri::{AppHandle, Emitter, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::project_file::TsAnnotationEntry;
use crate::store::timeseries::TimeSeriesResponse;
use crate::store::AppState;

#[tauri::command]
pub async fn create_timeseries(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    name: String,
    data: serde_json::Value,
    annotations: Option<Vec<TsAnnotationEntry>>,
) -> Result<String, String> {
    p2p.check_permission(P2pPermission::UploadData).await?;
    let anns = annotations.unwrap_or_default();
    let id = state.create_timeseries(&project_id, &name, data, &anns)?;
    let _ = app.emit("db:timeseries-changed", &project_id);
    Ok(id)
}

#[tauri::command]
pub fn get_timeseries(
    state: State<'_, AppState>,
    project_id: String,
    id: String,
) -> Result<Option<TimeSeriesResponse>, String> {
    state.get_timeseries(&project_id, &id)
}

#[tauri::command]
pub fn list_timeseries_by_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<TimeSeriesResponse>, String> {
    state.list_timeseries(&project_id)
}

#[tauri::command]
pub async fn save_ts_annotations(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    timeseries_id: String,
    annotations: Vec<TsAnnotationEntry>,
) -> Result<(), String> {
    p2p.check_permission(P2pPermission::Annotate).await?;
    state.save_ts_annotations(&project_id, &timeseries_id, &annotations)?;
    let _ = app.emit("db:timeseries-changed", &project_id);
    Ok(())
}

#[tauri::command]
pub async fn delete_timeseries(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    id: String,
) -> Result<(), String> {
    p2p.check_permission(P2pPermission::Delete).await?;
    state.delete_timeseries(&project_id, &id)?;
    let _ = app.emit("db:timeseries-changed", &project_id);
    Ok(())
}
