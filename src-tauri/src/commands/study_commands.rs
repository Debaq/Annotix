//! Comandos del modo estudio (Tareas 1, 2 y 5).

use std::path::PathBuf;

use serde_json::Value;
use tauri::State;

use crate::store::config::StudyConfig;
use crate::store::AppState;
use crate::study::{events, export, log, verify};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyStatus {
    pub enabled: bool,
    pub session_id: String,
    pub condition: String,
    /// Hay una sesión abierta en este arranque de la app.
    pub active: bool,
    pub logs_dir: String,
    /// Eventos escritos en la sesión en curso.
    pub seq: u64,
}

#[tauri::command]
pub fn study_get_status(state: State<AppState>) -> Result<StudyStatus, String> {
    let cfg = state.get_app_config()?.study;
    let current = log::current();
    Ok(StudyStatus {
        enabled: cfg.enabled,
        session_id: cfg.session_id,
        condition: cfg.condition,
        active: current.is_some(),
        logs_dir: log::logs_dir()
            .map(|d| d.display().to_string())
            .unwrap_or_default(),
        seq: current.map(|c| c.3).unwrap_or(0),
    })
}

/// Activa o desactiva el modo estudio. Al activar abre la sesión y emite
/// `session.start`; al desactivar emite `session.end` con motivo `user`.
#[tauri::command]
pub fn study_set_config(
    state: State<AppState>,
    enabled: bool,
    session_id: String,
    condition: String,
    screen_w: u32,
    screen_h: u32,
) -> Result<StudyStatus, String> {
    let session_id = session_id.trim().to_string();
    let condition = condition.trim().to_string();

    if enabled {
        log::validate_session_id(&session_id)?;
        log::validate_condition(&condition)?;
    }

    // Cerrar la sesión anterior antes de cualquier cambio de identidad.
    if log::is_active() {
        log::end_session("user");
    }

    if enabled {
        log::start_session(&session_id, &condition, screen_w, screen_h)?;
    }

    {
        let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
        cfg.study = StudyConfig {
            enabled,
            session_id: session_id.clone(),
            condition: condition.clone(),
        };
        cfg.save(&state.data_dir)?;
    }

    study_get_status(state)
}

/// Reabre la sesión al arrancar la app si el modo estudio quedó activado.
/// La interfaz la llama una vez, en cuanto conoce el tamaño de pantalla.
#[tauri::command]
pub fn study_resume_session(
    state: State<AppState>,
    screen_w: u32,
    screen_h: u32,
) -> Result<StudyStatus, String> {
    let cfg = state.get_app_config()?.study;
    if cfg.enabled && !log::is_active() {
        log::start_session(&cfg.session_id, &cfg.condition, screen_w, screen_h)?;
    }
    study_get_status(state)
}

/// Emite un evento desde la interfaz. Equivalente a `study::log::emit`.
#[tauri::command]
pub fn study_log_emit(event: String, payload: Option<Value>) -> Result<(), String> {
    log::emit(&event, payload.unwrap_or(Value::Null))
}

/// Verifica la cadena de hash y la monotonía de un archivo de registro.
#[tauri::command]
pub fn study_log_verify(path: String) -> Result<verify::VerifyReport, String> {
    verify::verify_file(&PathBuf::from(path))
}

/// Lista los archivos `.jsonl` de una sesión.
#[tauri::command]
pub fn study_log_list(session_id: String) -> Result<Vec<String>, String> {
    Ok(export::session_files(&session_id)?
        .into_iter()
        .map(|p| p.display().to_string())
        .collect())
}

/// Copia los registros de la sesión al destino elegido y escribe el manifiesto.
#[tauri::command]
pub fn study_log_export(
    session_id: String,
    dest_dir: String,
) -> Result<export::ExportResult, String> {
    export::export_session(&session_id, &PathBuf::from(dest_dir))
}

/// Abre el directorio de registros en el explorador del sistema.
#[tauri::command]
pub fn study_open_logs_dir() -> Result<(), String> {
    let dir = log::logs_dir().ok_or("Registro de estudio sin inicializar")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    crate::commands::settings_commands::open_path_in_file_manager(&dir)
}

/// Taxonomía disponible para la interfaz (nombres de evento y pasos válidos).
#[tauri::command]
pub fn study_get_taxonomy() -> Result<Value, String> {
    Ok(serde_json::json!({
        "events": events::EVENT_NAMES,
        "steps": events::STEP_IDS,
        "modalities": events::MODALITIES,
        "netPurposes": events::NET_PURPOSES,
    }))
}
