use tauri::{AppHandle, Emitter, Manager, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::images::{ConversionReport, ImageResponse};
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
    let _ = state;
    let app_cb = app.clone();
    let pid = project_id.clone();
    let project_id_clone = project_id.clone();
    let file_paths_clone = file_paths.clone();
    let app_for_state = app.clone();
    let ids = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>, String> {
        let state = app_for_state.state::<AppState>();
        state.upload_images_with_progress(&project_id_clone, &file_paths_clone, move |current, total, name| {
            let _ = app_cb.emit("upload:progress", serde_json::json!({
                "projectId": pid,
                "current": current,
                "total": total,
                "fileName": name,
            }));
        })
    })
    .await
    .map_err(|e| format!("Join error: {}", e))??;
    let _ = app.emit("db:images-changed", serde_json::json!({
        "projectId": &project_id,
        "action": "added",
        "imageIds": &ids,
    }));

    // Sincronizar imágenes nuevas al doc P2P si hay sesión activa
    let has_session = p2p.get_session_info(&project_id).await.is_some();
    if has_session {
        for image_id in &ids {
            let img_info = state.with_project(&project_id, |pf| {
                pf.images.iter().find(|i| &i.id == image_id).map(|i| {
                    (i.name.clone(), i.file.clone(), i.width, i.height, i.status.clone(), i.annotations.clone())
                })
            })?;
            if let Some((name, file, width, height, status, annots)) = img_info {
                let images_dir = state.project_images_dir(&project_id)?;
                let image_path = images_dir.join(&file);
                if let Err(e) = crate::p2p::sync::sync_new_image_to_doc(
                    &p2p, &project_id, image_id, &name, &file, width, height, &status, &annots, &image_path,
                ).await {
                    log::warn!("Error sincronizando imagen {} al P2P: {}", image_id, e);
                }
            }
        }
    }

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
    let _ = state;
    let app_for_state = app.clone();
    let pid = project_id.clone();
    let fname = file_name.clone();
    let annots = annotations.clone();
    let id = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let state = app_for_state.state::<AppState>();
        state.upload_image_bytes(&pid, &fname, &data, &annots, None, None)
    })
    .await
    .map_err(|e| format!("Join error: {}", e))??;
    let _ = app.emit("db:images-changed", serde_json::json!({
        "projectId": &project_id,
        "action": "added",
        "imageIds": [&id],
    }));

    // Sincronizar imagen al doc P2P si hay sesión activa
    let has_session = p2p.get_session_info(&project_id).await.is_some();
    if has_session {
        let img_info = state.with_project(&project_id, |pf| {
            pf.images.iter().find(|i| i.id == id).map(|i| {
                (i.name.clone(), i.file.clone(), i.width, i.height, i.status.clone(), i.annotations.clone())
            })
        })?;
        if let Some((name, file, width, height, status, annots)) = img_info {
            let images_dir = state.project_images_dir(&project_id)?;
            let image_path = images_dir.join(&file);
            if let Err(e) = crate::p2p::sync::sync_new_image_to_doc(
                &p2p, &project_id, &id, &name, &file, width, height, &status, &annots, &image_path,
            ).await {
                log::warn!("Error sincronizando imagen {} al P2P: {}", id, e);
            }
        }
    }

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
    let _ = app.emit("db:images-changed", serde_json::json!({
        "projectId": &project_id,
        "action": "updated",
        "imageIds": [&image_id],
    }));

    // Sincronizar anotaciones al doc P2P si hay sesión activa
    let has_session = p2p.get_session_info(&project_id).await.is_some();
    if has_session {
        if let Err(e) = crate::p2p::sync::sync_annotations_to_doc(
            &p2p, &project_id, &image_id, &annotations,
        ).await {
            log::warn!("Error sincronizando anotaciones al P2P: {}", e);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn convert_project_images(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    target_format: String,
) -> Result<ConversionReport, String> {
    let report = state.convert_project_images(&project_id, &target_format)?;
    let _ = app.emit("db:projects-changed", ());
    let _ = app.emit("db:images-changed", serde_json::json!({
        "projectId": &project_id,
        "action": "updated",
    }));
    Ok(report)
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
    let _ = app.emit("db:images-changed", serde_json::json!({
        "projectId": &project_id,
        "action": "deleted",
        "imageIds": [&id],
    }));
    Ok(())
}
