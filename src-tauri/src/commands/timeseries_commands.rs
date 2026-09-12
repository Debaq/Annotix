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
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;
    let anns = annotations.unwrap_or_default();
    let id = state.create_timeseries(&project_id, &name, data, &anns)?;

    // Publicar la serie completa al doc P2P si hay sesión activa
    if p2p.get_session_info(&project_id).await.is_some() {
        let entry = state.with_project(&project_id, |pf| {
            pf.timeseries.iter().find(|t| t.id == id).cloned()
        })?;
        if let Some(entry) = entry {
            let data = state
                .read_timeseries_data(&project_id, &id)?
                .unwrap_or(serde_json::Value::Null);
            if let Err(e) =
                crate::p2p::sync::sync_new_timeseries_to_doc(&p2p, &project_id, &entry, &data).await
            {
                log::warn!("Error sincronizando serie temporal al P2P: {}", e);
            }
        }
    }

    let _ = app.emit(
        "db:timeseries-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "added",
            "timeseriesIds": [&id],
        }),
    );
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
    p2p.check_permission(&project_id, P2pPermission::Annotate)
        .await?;
    state.save_ts_annotations(&project_id, &timeseries_id, &annotations)?;

    if p2p.get_session_info(&project_id).await.is_some() {
        if let Err(e) = crate::p2p::sync::sync_ts_annotations_to_doc(
            &p2p,
            &project_id,
            &timeseries_id,
            &annotations,
        )
        .await
        {
            log::warn!("Error sincronizando anotaciones de serie al P2P: {}", e);
        }
    }

    let _ = app.emit(
        "db:timeseries-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "updated",
            "timeseriesIds": [&timeseries_id],
        }),
    );
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
    p2p.check_permission(&project_id, P2pPermission::Delete)
        .await?;
    state.delete_timeseries(&project_id, &id)?;
    let _ = app.emit(
        "db:timeseries-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "deleted",
            "timeseriesIds": [&id],
        }),
    );
    Ok(())
}
