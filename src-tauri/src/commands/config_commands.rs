use serde::Serialize;
use tauri::State;

use crate::store::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub update_available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: String,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");

    let client = reqwest::Client::builder()
        .user_agent("Annotix")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/Debaq/Annotix/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Error de red: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API respondió con estado {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Error parseando respuesta: {}", e))?;

    let tag = body["tag_name"]
        .as_str()
        .ok_or("No se encontró tag_name en la release")?;
    let latest = tag.trim_start_matches('v');

    let release_url = body["html_url"]
        .as_str()
        .unwrap_or("https://github.com/Debaq/Annotix/releases")
        .to_string();

    let release_notes = body["body"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let update_available = version_is_newer(current, latest);

    Ok(UpdateInfo {
        update_available,
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        release_url,
        release_notes,
    })
}

/// Compara dos versiones semánticas, retorna true si `latest` > `current`
fn version_is_newer(current: &str, latest: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.')
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let c = parse(current);
    let l = parse(latest);
    for i in 0..3 {
        let cv = c.get(i).copied().unwrap_or(0);
        let lv = l.get(i).copied().unwrap_or(0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}

#[tauri::command]
pub fn is_setup_complete(state: State<AppState>) -> Result<bool, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.projects_dir.is_some())
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<crate::store::config::AppConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn set_projects_dir(state: State<AppState>, path: String) -> Result<(), String> {
    let dir = std::path::PathBuf::from(&path);

    // Verificar que el directorio existe o crearlo
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("No se pudo crear el directorio: {}", e))?;
    }

    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.projects_dir = Some(dir);
    config.save(&state.data_dir)?;

    log::info!("Directorio de proyectos configurado: {}", path);
    Ok(())
}

#[tauri::command]
pub fn save_network_config(
    state: State<AppState>,
    serve_auto_start: bool,
    serve_port: u16,
    serve_auto_save: bool,
    p2p_disabled: bool,
) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.serve.auto_start = serve_auto_start;
    config.serve.port = serve_port;
    config.serve.auto_save = serve_auto_save;
    config.p2p_disabled = p2p_disabled;
    config.save(&state.data_dir)?;
    Ok(())
}
