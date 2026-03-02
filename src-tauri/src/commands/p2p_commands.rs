use tauri::State;

use crate::p2p::node::P2pState;
use crate::p2p::{BatchInfo, ImageLockInfo, P2pSessionInfo, PeerInfo, SessionRules};
use crate::store::project_file::AnnotationEntry;
use crate::store::state::AppState;

#[tauri::command]
pub async fn p2p_create_session(
    p2p: State<'_, P2pState>,
    app_state: State<'_, AppState>,
    project_id: String,
    display_name: String,
    rules: SessionRules,
) -> Result<P2pSessionInfo, String> {
    p2p.create_session(&app_state, &project_id, &display_name, rules).await
}

#[tauri::command]
pub async fn p2p_join_session(
    p2p: State<'_, P2pState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    share_code: String,
    display_name: String,
) -> Result<P2pSessionInfo, String> {
    p2p.join_session(&app_state, &app_handle, &share_code, &display_name).await
}

#[tauri::command]
pub async fn p2p_leave_session(
    p2p: State<'_, P2pState>,
) -> Result<(), String> {
    p2p.leave_session().await
}

#[tauri::command]
pub async fn p2p_get_session_info(
    p2p: State<'_, P2pState>,
) -> Result<Option<P2pSessionInfo>, String> {
    Ok(p2p.get_session_info().await)
}

#[tauri::command]
pub async fn p2p_lock_image(
    p2p: State<'_, P2pState>,
    image_id: String,
) -> Result<bool, String> {
    p2p.lock_image(&image_id).await
}

#[tauri::command]
pub async fn p2p_unlock_image(
    p2p: State<'_, P2pState>,
    image_id: String,
) -> Result<(), String> {
    p2p.unlock_image(&image_id).await
}

#[tauri::command]
pub async fn p2p_get_image_lock(
    p2p: State<'_, P2pState>,
    image_id: String,
) -> Result<Option<ImageLockInfo>, String> {
    p2p.get_image_lock(&image_id).await
}

#[tauri::command]
pub async fn p2p_assign_batch(
    p2p: State<'_, P2pState>,
    image_ids: Vec<String>,
    assign_to: String,
) -> Result<BatchInfo, String> {
    p2p.assign_batch(image_ids, &assign_to).await
}

#[tauri::command]
pub async fn p2p_sync_annotations(
    p2p: State<'_, P2pState>,
    image_id: String,
    annotations: Vec<AnnotationEntry>,
) -> Result<(), String> {
    crate::p2p::sync::sync_annotations_to_doc(&p2p, &image_id, &annotations).await
}

#[tauri::command]
pub async fn p2p_list_peers(
    p2p: State<'_, P2pState>,
) -> Result<Vec<PeerInfo>, String> {
    p2p.list_peers().await
}

#[tauri::command]
pub async fn p2p_update_rules(
    p2p: State<'_, P2pState>,
    rules: SessionRules,
) -> Result<(), String> {
    p2p.update_rules(rules).await
}

#[tauri::command]
pub async fn p2p_get_rules(
    p2p: State<'_, P2pState>,
) -> Result<SessionRules, String> {
    p2p.get_rules().await
}
