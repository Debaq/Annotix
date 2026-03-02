use crate::browser_automation::{
    AutomationRequest, AutomationSession, BrowserAutomationManager, DetectedBrowser,
    browser_detect, browser_session,
};
use crate::store::AppState;
use crate::store::config::BrowserAutomationConfig;
use serde::{Deserialize, Serialize};
use tauri::State;

#[tauri::command]
pub fn detect_browsers() -> Result<Vec<DetectedBrowser>, String> {
    Ok(browser_detect::detect_browsers())
}

#[tauri::command]
pub fn start_browser_automation(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    manager: State<'_, BrowserAutomationManager>,
    request: AutomationRequest,
) -> Result<String, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let auto_config = config.browser_automation.clone();
    drop(config);
    manager.start_automation(&app, request, auto_config)
}

#[tauri::command]
pub fn pause_automation(
    manager: State<'_, BrowserAutomationManager>,
    session_id: String,
) -> Result<(), String> {
    manager.pause(&session_id)
}

#[tauri::command]
pub fn resume_automation(
    manager: State<'_, BrowserAutomationManager>,
    session_id: String,
) -> Result<(), String> {
    manager.resume(&session_id)
}

#[tauri::command]
pub fn cancel_automation(
    manager: State<'_, BrowserAutomationManager>,
    session_id: String,
) -> Result<(), String> {
    manager.cancel(&session_id)
}

#[tauri::command]
pub fn get_automation_session(
    manager: State<'_, BrowserAutomationManager>,
    session_id: String,
) -> Result<Option<AutomationSession>, String> {
    Ok(manager.get_session(&session_id))
}

// ─── Nuevos comandos de configuración de Browser Automation ─────────────────

#[tauri::command]
pub fn get_browser_automation_config(
    state: State<'_, AppState>,
) -> Result<BrowserAutomationConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.browser_automation.clone())
}

#[tauri::command]
pub fn save_browser_automation_config(
    state: State<'_, AppState>,
    config: BrowserAutomationConfig,
) -> Result<(), String> {
    let mut app_config = state.config.lock().map_err(|e| e.to_string())?;
    app_config.browser_automation = config;
    app_config.save(&state.data_dir)?;
    Ok(())
}

#[tauri::command]
pub fn test_launch_browser(path: String) -> Result<String, String> {
    let browser = browser_session::launch_visible_browser(&path, None, None)?;
    let version = browser
        .get_version()
        .map(|v| v.product)
        .unwrap_or_else(|_| "Unknown".into());
    // El browser se destruye al salir del scope y se cierra automáticamente
    Ok(version)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSelectorSummary {
    pub key: String,
    pub name: String,
    pub url: String,
    pub selector_count: usize,
}

fn get_selectors_dir() -> std::path::PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default()
        .join("selectors");

    if exe_dir.exists() {
        exe_dir
    } else {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("selectors")
    }
}

#[tauri::command]
pub fn list_provider_selectors() -> Result<Vec<ProviderSelectorSummary>, String> {
    let dir = get_selectors_dir();
    let files = [
        ("colab_free", "colab_free.toml"),
        ("kimi", "kimi.toml"),
        ("qwen", "qwen.toml"),
        ("deepseek", "deepseek.toml"),
        ("huggingchat", "huggingchat.toml"),
    ];

    let mut result = Vec::new();
    for (key, filename) in &files {
        let path = dir.join(filename);
        if let Ok(contents) = std::fs::read_to_string(&path) {
            if let Ok(config) = toml::from_str::<crate::browser_automation::selectors::ProviderConfig>(&contents) {
                result.push(ProviderSelectorSummary {
                    key: key.to_string(),
                    name: config.name,
                    url: config.url,
                    selector_count: config.selectors.len(),
                });
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn get_provider_selectors(provider: String) -> Result<String, String> {
    let dir = get_selectors_dir();
    let filename = format!("{}.toml", provider);
    let path = dir.join(&filename);
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo {}: {}", filename, e))
}

#[tauri::command]
pub fn save_provider_selectors(provider: String, content: String) -> Result<(), String> {
    // Validar que el TOML es parseable
    toml::from_str::<crate::browser_automation::selectors::ProviderConfig>(&content)
        .map_err(|e| format!("TOML inválido: {}", e))?;

    let dir = get_selectors_dir();
    let filename = format!("{}.toml", provider);
    let path = dir.join(&filename);
    std::fs::write(&path, &content)
        .map_err(|e| format!("Error escribiendo {}: {}", filename, e))
}
