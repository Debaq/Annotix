use tauri::State;

use crate::store::AppState;

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
