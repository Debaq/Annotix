use axum::{
    Router,
    extract::{Path, State},
    http::{StatusCode, header},
    response::{Html, IntoResponse},
    routing::{get, post},
    Json,
};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

use crate::store::AppState;
use crate::store::project_file::AnnotationEntry;
use crate::serve::ServeState;
use super::web_ui;

// ─── Estado compartido ──────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppServeState {
    pub app_handle: tauri::AppHandle,
    pub project_ids: Vec<String>,
}

impl AppServeState {
    fn app_state(&self) -> tauri::State<'_, AppState> {
        self.app_handle.state::<AppState>()
    }

    /// Verifica que el project_id esté en la lista de compartidos
    fn check_project(&self, project_id: &str) -> Result<(), (StatusCode, String)> {
        if self.project_ids.contains(&project_id.to_string()) {
            Ok(())
        } else {
            Err((StatusCode::FORBIDDEN, "Proyecto no compartido".to_string()))
        }
    }
}

// ─── Router ─────────────────────────────────────────────────────────────────

pub fn build_router(
    project_ids: Vec<String>,
    app_handle: tauri::AppHandle,
) -> Router {
    let state = AppServeState { app_handle, project_ids };

    Router::new()
        .route("/", get(serve_index))
        .route("/api/projects", get(list_projects))
        .route("/api/projects/{project_id}", get(get_project_info))
        .route("/api/projects/{project_id}/images", get(list_images))
        .route("/api/projects/{project_id}/images/{image_id}", get(get_image))
        .route("/api/projects/{project_id}/images/{image_id}/file", get(get_image_file))
        .route("/api/projects/{project_id}/images/{image_id}/thumbnail", get(get_image_thumbnail))
        .route("/api/projects/{project_id}/images/{image_id}/annotations", get(get_annotations))
        .route("/api/projects/{project_id}/images/{image_id}/annotations", post(save_annotations))
        .route("/api/health", get(health_check))
        .with_state(state)
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async fn serve_index() -> Html<&'static str> {
    Html(web_ui::INDEX_HTML)
}

async fn health_check() -> &'static str {
    "ok"
}

// ─── GET /api/projects ──────────────────────────────────────────────────────

#[derive(Serialize)]
struct ProjectListItem {
    id: String,
    name: String,
    #[serde(rename = "type")]
    project_type: String,
    #[serde(rename = "imageCount")]
    image_count: usize,
    #[serde(rename = "autoSave")]
    auto_save: bool,
}

async fn list_projects(
    State(state): State<AppServeState>,
) -> Result<Json<Vec<ProjectListItem>>, (StatusCode, String)> {
    let serve_state = state.app_handle.state::<ServeState>();
    let auto_save = serve_state.get_auto_save().await;
    let app = state.app_state();

    let mut items = Vec::new();
    for pid in &state.project_ids {
        if let Ok(item) = app.with_project(pid, |pf| {
            ProjectListItem {
                id: pf.id.clone(),
                name: pf.name.clone(),
                project_type: pf.project_type.clone(),
                image_count: pf.images.len(),
                auto_save,
            }
        }) {
            items.push(item);
        }
    }

    Ok(Json(items))
}

// ─── GET /api/projects/{project_id} ─────────────────────────────────────────

#[derive(Serialize)]
struct ProjectInfo {
    id: String,
    name: String,
    #[serde(rename = "type")]
    project_type: String,
    classes: Vec<ClassInfo>,
    #[serde(rename = "imageCount")]
    image_count: usize,
    #[serde(rename = "autoSave")]
    auto_save: bool,
}

#[derive(Serialize)]
struct ClassInfo {
    id: i64,
    name: String,
    color: String,
}

async fn get_project_info(
    State(state): State<AppServeState>,
    Path(project_id): Path<String>,
) -> Result<Json<ProjectInfo>, (StatusCode, String)> {
    state.check_project(&project_id)?;
    let serve_state = state.app_handle.state::<ServeState>();
    let auto_save = serve_state.get_auto_save().await;

    let info = state.app_state().with_project(&project_id, |pf| {
        ProjectInfo {
            id: pf.id.clone(),
            name: pf.name.clone(),
            project_type: pf.project_type.clone(),
            classes: pf.classes.iter().map(|c| ClassInfo {
                id: c.id, name: c.name.clone(), color: c.color.clone(),
            }).collect(),
            image_count: pf.images.len(),
            auto_save,
        }
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(info))
}

// ─── GET /api/projects/{project_id}/images ──────────────────────────────────

#[derive(Serialize)]
struct ImageSummary {
    id: String,
    name: String,
    width: u32,
    height: u32,
    status: String,
    #[serde(rename = "annotationCount")]
    annotation_count: usize,
}

async fn list_images(
    State(state): State<AppServeState>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<ImageSummary>>, (StatusCode, String)> {
    state.check_project(&project_id)?;
    let images = state.app_state().with_project(&project_id, |pf| {
        pf.images.iter().map(|i| ImageSummary {
            id: i.id.clone(), name: i.name.clone(),
            width: i.width, height: i.height,
            status: i.status.clone(),
            annotation_count: i.annotations.len(),
        }).collect::<Vec<_>>()
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(images))
}

// ─── GET /api/projects/{project_id}/images/{image_id} ───────────────────────

async fn get_image(
    State(state): State<AppServeState>,
    Path((project_id, image_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    state.check_project(&project_id)?;
    let img = state.app_state().store_get_image(&project_id, &image_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Imagen no encontrada".to_string()))?;
    Ok(Json(img))
}

// ─── GET /api/projects/{project_id}/images/{image_id}/file ──────────────────

async fn get_image_file(
    State(state): State<AppServeState>,
    Path((project_id, image_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    state.check_project(&project_id)?;
    let path = state.app_state().get_image_file_path(&project_id, &image_id)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;
    let bytes = tokio::fs::read(&path).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Error leyendo imagen: {}", e)))?;
    let mime = mime_from_path(&path);
    Ok(([
        (header::CONTENT_TYPE, mime),
        (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
    ], bytes))
}

// ─── GET /api/projects/{project_id}/images/{image_id}/thumbnail ─────────────

async fn get_image_thumbnail(
    State(state): State<AppServeState>,
    Path((project_id, image_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    state.check_project(&project_id)?;
    let project_dir = state.app_state().project_dir(&project_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let thumb_path = project_dir.join("thumbnails").join(format!("{}.jpg", image_id));

    if thumb_path.exists() {
        let bytes = tokio::fs::read(&thumb_path).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        return Ok(([
            (header::CONTENT_TYPE, "image/jpeg".to_string()),
            (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
        ], bytes));
    }

    // Fallback: imagen completa
    let path = state.app_state().get_image_file_path(&project_id, &image_id)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;
    let bytes = tokio::fs::read(&path).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(([
        (header::CONTENT_TYPE, mime_from_path(&path)),
        (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
    ], bytes))
}

// ─── GET /api/projects/{project_id}/images/{image_id}/annotations ───────────

async fn get_annotations(
    State(state): State<AppServeState>,
    Path((project_id, image_id)): Path<(String, String)>,
) -> Result<Json<Vec<AnnotationEntry>>, (StatusCode, String)> {
    state.check_project(&project_id)?;
    let annotations = state.app_state().with_project(&project_id, |pf| {
        pf.images.iter()
            .find(|i| i.id == image_id)
            .map(|i| i.annotations.clone())
            .unwrap_or_default()
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(annotations))
}

// ─── POST /api/projects/{project_id}/images/{image_id}/annotations ──────────

#[derive(Deserialize)]
struct SaveAnnotationsRequest {
    annotations: Vec<AnnotationEntry>,
}

async fn save_annotations(
    State(state): State<AppServeState>,
    Path((project_id, image_id)): Path<(String, String)>,
    body: String,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    state.check_project(&project_id)?;
    let parsed: SaveAnnotationsRequest = serde_json::from_str(&body)
        .map_err(|e| {
            log::error!("Error deserializando annotations: {} — body: {}", e, &body[..body.len().min(500)]);
            (StatusCode::BAD_REQUEST, format!("JSON inválido: {}", e))
        })?;

    let count = parsed.annotations.len();
    log::info!("Guardando {} anotaciones en proyecto {} imagen {}", count, project_id, image_id);

    state.app_state().save_annotations(&project_id, &image_id, &parsed.annotations)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    match state.app_handle.emit("db:images-changed", serde_json::json!({
        "projectId": &project_id,
        "action": "updated",
        "imageIds": [&image_id],
    })) {
        Ok(_) => log::info!("Evento db:images-changed emitido para {}", project_id),
        Err(e) => log::error!("Error emitiendo evento: {}", e),
    }

    Ok(Json(serde_json::json!({ "saved": count })))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn mime_from_path(path: &std::path::Path) -> String {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") => "image/jpeg".to_string(),
        Some("png") => "image/png".to_string(),
        Some("webp") => "image/webp".to_string(),
        Some("gif") => "image/gif".to_string(),
        Some("bmp") => "image/bmp".to_string(),
        Some("tiff") | Some("tif") => "image/tiff".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}
