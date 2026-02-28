use tauri::State;
use crate::store::AppState;

const THUMBNAIL_MAX_SIZE: u32 = 256;

#[tauri::command]
pub fn generate_thumbnail(
    project_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    generate_thumbnail_internal(&state, &project_id, &image_id, THUMBNAIL_MAX_SIZE)
}

#[tauri::command]
pub fn get_thumbnail_path(
    project_id: String,
    image_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let thumb_dir = state.project_thumbnails_dir(&project_id)?;
    let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));

    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    generate_thumbnail_internal(&state, &project_id, &image_id, THUMBNAIL_MAX_SIZE)
}

#[tauri::command]
pub fn generate_thumbnails_batch(
    project_id: String,
    image_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let mut paths = Vec::new();
    for id in &image_ids {
        match generate_thumbnail_internal(&state, &project_id, id, THUMBNAIL_MAX_SIZE) {
            Ok(path) => paths.push(path),
            Err(_) => paths.push(String::new()),
        }
    }
    Ok(paths)
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
