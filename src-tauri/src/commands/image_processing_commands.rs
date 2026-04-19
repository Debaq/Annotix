use tauri::{AppHandle, Manager};
use crate::store::AppState;

const THUMBNAIL_MAX_SIZE: u32 = 256;

#[tauri::command]
pub async fn generate_thumbnail(
    app: AppHandle,
    project_id: String,
    image_id: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        generate_thumbnail_internal(&state, &project_id, &image_id, THUMBNAIL_MAX_SIZE)
    })
    .await
    .map_err(|e| format!("Join error: {}", e))?
}

#[tauri::command]
pub async fn get_thumbnail_path(
    app: AppHandle,
    project_id: String,
    image_id: String,
) -> Result<String, String> {
    {
        let state = app.state::<AppState>();
        let thumb_dir = state.project_thumbnails_dir(&project_id)?;
        let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));
        if thumb_path.exists() {
            return Ok(thumb_path.to_string_lossy().to_string());
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        generate_thumbnail_internal(&state, &project_id, &image_id, THUMBNAIL_MAX_SIZE)
    })
    .await
    .map_err(|e| format!("Join error: {}", e))?
}

#[tauri::command]
pub async fn generate_thumbnails_batch(
    app: AppHandle,
    project_id: String,
    image_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut paths = Vec::new();
        for id in &image_ids {
            match generate_thumbnail_internal(&state, &project_id, id, THUMBNAIL_MAX_SIZE) {
                Ok(path) => paths.push(path),
                Err(_) => paths.push(String::new()),
            }
        }
        Ok(paths)
    })
    .await
    .map_err(|e| format!("Join error: {}", e))?
}

fn generate_thumbnail_internal(
    state: &AppState,
    project_id: &str,
    image_id: &str,
    max_size: u32,
) -> Result<String, String> {
    let thumb_dir = state.project_thumbnails_dir(project_id)?;
    std::fs::create_dir_all(&thumb_dir)
        .map_err(|e| format!("Error creando directorio de thumbnails: {}", e))?;

    let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));

    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    let original_path = state.get_image_file_path(project_id, image_id)?;
    let img = image::open(&original_path)
        .map_err(|e| format!("Error abriendo imagen: {}", e))?;

    let thumb = img.thumbnail(max_size, max_size);
    thumb.save(&thumb_path)
        .map_err(|e| format!("Error guardando thumbnail: {}", e))?;

    Ok(thumb_path.to_string_lossy().to_string())
}
