use tauri::{AppHandle, Emitter, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::images::ImageResponse;
use crate::store::project_file::AnnotationEntry;
use crate::store::AppState;

#[tauri::command]
pub async fn upload_images(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    file_paths: Vec<String>,
) -> Result<Vec<String>, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData).await?;
    let ids = state.upload_images(&project_id, &file_paths)?;
    let _ = app.emit("db:images-changed", &project_id);
    Ok(ids)
}

#[tauri::command]
pub async fn upload_image_bytes(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    file_name: String,
    data: Vec<u8>,
    annotations: Vec<AnnotationEntry>,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData).await?;
    let id = state.upload_image_bytes(&project_id, &file_name, &data, &annotations, None, None)?;
    let _ = app.emit("db:images-changed", &project_id);
    Ok(id)
}

#[tauri::command]
pub fn get_image(
    state: State<'_, AppState>,
    project_id: String,
    id: String,
) -> Result<Option<ImageResponse>, String> {
    state.store_get_image(&project_id, &id)
}

#[tauri::command]
pub fn list_images_by_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<ImageResponse>, String> {
    state.list_images(&project_id)
}

#[tauri::command]
pub fn get_image_data(
    state: State<'_, AppState>,
    project_id: String,
    id: String,
) -> Result<Vec<u8>, String> {
    let path = state.get_image_file_path(&project_id, &id)?;
    std::fs::read(&path).map_err(|e| format!("Error leyendo imagen: {}", e))
}

#[tauri::command]
pub fn get_image_file_path(
    state: State<'_, AppState>,
    project_id: String,
    id: String,
) -> Result<String, String> {
    let path = state.get_image_file_path(&project_id, &id)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_annotations(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    image_id: String,
    annotations: Vec<AnnotationEntry>,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
    state.save_annotations(&project_id, &image_id, &annotations)?;
    let _ = app.emit("db:images-changed", &project_id);
    Ok(())
}

#[tauri::command]
pub async fn delete_image(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    id: String,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Delete).await?;
    state.delete_image(&project_id, &id)?;
    let _ = app.emit("db:images-changed", &project_id);
    Ok(())
}
