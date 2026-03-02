use super::DetectedBrowser;
use std::path::Path;
use std::process::Command;

/// Detecta navegadores Chromium instalados en el sistema.
pub fn detect_browsers() -> Vec<DetectedBrowser> {
    let mut browsers = Vec::new();

    #[cfg(target_os = "linux")]
    {
        // Rutas fijas conocidas
        let candidates = [
            ("Google Chrome", "/usr/bin/google-chrome-stable"),
            ("Google Chrome", "/usr/bin/google-chrome"),
            ("Brave", "/usr/bin/brave"),
            ("Brave", "/usr/bin/brave-browser"),
            ("Brave", "/usr/bin/brave-browser-stable"),
            ("Brave", "/opt/brave-bin/brave"),
            ("Brave", "/opt/brave.com/brave/brave-browser"),
            ("Chromium", "/usr/bin/chromium"),
            ("Chromium", "/usr/bin/chromium-browser"),
            ("Microsoft Edge", "/usr/bin/microsoft-edge-stable"),
            ("Microsoft Edge", "/usr/bin/microsoft-edge"),
            ("Vivaldi", "/usr/bin/vivaldi-stable"),
            ("Vivaldi", "/usr/bin/vivaldi"),
        ];

        for (name, path) in &candidates {
            if Path::new(path).exists() {
                let version = get_version_linux(path);
                browsers.push(DetectedBrowser {
                    name: name.to_string(),
                    path: path.to_string(),
                    version,
                });
            }
        }

        // Fallback: buscar con `which` binarios que no estén en rutas fijas
        let which_candidates = [
            ("Google Chrome", &["google-chrome-stable", "google-chrome"][..]),
            ("Brave", &["brave", "brave-browser", "brave-browser-stable"][..]),
            ("Chromium", &["chromium", "chromium-browser"][..]),
            ("Microsoft Edge", &["microsoft-edge-stable", "microsoft-edge"][..]),
            ("Vivaldi", &["vivaldi-stable", "vivaldi"][..]),
        ];

        let known_paths: std::collections::HashSet<String> =
            browsers.iter().map(|b| b.path.clone()).collect();

        for (name, bins) in &which_candidates {
            for bin in *bins {
                if let Ok(output) = Command::new("which").arg(bin).output() {
                    if output.status.success() {
                        let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        if !resolved.is_empty() && !known_paths.contains(&resolved) {
                            let version = get_version_linux(&resolved);
                            browsers.push(DetectedBrowser {
                                name: name.to_string(),
                                path: resolved,
                                version,
                            });
                            break;
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let program_files = std::env::var("ProgramFiles").unwrap_or_default();
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

        let candidates = [
            ("Google Chrome", format!("{}/Google/Chrome/Application/chrome.exe", program_files)),
            ("Google Chrome", format!("{}/Google/Chrome/Application/chrome.exe", program_files_x86)),
            ("Google Chrome", format!("{}/Google/Chrome/Application/chrome.exe", local_app_data)),
            ("Brave", format!("{}/BraveSoftware/Brave-Browser/Application/brave.exe", program_files)),
            ("Brave", format!("{}/BraveSoftware/Brave-Browser/Application/brave.exe", program_files_x86)),
            ("Microsoft Edge", format!("{}/Microsoft/Edge/Application/msedge.exe", program_files)),
            ("Microsoft Edge", format!("{}/Microsoft/Edge/Application/msedge.exe", program_files_x86)),
            ("Vivaldi", format!("{}/Vivaldi/Application/vivaldi.exe", local_app_data)),
        ];

        for (name, path) in &candidates {
            if Path::new(path).exists() {
                browsers.push(DetectedBrowser {
                    name: name.to_string(),
                    path: path.clone(),
                    version: None,
                });
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let candidates = [
            ("Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            ("Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
            ("Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"),
            ("Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
            ("Vivaldi", "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi"),
        ];

        for (name, path) in &candidates {
            if Path::new(path).exists() {
                let version = get_version_macos(path);
                browsers.push(DetectedBrowser {
                    name: name.to_string(),
                    path: path.to_string(),
                    version,
                });
            }
        }
    }

    // Deduplicar por nombre (quedarse con el primero encontrado)
    let mut seen = std::collections::HashSet::new();
    browsers.retain(|b| seen.insert(b.name.clone()));

    browsers
}

#[cfg(target_os = "linux")]
fn get_version_linux(path: &str) -> Option<String> {
    Command::new(path)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            // Extraer versión numérica del output
            out.split_whitespace()
                .find(|s| s.chars().next().map_or(false, |c| c.is_ascii_digit()))
                .map(|s| s.to_string())
        })
}

#[cfg(target_os = "macos")]
fn get_version_macos(path: &str) -> Option<String> {
    Command::new(path)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.split_whitespace()
                .find(|s| s.chars().next().map_or(false, |c| c.is_ascii_digit()))
                .map(|s| s.to_string())
        })
}
