use std::io::Write;
use tauri::{AppHandle, Emitter, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::project_file::ClassDef;
use crate::store::projects::ProjectSummary;
use crate::store::AppState;

#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    app: AppHandle,
    name: String,
    project_type: String,
    classes: Vec<ClassDef>,
) -> Result<String, String> {
    let id = state.create_project(&name, &project_type, &classes)?;
    let _ = app.emit("db:projects-changed", ());
    Ok(id)
}

#[tauri::command]
pub fn get_project(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<ProjectSummary>, String> {
    state.get_project(&id)
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectSummary>, String> {
    state.list_projects()
}

#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    id: String,
    name: Option<String>,
    project_type: Option<String>,
    classes: Option<Vec<ClassDef>>,
) -> Result<(), String> {
    if classes.is_some() {
        p2p.check_permission(&id, P2pPermission::EditClasses).await?;
    }
    state.update_project(
        &id,
        name.as_deref(),
        project_type.as_deref(),
        classes.as_deref(),
    )?;
    let _ = app.emit("db:projects-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn save_classes(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    classes: Vec<ClassDef>,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::EditClasses).await?;
    state.save_classes(&project_id, classes)?;
    let _ = app.emit("db:projects-changed", ());
    let _ = app.emit("db:images-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn delete_project(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    p2p.check_permission(&id, P2pPermission::Manage).await?;
    state.delete_project(&id)?;
    let _ = app.emit("db:projects-changed", ());
    let _ = app.emit("db:images-changed", ());
    Ok(())
}

#[tauri::command]
pub fn set_project_folder(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    folder: Option<String>,
) -> Result<(), String> {
    state.set_project_folder(&project_id, folder)?;
    let _ = app.emit("db:projects-changed", ());
    Ok(())
}

#[tauri::command]
pub fn reveal_project_folder(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let dir = state.project_dir(&project_id)?;
    if !dir.exists() {
        return Err("Carpeta del proyecto no existe".to_string());
    }
    #[cfg(target_os = "windows")]
    { let _ = std::process::Command::new("explorer").arg(&dir).spawn(); }
    #[cfg(target_os = "linux")]
    { let _ = std::process::Command::new("xdg-open").arg(&dir).spawn(); }
    #[cfg(target_os = "macos")]
    { let _ = std::process::Command::new("open").arg(&dir).spawn(); }
    Ok(())
}

#[tauri::command]
pub fn zip_project(
    state: State<'_, AppState>,
    project_id: String,
    output_path: String,
) -> Result<(), String> {
    let dir = state.project_dir(&project_id)?;
    if !dir.exists() {
        return Err("Carpeta del proyecto no existe".to_string());
    }

    let file = std::fs::File::create(&output_path)
        .map_err(|e| format!("Error creando zip: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    fn add_dir_to_zip(
        zip: &mut zip::ZipWriter<std::fs::File>,
        base: &std::path::Path,
        current: &std::path::Path,
        options: zip::write::SimpleFileOptions,
    ) -> Result<(), String> {
        let entries = std::fs::read_dir(current)
            .map_err(|e| format!("Error leyendo directorio: {}", e))?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let rel = path.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
            if path.is_dir() {
                zip.add_directory(&format!("{}/", rel), options).map_err(|e| e.to_string())?;
                add_dir_to_zip(zip, base, &path, options)?;
            } else {
                zip.start_file(&rel, options).map_err(|e| e.to_string())?;
                let data = std::fs::read(&path).map_err(|e| e.to_string())?;
                zip.write_all(&data).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    add_dir_to_zip(&mut zip, &dir, &dir, options)?;
    zip.finish().map_err(|e| format!("Error finalizando zip: {}", e))?;
    Ok(())
}
