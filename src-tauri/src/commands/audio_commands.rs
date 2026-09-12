use tauri::{AppHandle, Emitter, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::audio::{
    AudioResponse, SaveAudioAnnotationRequest, SaveTranscriptionRequest, UploadAudioRequest,
};
use crate::store::AppState;

#[tauri::command]
pub async fn upload_audio(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    request: UploadAudioRequest,
) -> Result<String, String> {
    p2p.check_permission(&request.project_id, P2pPermission::UploadData)
        .await?;
    let lang = request.language.as_deref().unwrap_or("en");
    let id = state.upload_audio(
        &request.project_id,
        &request.file_path,
        request.duration_ms,
        request.sample_rate,
        lang,
    )?;
    let _ = app.emit("db:audio-changed", &request.project_id);
    Ok(id)
}

#[tauri::command]
pub fn get_audio(
    state: State<'_, AppState>,
    project_id: String,
    id: String,
) -> Result<Option<AudioResponse>, String> {
    state.get_audio(&project_id, &id)
}

#[tauri::command]
pub fn list_audio_by_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<AudioResponse>, String> {
    state.list_audio(&project_id)
}

#[tauri::command]
pub async fn save_transcription(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    request: SaveTranscriptionRequest,
) -> Result<(), String> {
    p2p.check_permission(&request.project_id, P2pPermission::Annotate)
        .await?;
    state.save_transcription(
        &request.project_id,
        &request.audio_id,
        &request.transcription,
        request.speaker_id.as_deref(),
        request.language.as_deref(),
    )?;
    let _ = app.emit("db:audio-changed", &request.project_id);
    Ok(())
}

#[tauri::command]
pub async fn delete_audio(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    id: String,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Delete)
        .await?;
    state.delete_audio(&project_id, &id)?;
    let _ = app.emit("db:audio-changed", &project_id);
    Ok(())
}

#[tauri::command]
pub fn get_audio_file_path(
    state: State<'_, AppState>,
    project_id: String,
    audio_id: String,
) -> Result<String, String> {
    state.get_audio_file_path(&project_id, &audio_id)
}

#[tauri::command]
pub fn get_audio_data(
    state: State<'_, AppState>,
    project_id: String,
    audio_id: String,
) -> Result<Vec<u8>, String> {
    state.get_audio_data(&project_id, &audio_id)
}

#[tauri::command]
pub async fn save_audio_annotation(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    request: SaveAudioAnnotationRequest,
) -> Result<(), String> {
    p2p.check_permission(&request.project_id, P2pPermission::Annotate)
        .await?;
    let project_id = request.project_id.clone();
    state.save_audio_annotation(request)?;
    let _ = app.emit("db:audio-changed", &project_id);
    Ok(())
}
