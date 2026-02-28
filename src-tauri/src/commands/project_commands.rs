use tauri::{AppHandle, Emitter, State};

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
pub fn update_project(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    name: Option<String>,
    project_type: Option<String>,
    classes: Option<Vec<ClassDef>>,
) -> Result<(), String> {
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
pub fn delete_project(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    state.delete_project(&id)?;
    let _ = app.emit("db:projects-changed", ());
    let _ = app.emit("db:images-changed", ());
    Ok(())
}
