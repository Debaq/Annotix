//! Exportación de los archivos de una sesión (Tarea 5).

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::json;

use super::log;
use super::verify;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub dest_dir: String,
    pub files: Vec<String>,
    pub manifest: String,
}

/// Archivos de registro de una sesión, ordenados por nombre.
pub fn session_files(session_id: &str) -> Result<Vec<PathBuf>, String> {
    let dir = log::logs_dir().ok_or("Registro de estudio sin inicializar")?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let prefix = format!("{}_", session_id);
    let mut out: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("jsonl")
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(&prefix))
                    .unwrap_or(false)
        })
        .collect();
    out.sort();
    Ok(out)
}

/// Copia los archivos de la sesión a `dest_dir` y escribe `manifest.json`.
pub fn export_session(session_id: &str, dest_dir: &Path) -> Result<ExportResult, String> {
    log::validate_session_id(session_id)?;
    let files = session_files(session_id)?;
    if files.is_empty() {
        return Err(format!("No hay registros para la sesión {}", session_id));
    }

    std::fs::create_dir_all(dest_dir)
        .map_err(|e| format!("No se pudo crear el destino: {}", e))?;

    let mut entries = Vec::new();
    let mut names = Vec::new();
    let mut n_events: u64 = 0;
    let mut last_mono: u64 = 0;
    let mut condition: Option<String> = None;
    let mut app_version: Option<String> = None;

    for src in &files {
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre de archivo inválido")?
            .to_string();
        std::fs::copy(src, dest_dir.join(&name))
            .map_err(|e| format!("No se pudo copiar {}: {}", name, e))?;

        let report = verify::verify_file(src)?;
        n_events += report.n_events;
        last_mono = last_mono.max(report.last_t_mono_ms);
        if condition.is_none() {
            condition = report.condition.clone();
            app_version = report.app_version.clone();
        }

        entries.push(json!({
            "file": name,
            "sha256": verify::file_hash(src)?,
            "verify": report,
        }));
        names.push(name);
    }

    let manifest = json!({
        "session_id": session_id,
        "condition": condition.unwrap_or_default(),
        "app_version": app_version.unwrap_or_else(log::app_version),
        "n_events": n_events,
        "t_mono_ms_last": last_mono,
        "files": entries,
    });

    let manifest_path = dest_dir.join("manifest.json");
    std::fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("No se pudo escribir el manifiesto: {}", e))?;

    Ok(ExportResult {
        dest_dir: dest_dir.display().to_string(),
        files: names,
        manifest: manifest_path.display().to_string(),
    })
}
