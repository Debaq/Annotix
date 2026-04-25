use tauri::{Emitter, State};
use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::AppState;
use crate::import::{DetectionResult, ImportResult};
use crate::import::merge::{AnalyzeResult, CanonicalClass, ClassMapping};

#[tauri::command]
pub fn detect_import_format(file_path: String) -> Result<DetectionResult, String> {
    crate::import::detect_format(&file_path)
}

#[tauri::command]
pub async fn import_dataset(
    file_path: String,
    project_name: String,
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: tauri::AppHandle,
) -> Result<ImportResult, String> {
    // Import creates a new project, not part of any P2P session — pass empty to allow
    p2p.check_permission("", P2pPermission::UploadData).await?;
    crate::import::import_dataset(&state, &file_path, &project_name, &app)
}

#[tauri::command]
pub async fn analyze_tix_projects(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<AnalyzeResult, String> {
    tauri::async_runtime::spawn_blocking(move || crate::import::merge::analyze(paths, Some(&app)))
        .await
        .map_err(|e| format!("Error en tarea de análisis: {}", e))?
}

#[tauri::command]
pub async fn merge_tix_projects(
    paths: Vec<String>,
    canonical_classes: Vec<CanonicalClass>,
    mappings: Vec<ClassMapping>,
    project_name: String,
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: tauri::AppHandle,
) -> Result<ImportResult, String> {
    p2p.check_permission("", P2pPermission::UploadData).await?;
    let emit_progress = |p: f64| {
        let _ = app.emit("merge:progress", p);
    };
    crate::import::merge::merge(&state, paths, canonical_classes, mappings, project_name, emit_progress)
}
