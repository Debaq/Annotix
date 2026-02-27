use tauri::State;

use crate::db::models::StorageInfo;
use crate::db::Database;

#[tauri::command]
pub fn get_storage_info(db: State<'_, Database>) -> Result<StorageInfo, String> {
    let data_dir = &db.data_dir;

    let usage = dir_size(data_dir);

    // En desktop, el "quota" es el espacio disponible en disco
    let available = fs2_available_space(data_dir);
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

fn fs2_available_space(path: &std::path::Path) -> u64 {
    // Usar statvfs en Linux/macOS
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let Ok(meta) = std::fs::metadata(path) {
            // Fallback: intentar obtener info del filesystem
            let _ = meta.dev();
        }
        // Usar nix o libc para statvfs sería ideal, pero por ahora un fallback simple
        // con el comando df
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
    10_000_000_000 // 10GB default fallback
}
