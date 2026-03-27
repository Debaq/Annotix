use tauri::{AppHandle, Emitter, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::audio::AudioResponse;
use crate::store::project_file::{AudioSegment, AudioEvent};
use crate::store::AppState;

#[tauri::command]
pub async fn upload_audio(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    file_path: String,
    duration_ms: i64,
    sample_rate: i32,
    language: Option<String>,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData).await?;
    let lang = language.as_deref().unwrap_or("en");
    let id = state.upload_audio(&project_id, &file_path, duration_ms, sample_rate, lang)?;
    let _ = app.emit("db:audio-changed", &project_id);
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
    project_id: String,
    audio_id: String,
    transcription: String,
    speaker_id: Option<String>,
    language: Option<String>,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
    state.save_transcription(
        &project_id,
        &audio_id,
        &transcription,
        speaker_id.as_deref(),
        language.as_deref(),
    )?;
    let _ = app.emit("db:audio-changed", &project_id);
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
    p2p.check_permission(&project_id, P2pPermission::Delete).await?;
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
    project_id: String,
    audio_id: String,
    transcription: Option<String>,
    speaker_id: Option<String>,
    language: Option<String>,
    segments: Option<Vec<AudioSegment>>,
    class_id: Option<i64>,
    events: Option<Vec<AudioEvent>>,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
    state.save_audio_annotation(
        &project_id,
        &audio_id,
        transcription.as_deref(),
        speaker_id.as_deref(),
        language.as_deref(),
        segments,
        class_id,
        events,
    )?;
    let _ = app.emit("db:audio-changed", &project_id);
    Ok(())
}
