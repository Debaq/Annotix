use tauri::{AppHandle, Emitter, State};

use crate::db::models::{ClassDefinition, Project};
use crate::db::Database;

#[tauri::command]
pub fn create_project(
    db: State<'_, Database>,
    app: AppHandle,
    name: String,
    project_type: String,
    classes: Vec<ClassDefinition>,
) -> Result<i64, String> {
    let id = db.create_project(&name, &project_type, &classes)?;
    let _ = app.emit("db:projects-changed", ());
    Ok(id)
}

#[tauri::command]
pub fn get_project(db: State<'_, Database>, id: i64) -> Result<Option<Project>, String> {
    db.get_project(id)
}

#[tauri::command]
pub fn list_projects(db: State<'_, Database>) -> Result<Vec<Project>, String> {
    db.list_projects()
}

#[tauri::command]
pub fn update_project(
    db: State<'_, Database>,
    app: AppHandle,
    id: i64,
    name: Option<String>,
    project_type: Option<String>,
    classes: Option<Vec<ClassDefinition>>,
) -> Result<(), String> {
    db.update_project(
        id,
        name.as_deref(),
        project_type.as_deref(),
        classes.as_deref(),
    )?;
    let _ = app.emit("db:projects-changed", ());
    Ok(())
}

#[tauri::command]
pub fn delete_project(
    db: State<'_, Database>,
    app: AppHandle,
    id: i64,
) -> Result<(), String> {
    // Eliminar archivos del proyecto del filesystem
    let images_dir = db.project_images_dir(id);
    if images_dir.exists() {
        let project_dir = images_dir.parent().unwrap();
        let _ = std::fs::remove_dir_all(project_dir);
    }

    db.delete_project(id)?;
    let _ = app.emit("db:projects-changed", ());
    let _ = app.emit("db:images-changed", ());
    Ok(())
}
