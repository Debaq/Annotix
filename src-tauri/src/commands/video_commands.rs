use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, Emitter, State};

use crate::db::models::{Annotation, VideoInfo, VideoRecord, VideoTrackRecord};
use crate::db::Database;

#[tauri::command]
pub fn check_ffmpeg_available() -> Result<bool, String> {
    let output = Command::new("ffmpeg")
        .arg("-version")
        .output();

    Ok(output.is_ok())
}

#[tauri::command]
pub fn get_video_info(path: String) -> Result<VideoInfo, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("Error ejecutando ffprobe: {}", e))?;

    if !output.status.success() {
        return Err("ffprobe falló al analizar el video".to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Error parseando ffprobe: {}", e))?;

    // Find video stream
    let streams = json["streams"]
        .as_array()
        .ok_or("No se encontraron streams")?;

    let video_stream = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or("No se encontró stream de video")?;

    let width = video_stream["width"].as_i64().unwrap_or(0);
    let height = video_stream["height"].as_i64().unwrap_or(0);

    // Parse FPS from r_frame_rate (e.g., "30/1" or "30000/1001")
    let fps_str = video_stream["r_frame_rate"]
        .as_str()
        .unwrap_or("30/1");
    let fps = parse_fps(fps_str);

    // Duration in ms
    let duration_secs = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let duration_ms = (duration_secs * 1000.0) as i64;

    Ok(VideoInfo {
        duration_ms,
        fps_original: fps,
        width,
        height,
    })
}

#[tauri::command]
pub fn upload_video(
    db: State<'_, Database>,
    app: AppHandle,
    project_id: i64,
    file_path: String,
    fps_extraction: f64,
) -> Result<i64, String> {
    // Get video info first
    let info = get_video_info(file_path.clone())?;

    let source = PathBuf::from(&file_path);
    let file_name = source
        .file_name()
        .ok_or("Nombre de archivo inválido")?
        .to_string_lossy()
        .to_string();

    // Copy video to project directory
    let videos_dir = db.data_dir.join("projects").join(project_id.to_string()).join("videos");
    std::fs::create_dir_all(&videos_dir)
        .map_err(|e| format!("Error creando directorio de videos: {}", e))?;

    let unique_name = format!("{}_{}", uuid::Uuid::new_v4(), file_name);
    let dest = videos_dir.join(&unique_name);
    std::fs::copy(&source, &dest)
        .map_err(|e| format!("Error copiando video: {}", e))?;

    let relative_path = format!("projects/{}/videos/{}", project_id, unique_name);

    let video_id = db.create_video(
        project_id,
        &file_name,
        &relative_path,
        fps_extraction,
        Some(info.fps_original),
        0,
        info.duration_ms,
        info.width,
        info.height,
    )?;

    let _ = app.emit("db:videos-changed", project_id);
    Ok(video_id)
}

#[tauri::command]
pub fn extract_video_frames(
    db: State<'_, Database>,
    app: AppHandle,
    project_id: i64,
    video_id: i64,
) -> Result<i64, String> {
    let video = db
        .get_video(video_id)?
        .ok_or("Video no encontrado")?;

    let video_path = db.data_dir.join(&video.source_path);

    // Create frames output directory
    let frames_dir = db.data_dir
        .join("projects")
        .join(project_id.to_string())
        .join("images");
    std::fs::create_dir_all(&frames_dir)
        .map_err(|e| format!("Error creando directorio de frames: {}", e))?;

    // Use a temporary directory for ffmpeg output then move files
    let temp_dir = db.data_dir.join("temp_frames").join(video_id.to_string());
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Error creando directorio temporal: {}", e))?;

    let output_pattern = temp_dir.join("frame_%06d.jpg");

    // Run ffmpeg
    let status = Command::new("ffmpeg")
        .args([
            "-i", &video_path.to_string_lossy(),
            "-vf", &format!("fps={}", video.fps_extraction),
            "-q:v", "2",
            &output_pattern.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Error ejecutando ffmpeg: {}", e))?;

    if !status.status.success() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(format!(
            "ffmpeg falló: {}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }

    // Count and register frames
    let mut frame_files: Vec<String> = std::fs::read_dir(&temp_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("frame_") && name.ends_with(".jpg") {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    frame_files.sort();
    let total_frames = frame_files.len() as i64;

    // Move each frame to images dir and create DB record
    for (index, frame_name) in frame_files.iter().enumerate() {
        let src = temp_dir.join(frame_name);
        let unique_name = format!("{}_{}_{}", uuid::Uuid::new_v4(), video_id, frame_name);
        let dest = frames_dir.join(&unique_name);

        std::fs::rename(&src, &dest)
            .or_else(|_| std::fs::copy(&src, &dest).map(|_| ()))
            .map_err(|e| format!("Error moviendo frame: {}", e))?;

        let (width, height) = get_frame_dimensions(&dest)?;
        let relative_path = format!("projects/{}/images/{}", project_id, unique_name);
        let display_name = format!("{} - frame {}", video.name, index);

        db.create_image_with_video(
            project_id,
            &display_name,
            &relative_path,
            width,
            height,
            &[],
            Some(video_id),
            Some(index as i64),
        )?;

        // Emit progress
        let progress = ((index + 1) as f64 / total_frames as f64 * 100.0) as i32;
        let _ = app.emit("video:extraction-progress", serde_json::json!({
            "videoId": video_id,
            "progress": progress,
            "current": index + 1,
            "total": total_frames,
        }));
    }

    // Clean up temp dir
    let _ = std::fs::remove_dir_all(&temp_dir);

    // Update video status
    db.update_video_status(video_id, "ready", total_frames)?;

    let _ = app.emit("db:videos-changed", project_id);
    let _ = app.emit("db:images-changed", project_id);

    Ok(total_frames)
}

#[tauri::command]
pub fn get_video(db: State<'_, Database>, video_id: i64) -> Result<Option<VideoRecord>, String> {
    db.get_video(video_id)
}

#[tauri::command]
pub fn list_videos_by_project(
    db: State<'_, Database>,
    project_id: i64,
) -> Result<Vec<VideoRecord>, String> {
    db.list_videos_by_project(project_id)
}

#[tauri::command]
pub fn list_frames_by_video(
    db: State<'_, Database>,
    video_id: i64,
) -> Result<Vec<crate::db::models::AnnotixImage>, String> {
    db.list_frames_by_video(video_id)
}

#[tauri::command]
pub fn delete_video(
    db: State<'_, Database>,
    app: AppHandle,
    video_id: i64,
) -> Result<(), String> {
    // Get frames blob paths before deletion
    let frames = db.list_frames_by_video(video_id)?;

    let info = db.delete_video(video_id)?;

    // Delete frame files
    for frame in &frames {
        let full_path = db.data_dir.join(&frame.blob_path);
        let _ = std::fs::remove_file(&full_path);
    }

    // Delete video file
    if let Some((project_id, source_path)) = &info {
        let full_path = db.data_dir.join(source_path);
        let _ = std::fs::remove_file(&full_path);
        let _ = app.emit("db:videos-changed", *project_id);
        let _ = app.emit("db:images-changed", *project_id);
    }

    Ok(())
}

// ─── Track Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_track(
    db: State<'_, Database>,
    app: AppHandle,
    video_id: i64,
    track_uuid: String,
    class_id: i64,
    label: Option<String>,
) -> Result<i64, String> {
    let id = db.create_track(video_id, &track_uuid, class_id, label.as_deref())?;
    let _ = app.emit("db:tracks-changed", video_id);
    Ok(id)
}

#[tauri::command]
pub fn list_tracks_by_video(
    db: State<'_, Database>,
    video_id: i64,
) -> Result<Vec<VideoTrackRecord>, String> {
    db.list_tracks_by_video(video_id)
}

#[tauri::command]
pub fn update_track(
    db: State<'_, Database>,
    app: AppHandle,
    track_id: i64,
    video_id: i64,
    class_id: Option<i64>,
    label: Option<String>,
    enabled: Option<bool>,
) -> Result<(), String> {
    db.update_track(track_id, class_id, label.as_deref(), enabled)?;
    let _ = app.emit("db:tracks-changed", video_id);
    Ok(())
}

#[tauri::command]
pub fn delete_track(
    db: State<'_, Database>,
    app: AppHandle,
    track_id: i64,
    video_id: i64,
) -> Result<(), String> {
    db.delete_track(track_id)?;
    let _ = app.emit("db:tracks-changed", video_id);
    Ok(())
}

#[tauri::command]
pub fn set_keyframe(
    db: State<'_, Database>,
    app: AppHandle,
    track_id: i64,
    video_id: i64,
    frame_index: i64,
    bbox_x: f64,
    bbox_y: f64,
    bbox_width: f64,
    bbox_height: f64,
) -> Result<i64, String> {
    let id = db.set_keyframe(track_id, frame_index, bbox_x, bbox_y, bbox_width, bbox_height)?;
    let _ = app.emit("db:tracks-changed", video_id);
    Ok(id)
}

#[tauri::command]
pub fn delete_keyframe(
    db: State<'_, Database>,
    app: AppHandle,
    track_id: i64,
    video_id: i64,
    frame_index: i64,
) -> Result<(), String> {
    db.delete_keyframe(track_id, frame_index)?;
    let _ = app.emit("db:tracks-changed", video_id);
    Ok(())
}

#[tauri::command]
pub fn toggle_keyframe_enabled(
    db: State<'_, Database>,
    app: AppHandle,
    track_id: i64,
    video_id: i64,
    frame_index: i64,
    enabled: bool,
) -> Result<(), String> {
    db.toggle_keyframe_enabled(track_id, frame_index, enabled)?;
    let _ = app.emit("db:tracks-changed", video_id);
    Ok(())
}

#[tauri::command]
pub fn bake_video_tracks(
    db: State<'_, Database>,
    app: AppHandle,
    video_id: i64,
) -> Result<(), String> {
    let tracks = db.list_tracks_by_video(video_id)?;
    let frames = db.list_frames_by_video(video_id)?;

    for frame in &frames {
        let frame_index = frame.frame_index.unwrap_or(0);
        let mut annotations = frame.annotations.clone();

        for track in &tracks {
            if !track.enabled {
                continue;
            }

            if let Some(bbox) = interpolate_bbox(&track.keyframes, frame_index) {
                if !bbox.3 {
                    // not enabled for this frame
                    continue;
                }

                let annotation = Annotation {
                    id: uuid::Uuid::new_v4().to_string(),
                    annotation_type: "bbox".to_string(),
                    class_id: track.class_id,
                    data: serde_json::json!({
                        "x": bbox.0,
                        "y": bbox.1,
                        "width": bbox.2.0,
                        "height": bbox.2.1,
                    }),
                };
                annotations.push(annotation);
            }
        }

        if let Some(image_id) = frame.id {
            db.save_annotations(image_id, &annotations)?;
        }
    }

    // Get project_id for event
    if let Ok(Some(video)) = db.get_video(video_id) {
        let _ = app.emit("db:images-changed", video.project_id);
    }

    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn parse_fps(fps_str: &str) -> f64 {
    let parts: Vec<&str> = fps_str.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().unwrap_or(30.0);
        let den: f64 = parts[1].parse().unwrap_or(1.0);
        if den > 0.0 { num / den } else { 30.0 }
    } else {
        fps_str.parse().unwrap_or(30.0)
    }
}

fn get_frame_dimensions(path: &PathBuf) -> Result<(u32, u32), String> {
    let img = image::open(path).map_err(|e| format!("Error leyendo dimensiones: {}", e))?;
    Ok((img.width(), img.height()))
}

/// Returns (x, y, (width, height), enabled) for a given frame_index by interpolating keyframes
fn interpolate_bbox(
    keyframes: &[crate::db::models::VideoKeyframeRecord],
    frame_index: i64,
) -> Option<(f64, f64, (f64, f64), bool)> {
    if keyframes.is_empty() {
        return None;
    }

    // Exact match
    if let Some(kf) = keyframes.iter().find(|k| k.frame_index == frame_index) {
        return Some((kf.bbox_x, kf.bbox_y, (kf.bbox_width, kf.bbox_height), kf.enabled));
    }

    // Find surrounding keyframes
    let prev = keyframes.iter().filter(|k| k.frame_index < frame_index).last();
    let next = keyframes.iter().find(|k| k.frame_index > frame_index);

    match (prev, next) {
        (Some(p), Some(n)) => {
            if !p.enabled || !n.enabled {
                return Some((0.0, 0.0, (0.0, 0.0), false));
            }
            let t = (frame_index - p.frame_index) as f64
                / (n.frame_index - p.frame_index) as f64;
            let x = p.bbox_x + (n.bbox_x - p.bbox_x) * t;
            let y = p.bbox_y + (n.bbox_y - p.bbox_y) * t;
            let w = p.bbox_width + (n.bbox_width - p.bbox_width) * t;
            let h = p.bbox_height + (n.bbox_height - p.bbox_height) * t;
            Some((x, y, (w, h), true))
        }
        _ => None, // Outside keyframe range
    }
}
