use tauri::{AppHandle, Emitter, State};

use crate::db::models::{TimeSeriesAnnotation, TimeSeriesRecord};
use crate::db::Database;

#[tauri::command]
pub fn create_timeseries(
    db: State<'_, Database>,
    app: AppHandle,
    project_id: i64,
    name: String,
    data: serde_json::Value,
) -> Result<i64, String> {
    let id = db.create_timeseries(project_id, &name, &data, &[])?;
    let _ = app.emit("db:timeseries-changed", project_id);
    Ok(id)
}

#[tauri::command]
pub fn get_timeseries(db: State<'_, Database>, id: i64) -> Result<Option<TimeSeriesRecord>, String> {
    db.get_timeseries(id)
}

#[tauri::command]
pub fn list_timeseries_by_project(
    db: State<'_, Database>,
    project_id: i64,
) -> Result<Vec<TimeSeriesRecord>, String> {
    db.list_timeseries_by_project(project_id)
}

#[tauri::command]
pub fn save_ts_annotations(
    db: State<'_, Database>,
    app: AppHandle,
    timeseries_id: i64,
    annotations: Vec<TimeSeriesAnnotation>,
) -> Result<(), String> {
    db.save_ts_annotations(timeseries_id, &annotations)?;
    // Obtener project_id para el evento
    if let Ok(Some(ts)) = db.get_timeseries(timeseries_id) {
        let _ = app.emit("db:timeseries-changed", ts.project_id);
    }
    Ok(())
}

#[tauri::command]
pub fn delete_timeseries(
    db: State<'_, Database>,
    app: AppHandle,
    id: i64,
) -> Result<(), String> {
    let project_id = db.get_timeseries(id)?.map(|ts| ts.project_id);
    db.delete_timeseries(id)?;
    if let Some(pid) = project_id {
        let _ = app.emit("db:timeseries-changed", pid);
    }
    Ok(())
}
