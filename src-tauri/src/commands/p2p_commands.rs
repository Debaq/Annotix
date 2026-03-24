use tauri::{Manager, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::p2p::{sync, BatchInfo, ImageLockInfo, P2pSessionInfo, PeerInfo, PeerRole, PeerWorkStats, PendingApproval, SessionRules, WorkDistribution};
use crate::store::project_file::AnnotationEntry;
use crate::store::state::AppState;

#[tauri::command]
pub async fn p2p_create_session(
    p2p: State<'_, P2pState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    project_id: String,
    display_name: String,
    rules: SessionRules,
) -> Result<P2pSessionInfo, String> {
    p2p.create_session(&app_state, &app_handle, &project_id, &display_name, rules).await
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
    app_state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    p2p.leave_session(&project_id, &app_state).await
}

#[tauri::command]
pub async fn p2p_pause_session(
    p2p: State<'_, P2pState>,
    project_id: String,
) -> Result<String, String> {
    p2p.pause_session(&project_id).await
}

#[tauri::command]
pub async fn p2p_resume_session(
    p2p: State<'_, P2pState>,
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<P2pSessionInfo, String> {
    let config = app_state.with_project(&project_id, |pf| {
        pf.p2p.clone()
    })?.ok_or("El proyecto no tiene configuración P2P guardada")?;

    p2p.resume_session(&app_state, &app_handle, &project_id, config).await
}

#[tauri::command]
pub async fn p2p_get_session_info(
    p2p: State<'_, P2pState>,
    project_id: String,
) -> Result<Option<P2pSessionInfo>, String> {
    Ok(p2p.get_session_info(&project_id).await)
}

#[tauri::command]
pub async fn p2p_get_all_sessions(
    p2p: State<'_, P2pState>,
) -> Result<Vec<P2pSessionInfo>, String> {
    Ok(p2p.get_all_sessions().await)
}

#[tauri::command]
pub async fn p2p_lock_image(
    p2p: State<'_, P2pState>,
    project_id: String,
    image_id: String,
) -> Result<bool, String> {
    p2p.lock_image(&project_id, &image_id).await
}

#[tauri::command]
pub async fn p2p_unlock_image(
    p2p: State<'_, P2pState>,
    project_id: String,
    image_id: String,
) -> Result<(), String> {
    p2p.unlock_image(&project_id, &image_id).await
}

#[tauri::command]
pub async fn p2p_get_image_lock(
    p2p: State<'_, P2pState>,
    project_id: String,
    image_id: String,
) -> Result<Option<ImageLockInfo>, String> {
    p2p.get_image_lock(&project_id, &image_id).await
}

#[tauri::command]
pub async fn p2p_assign_batch(
    p2p: State<'_, P2pState>,
    project_id: String,
    image_ids: Vec<String>,
    assign_to: String,
) -> Result<BatchInfo, String> {
    p2p.check_permission(&project_id, P2pPermission::Manage).await?;
    p2p.assign_batch(&project_id, image_ids, &assign_to).await
}

#[tauri::command]
pub async fn p2p_sync_annotations(
    p2p: State<'_, P2pState>,
    project_id: String,
    image_id: String,
    annotations: Vec<AnnotationEntry>,
) -> Result<(), String> {
    crate::p2p::sync::sync_annotations_to_doc(&p2p, &project_id, &image_id, &annotations).await
}

#[tauri::command]
pub async fn p2p_list_peers(
    p2p: State<'_, P2pState>,
    project_id: String,
) -> Result<Vec<PeerInfo>, String> {
    p2p.list_peers(&project_id).await
}

#[tauri::command]
pub async fn p2p_update_rules(
    p2p: State<'_, P2pState>,
    project_id: String,
    rules: SessionRules,
) -> Result<(), String> {
    p2p.update_rules(&project_id, rules).await
}

#[tauri::command]
pub async fn p2p_get_rules(
    p2p: State<'_, P2pState>,
    project_id: String,
) -> Result<SessionRules, String> {
    p2p.get_rules(&project_id).await
}

#[tauri::command]
pub async fn p2p_resume_download(
    app_state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    // Verificar que hay imágenes pendientes
    let has_pending = app_state.with_project(&project_id, |pf| {
        pf.p2p_download.is_some()
    })?;

    if !has_pending {
        return Ok(());
    }

    let app_handle_bg = app_handle.clone();
    let project_id_bg = project_id.clone();
    tokio::spawn(async move {
        let p2p = app_handle_bg.state::<P2pState>();
        let state = app_handle_bg.state::<AppState>();
        if let Err(e) = sync::download_project_images(&p2p, &state, &project_id_bg, &app_handle_bg).await {
            log::warn!("Error en p2p_resume_download: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn p2p_distribute_work(
    p2p: State<'_, P2pState>,
    app_state: State<'_, AppState>,
    project_id: String,
) -> Result<WorkDistribution, String> {
    p2p.distribute_work(&project_id, &app_state).await
}

#[tauri::command]
pub async fn p2p_adjust_assignment(
    p2p: State<'_, P2pState>,
    project_id: String,
    item_ids: Vec<String>,
    item_type: String,
    target_node_id: String,
) -> Result<WorkDistribution, String> {
    p2p.adjust_assignment(&project_id, item_ids, item_type, target_node_id).await
}

#[tauri::command]
pub async fn p2p_get_distribution(
    p2p: State<'_, P2pState>,
    project_id: String,
) -> Result<Option<WorkDistribution>, String> {
    p2p.read_distribution(&project_id).await
}

#[tauri::command]
pub async fn p2p_get_work_stats(
    p2p: State<'_, P2pState>,
    app_state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<PeerWorkStats>, String> {
    p2p.get_work_stats(&project_id, &app_state).await
}

#[tauri::command]
pub async fn p2p_update_peer_role(
    p2p: State<'_, P2pState>,
    project_id: String,
    node_id: String,
    new_role: PeerRole,
) -> Result<(), String> {
    p2p.update_peer_role(&project_id, &node_id, new_role).await
}

#[tauri::command]
pub async fn p2p_submit_data(
    p2p: State<'_, P2pState>,
    project_id: String,
    item_id: String,
    item_type: String,
) -> Result<(), String> {
    sync::submit_data_for_approval(&p2p, &project_id, &item_id, &item_type).await
}

#[tauri::command]
pub async fn p2p_approve_data(
    p2p: State<'_, P2pState>,
    project_id: String,
    item_id: String,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Manage).await?;
    sync::approve_data(&p2p, &project_id, &item_id).await
}

#[tauri::command]
pub async fn p2p_reject_data(
    p2p: State<'_, P2pState>,
    project_id: String,
    item_id: String,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Manage).await?;
    sync::reject_data(&p2p, &project_id, &item_id).await
}

#[tauri::command]
pub async fn p2p_list_pending_approvals(
    p2p: State<'_, P2pState>,
    project_id: String,
) -> Result<Vec<PendingApproval>, String> {
    sync::list_pending_approvals(&p2p, &project_id).await
}
