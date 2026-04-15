use tauri::{AppHandle, State};

use crate::serve::ServeState;
use crate::serve::server::ServeInfo;

#[tauri::command]
pub async fn start_serve(
    serve: State<'_, ServeState>,
    app: AppHandle,
    project_ids: Vec<String>,
    port: Option<u16>,
    auto_save: Option<bool>,
) -> Result<ServeInfo, String> {
    let port = port.unwrap_or(8090);
    let auto_save = auto_save.unwrap_or(false);
    serve.start(app, project_ids, port, auto_save).await
}

#[tauri::command]
pub async fn stop_serve(
    serve: State<'_, ServeState>,
) -> Result<(), String> {
    serve.stop().await
}

#[tauri::command]
pub async fn get_serve_status(
    serve: State<'_, ServeState>,
) -> Result<Option<ServeInfo>, String> {
    Ok(serve.status().await)
}

#[tauri::command]
pub async fn set_serve_auto_save(
    serve: State<'_, ServeState>,
    value: bool,
) -> Result<(), String> {
    serve.set_auto_save(value).await;
    Ok(())
}
