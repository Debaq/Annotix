use tauri::State;
use crate::db::Database;

const THUMBNAIL_MAX_SIZE: u32 = 256;

#[tauri::command]
pub fn generate_thumbnail(
    image_id: i64,
    db: State<'_, Database>,
) -> Result<String, String> {
    generate_thumbnail_internal(&db, image_id, THUMBNAIL_MAX_SIZE)
}

#[tauri::command]
pub fn get_thumbnail_path(
    image_id: i64,
    db: State<'_, Database>,
) -> Result<String, String> {
    let image = db.get_image(image_id)?
        .ok_or_else(|| format!("Imagen no encontrada: {}", image_id))?;

    let thumb_dir = db.project_thumbnails_dir(image.project_id);
    let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));

    // Return existing thumbnail
    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    // Generate on demand
    generate_thumbnail_internal(&db, image_id, THUMBNAIL_MAX_SIZE)
}

#[tauri::command]
pub fn generate_thumbnails_batch(
    image_ids: Vec<i64>,
    db: State<'_, Database>,
) -> Result<Vec<String>, String> {
    let mut paths = Vec::new();
    for id in image_ids {
        match generate_thumbnail_internal(&db, id, THUMBNAIL_MAX_SIZE) {
            Ok(path) => paths.push(path),
            Err(_) => paths.push(String::new()),
        }
    }
    Ok(paths)
}

fn generate_thumbnail_internal(
    db: &Database,
    image_id: i64,
    max_size: u32,
) -> Result<String, String> {
    let image = db.get_image(image_id)?
        .ok_or_else(|| format!("Imagen no encontrada: {}", image_id))?;

    let thumb_dir = db.project_thumbnails_dir(image.project_id);
    std::fs::create_dir_all(&thumb_dir)
        .map_err(|e| format!("Error creando directorio de thumbnails: {}", e))?;

    let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));

    // Skip if already exists
    if thumb_path.exists() {
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    // Load original image
    let original_path = db.get_image_file_path(image.project_id, &image.blob_path)?;
    let img = image::open(&original_path)
        .map_err(|e| format!("Error abriendo imagen: {}", e))?;

    // Resize maintaining aspect ratio
    let thumb = img.thumbnail(max_size, max_size);

    // Save as JPEG
    thumb.save(&thumb_path)
        .map_err(|e| format!("Error guardando thumbnail: {}", e))?;

    Ok(thumb_path.to_string_lossy().to_string())
}
