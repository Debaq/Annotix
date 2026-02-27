use std::path::PathBuf;

use tauri::{AppHandle, Emitter, State};

use crate::db::models::{Annotation, AnnotixImage};
use crate::db::Database;

#[tauri::command]
pub fn upload_images(
    db: State<'_, Database>,
    app: AppHandle,
    project_id: i64,
    file_paths: Vec<String>,
) -> Result<Vec<i64>, String> {
    let images_dir = db.project_images_dir(project_id);
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Error creando directorio de imágenes: {}", e))?;

    let mut ids = Vec::new();

    for file_path in &file_paths {
        let source = PathBuf::from(file_path);
        let file_name = source
            .file_name()
            .ok_or("Nombre de archivo inválido")?
            .to_string_lossy()
            .to_string();

        // Generar nombre único para evitar colisiones
        let unique_name = format!("{}_{}", uuid::Uuid::new_v4(), file_name);
        let dest = images_dir.join(&unique_name);

        // Copiar archivo
        std::fs::copy(&source, &dest)
            .map_err(|e| format!("Error copiando imagen {}: {}", file_name, e))?;

        // Obtener dimensiones
        let (width, height) = get_image_dimensions(&dest)?;

        // Ruta relativa desde el directorio de datos
        let relative_path = format!("projects/{}/images/{}", project_id, unique_name);

        let id = db.create_image(project_id, &file_name, &relative_path, width, height, &[])?;
        ids.push(id);
    }

    let _ = app.emit("db:images-changed", project_id);
    Ok(ids)
}

#[tauri::command]
pub fn upload_image_bytes(
    db: State<'_, Database>,
    app: AppHandle,
    project_id: i64,
    file_name: String,
    data: Vec<u8>,
    annotations: Vec<Annotation>,
) -> Result<i64, String> {
    let images_dir = db.project_images_dir(project_id);
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Error creando directorio de imágenes: {}", e))?;

    let unique_name = format!("{}_{}", uuid::Uuid::new_v4(), file_name);
    let dest = images_dir.join(&unique_name);

    std::fs::write(&dest, &data)
        .map_err(|e| format!("Error escribiendo imagen: {}", e))?;

    let (width, height) = get_image_dimensions(&dest)?;
    let relative_path = format!("projects/{}/images/{}", project_id, unique_name);

    let id = db.create_image(project_id, &file_name, &relative_path, width, height, &annotations)?;
    let _ = app.emit("db:images-changed", project_id);
    Ok(id)
}

#[tauri::command]
pub fn get_image(db: State<'_, Database>, id: i64) -> Result<Option<AnnotixImage>, String> {
    db.get_image(id)
}

#[tauri::command]
pub fn list_images_by_project(
    db: State<'_, Database>,
    project_id: i64,
) -> Result<Vec<AnnotixImage>, String> {
    db.list_images_by_project(project_id)
}

#[tauri::command]
pub fn get_image_data(db: State<'_, Database>, id: i64) -> Result<Vec<u8>, String> {
    let image = db
        .get_image(id)?
        .ok_or("Imagen no encontrada")?;

    let full_path = db.data_dir.join(&image.blob_path);
    std::fs::read(&full_path)
        .map_err(|e| format!("Error leyendo imagen: {}", e))
}

/// Retorna la ruta absoluta del archivo de imagen en disco
#[tauri::command]
pub fn get_image_file_path(db: State<'_, Database>, id: i64) -> Result<String, String> {
    let image = db
        .get_image(id)?
        .ok_or("Imagen no encontrada")?;

    let full_path = db.data_dir.join(&image.blob_path);
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_annotations(
    db: State<'_, Database>,
    app: AppHandle,
    image_id: i64,
    annotations: Vec<Annotation>,
) -> Result<(), String> {
    db.save_annotations(image_id, &annotations)?;
    // Obtener project_id para el evento
    if let Ok(Some(image)) = db.get_image(image_id) {
        let _ = app.emit("db:images-changed", image.project_id);
    }
    Ok(())
}

#[tauri::command]
pub fn delete_image(
    db: State<'_, Database>,
    app: AppHandle,
    id: i64,
) -> Result<(), String> {
    // Obtener project_id antes de eliminar
    let project_id = db.get_image(id)?.map(|img| img.project_id);

    if let Some(blob_path) = db.delete_image(id)? {
        let full_path = db.data_dir.join(&blob_path);
        let _ = std::fs::remove_file(&full_path);
    }

    if let Some(pid) = project_id {
        let _ = app.emit("db:images-changed", pid);
    }
    Ok(())
}

fn get_image_dimensions(path: &PathBuf) -> Result<(u32, u32), String> {
    let img = image::open(path).map_err(|e| format!("Error leyendo dimensiones: {}", e))?;
    Ok((img.width(), img.height()))
}
