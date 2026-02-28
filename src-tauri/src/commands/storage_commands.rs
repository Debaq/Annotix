use tauri::State;

use crate::store::AppState;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StorageInfo {
    pub usage: u64,
    pub quota: u64,
    pub percentage: f64,
}

#[tauri::command]
pub fn get_storage_info(state: State<'_, AppState>) -> Result<StorageInfo, String> {
    let projects_dir = state.projects_dir()?;

    let usage = dir_size(&projects_dir);

    let available = fs_available_space(&projects_dir);
    let quota = usage + available;

    let percentage = if quota > 0 {
        (usage as f64 / quota as f64) * 100.0
    } else {
        0.0
    };

    Ok(StorageInfo {
        usage,
        quota,
        percentage,
    })
}

fn dir_size(path: &std::path::Path) -> u64 {
    if !path.exists() {
        return 0;
    }

    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let metadata = entry.metadata();
            if let Ok(meta) = metadata {
                if meta.is_file() {
                    total += meta.len();
                } else if meta.is_dir() {
                    total += dir_size(&entry.path());
                }
            }
        }
    }
    total
}

fn fs_available_space(path: &std::path::Path) -> u64 {
    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new("df")
            .arg("-B1")
            .arg(path)
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().nth(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    return parts[3].parse().unwrap_or(10_000_000_000);
                }
            }
        }
    }
    10_000_000_000
}
