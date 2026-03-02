use crate::browser_automation::{
    AutomationRequest, AutomationSession, BrowserAutomationManager, DetectedBrowser,
    browser_detect,
};
use tauri::State;

#[tauri::command]
pub fn detect_browsers() -> Result<Vec<DetectedBrowser>, String> {
    Ok(browser_detect::detect_browsers())
}

#[tauri::command]
pub fn start_browser_automation(
    app: tauri::AppHandle,
    manager: State<'_, BrowserAutomationManager>,
    request: AutomationRequest,
) -> Result<String, String> {
    manager.start_automation(&app, request)
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
