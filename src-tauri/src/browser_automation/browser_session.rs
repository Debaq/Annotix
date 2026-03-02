use headless_chrome::{Browser, LaunchOptions};
use std::ffi::OsStr;
use std::path::PathBuf;
use std::time::Duration;

/// Lanza un navegador Chromium visible (no headless) usando headless_chrome.
/// Usa un user-data-dir separado para persistir cookies entre sesiones.
pub fn launch_visible_browser(browser_path: &str) -> Result<Browser, String> {
    let user_data_dir = get_user_data_dir();

    let launch_options = LaunchOptions {
        headless: false,
        path: Some(PathBuf::from(browser_path)),
        args: vec![
            OsStr::new("--no-first-run"),
            OsStr::new("--no-default-browser-check"),
            OsStr::new("--disable-background-timer-throttling"),
            OsStr::new("--disable-backgrounding-occluded-windows"),
            OsStr::new("--disable-renderer-backgrounding"),
        ],
        user_data_dir: Some(user_data_dir),
        window_size: Some((1280, 900)),
        idle_browser_timeout: Duration::from_secs(600),
        ..LaunchOptions::default()
    };

    Browser::new(launch_options).map_err(|e| format!("Error lanzando navegador: {}", e))
}

/// Directorio de datos de usuario para que las sesiones persistan entre usos.
fn get_user_data_dir() -> PathBuf {
    let base = directories::ProjectDirs::from("com", "annotix", "annotix")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .unwrap_or_else(|| {
            directories::BaseDirs::new()
                .map(|d| d.data_dir().to_path_buf())
                .unwrap_or_else(|| PathBuf::from("."))
        });

    let dir = base.join("browser_automation");
    let _ = std::fs::create_dir_all(&dir);
    dir
}
