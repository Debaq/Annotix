use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, RgbImage};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::store::project_file::{AnnotationEntry, KeyframeEntry};
use crate::store::images::ImageResponse;
use crate::store::videos::{TrackResponse, VideoInfo, VideoResponse};
use crate::store::AppState;

// ─── get_video_info: usa ffmpeg-next en lugar de ffprobe ─────────────────────

#[tauri::command]
pub fn get_video_info(path: String) -> Result<VideoInfo, String> {
    let ictx = ffmpeg_the_third::format::input(&path)
        .map_err(|e| format!("Error abriendo video: {}", e))?;

    let stream = ictx
        .streams()
        .best(ffmpeg_the_third::media::Type::Video)
        .ok_or("No se encontró stream de video")?;

    let codec_params = stream.parameters();
    let decoder = ffmpeg_the_third::codec::context::Context::from_parameters(codec_params)
        .map_err(|e| format!("Error creando contexto de códec: {}", e))?
        .decoder()
        .video()
        .map_err(|e| format!("Error creando decoder de video: {}", e))?;

    let width = decoder.width() as i64;
    let height = decoder.height() as i64;

    // FPS del stream
    let rate = stream.avg_frame_rate();
    let fps = if rate.denominator() > 0 {
        rate.numerator() as f64 / rate.denominator() as f64
    } else {
        30.0
    };

    // Duración en ms
    let duration_ms = if ictx.duration() > 0 {
        (ictx.duration() as f64 / f64::from(ffmpeg_the_third::ffi::AV_TIME_BASE) * 1000.0) as i64
    } else {
        0
    };

    Ok(VideoInfo {
        duration_ms,
        fps_original: fps,
        width,
        height,
    })
}

// ─── upload_video ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn upload_video(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    file_path: String,
    fps_extraction: f64,
) -> Result<String, String> {
    let info = get_video_info(file_path.clone())?;

    let source = std::path::PathBuf::from(&file_path);
    let file_name = source
        .file_name()
        .ok_or("Nombre de archivo inválido")?
        .to_string_lossy()
        .to_string();

    let videos_dir = state.project_videos_dir(&project_id)?;
    std::fs::create_dir_all(&videos_dir)
        .map_err(|e| format!("Error creando directorio de videos: {}", e))?;

    let unique_name = format!("{}_{}", uuid::Uuid::new_v4(), file_name);
    let dest = videos_dir.join(&unique_name);
    std::fs::copy(&source, &dest).map_err(|e| format!("Error copiando video: {}", e))?;

    let video_id = state.create_video(
        &project_id,
        &file_name,
        &unique_name,
        fps_extraction,
        Some(info.fps_original),
        0,
        info.duration_ms,
        info.width,
        info.height,
    )?;

    let _ = app.emit("db:videos-changed", &project_id);
    Ok(video_id)
}

// ─── extract_video_frames: async con spawn_blocking para progreso real ───────

#[tauri::command]
pub async fn extract_video_frames(
    app: AppHandle,
    project_id: String,
    video_id: String,
) -> Result<i64, String> {
    // Obtener datos necesarios del state antes de spawn
    let state = app.state::<AppState>();
    let video = state
        .get_video(&project_id, &video_id)?
        .ok_or("Video no encontrado")?;

    let videos_dir = state.project_videos_dir(&project_id)?;
    let video_path_str = videos_dir.join(&video.file).to_string_lossy().to_string();

    let fps_extraction = video.fps_extraction;
    let duration_ms = video.duration_ms;

    let estimated_total = if duration_ms > 0 {
        ((duration_ms as f64 / 1000.0) * fps_extraction).ceil() as i64
    } else {
        0
    };

    // Clonar AppHandle para el thread (da acceso a State internamente)
    let app_bg = app.clone();
    let pid = project_id.clone();
    let vid = video_id.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        do_extract_frames(&app_bg, &pid, &vid, &video_path_str, fps_extraction, estimated_total)
    })
    .await
    .map_err(|e| format!("Error en thread de extracción: {}", e))??;

    // Notificar al frontend
    let _ = app.emit("db:videos-changed", &project_id);
    let _ = app.emit("db:images-changed", &project_id);

    Ok(result)
}

/// Trabajo pesado de extracción — corre en un thread separado
fn do_extract_frames(
    app: &AppHandle,
    project_id: &str,
    video_id: &str,
    video_path: &str,
    fps_extraction: f64,
    estimated_total: i64,
) -> Result<i64, String> {
    let state = app.state::<AppState>();

    // Preparar directorio de thumbnails
    let thumb_dir = state.project_thumbnails_dir(project_id)?;
    std::fs::create_dir_all(&thumb_dir)
        .map_err(|e| format!("Error creando directorio de thumbnails: {}", e))?;

    let mut ictx = ffmpeg_the_third::format::input(video_path)
        .map_err(|e| format!("Error abriendo video: {}", e))?;

    let video_stream_index = ictx
        .streams()
        .best(ffmpeg_the_third::media::Type::Video)
        .ok_or("No se encontró stream de video")?
        .index();

    let (time_base_num, time_base_den) = {
        let stream = ictx.stream(video_stream_index).unwrap();
        let tb = stream.time_base();
        (tb.numerator() as f64, tb.denominator() as f64)
    };

    let context = ffmpeg_the_third::codec::context::Context::from_parameters(
        ictx.stream(video_stream_index).unwrap().parameters(),
    )
    .map_err(|e| format!("Error creando contexto: {}", e))?;

    let mut decoder = context
        .decoder()
        .video()
        .map_err(|e| format!("Error creando decoder: {}", e))?;

    let width = decoder.width();
    let height = decoder.height();

    let mut scaler = ffmpeg_the_third::software::scaling::Context::get(
        decoder.format(),
        width,
        height,
        ffmpeg_the_third::format::Pixel::RGB24,
        width,
        height,
        ffmpeg_the_third::software::scaling::Flags::BILINEAR,
    )
    .map_err(|e| format!("Error creando scaler: {}", e))?;

    let pts_per_second = time_base_den / time_base_num;
    let pts_interval = (pts_per_second / fps_extraction) as i64;

    let mut frame_count: i64 = 0;
    let mut next_pts: i64 = 0;

    let mut process_decoded = |decoder: &mut ffmpeg_the_third::decoder::Video| -> Result<(), String> {
        let mut decoded_frame = ffmpeg_the_third::frame::Video::empty();
        while decoder.receive_frame(&mut decoded_frame).is_ok() {
            let pts = decoded_frame.pts().unwrap_or(0);

            if pts < next_pts {
                continue;
            }
            next_pts = pts + pts_interval;

            // Convertir a RGB
            let mut rgb_frame = ffmpeg_the_third::frame::Video::empty();
            scaler
                .run(&decoded_frame, &mut rgb_frame)
                .map_err(|e| format!("Error convirtiendo frame: {}", e))?;

            let data = rgb_frame.data(0);
            let stride = rgb_frame.stride(0);
            let w = rgb_frame.width() as usize;
            let h = rgb_frame.height() as usize;

            // Copiar datos sin padding
            let mut raw_rgb = Vec::with_capacity(w * h * 3);
            for row in 0..h {
                let start = row * stride;
                raw_rgb.extend_from_slice(&data[start..start + w * 3]);
            }

            let img = RgbImage::from_raw(w as u32, h as u32, raw_rgb)
                .ok_or("Error creando imagen RGB")?;

            // Encodear a JPEG (imagen completa)
            let mut jpeg_buf = Cursor::new(Vec::new());
            let encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, 90);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("Error codificando JPEG: {}", e))?;
            let jpeg_data = jpeg_buf.into_inner();

            let frame_name = format!(
                "{}_{}_frame_{:06}.jpg",
                uuid::Uuid::new_v4(),
                video_id,
                frame_count
            );

            // Guardar imagen completa
            let image_id = state.upload_image_bytes(
                project_id,
                &frame_name,
                &jpeg_data,
                &[],
                Some(video_id),
                Some(frame_count),
            )?;

            // Generar thumbnail (256px max)
            let dynamic_img = DynamicImage::ImageRgb8(img);
            let thumb = dynamic_img.thumbnail(256, 256);
            let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));
            let _ = thumb.save(&thumb_path);

            frame_count += 1;

            // Emitir progreso al frontend
            let progress = if estimated_total > 0 {
                ((frame_count as f64 / estimated_total as f64) * 100.0).min(99.0) as i32
            } else {
                0
            };

            let _ = app.emit(
                "video:extraction-progress",
                serde_json::json!({
                    "videoId": video_id,
                    "progress": progress,
                    "current": frame_count,
                    "total": estimated_total,
                }),
            );
        }
        Ok(())
    };

    // Procesar paquetes
    for result in ictx.packets() {
        let (stream, packet) = result.map_err(|e| format!("Error leyendo paquete: {}", e))?;
        if stream.index() != video_stream_index {
            continue;
        }
        decoder
            .send_packet(&packet)
            .map_err(|e| format!("Error enviando paquete: {}", e))?;
        process_decoded(&mut decoder)?;
    }

    // Flush decoder
    decoder
        .send_eof()
        .map_err(|e| format!("Error enviando EOF: {}", e))?;
    process_decoded(&mut decoder)?;

    // Actualizar estado del video
    state.update_video_status(project_id, video_id, "ready", frame_count)?;

    Ok(frame_count)
}

// ─── CRUD Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_video(
    state: State<'_, AppState>,
    project_id: String,
    video_id: String,
) -> Result<Option<VideoResponse>, String> {
    state.get_video(&project_id, &video_id)
}

#[tauri::command]
pub fn list_videos_by_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<VideoResponse>, String> {
    state.list_videos(&project_id)
}

#[tauri::command]
pub fn list_frames_by_video(
    state: State<'_, AppState>,
    project_id: String,
    video_id: String,
) -> Result<Vec<ImageResponse>, String> {
    state.list_frames_by_video(&project_id, &video_id)
}

#[tauri::command]
pub fn delete_video(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
) -> Result<(), String> {
    state.delete_video(&project_id, &video_id)?;
    let _ = app.emit("db:videos-changed", &project_id);
    let _ = app.emit("db:images-changed", &project_id);
    Ok(())
}

// ─── Track Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_track(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_uuid: String,
    class_id: i64,
    label: Option<String>,
) -> Result<String, String> {
    let id =
        state.create_track(&project_id, &video_id, &track_uuid, class_id, label.as_deref())?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(id)
}

#[tauri::command]
pub fn list_tracks_by_video(
    state: State<'_, AppState>,
    project_id: String,
    video_id: String,
) -> Result<Vec<TrackResponse>, String> {
    state.list_tracks(&project_id, &video_id)
}

#[tauri::command]
pub fn update_track(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
    class_id: Option<i64>,
    label: Option<String>,
    enabled: Option<bool>,
) -> Result<(), String> {
    let label_update = label.map(|l| Some(l));
    state.update_track(
        &project_id,
        &video_id,
        &track_id,
        class_id,
        label_update,
        enabled,
    )?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub fn delete_track(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
) -> Result<(), String> {
    state.delete_track(&project_id, &video_id, &track_id)?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub fn set_keyframe(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
    frame_index: i64,
    bbox_x: f64,
    bbox_y: f64,
    bbox_width: f64,
    bbox_height: f64,
) -> Result<String, String> {
    let id = state.set_keyframe(
        &project_id,
        &video_id,
        &track_id,
        frame_index,
        bbox_x,
        bbox_y,
        bbox_width,
        bbox_height,
    )?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(id)
}

#[tauri::command]
pub fn delete_keyframe(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
    frame_index: i64,
) -> Result<(), String> {
    state.delete_keyframe(&project_id, &video_id, &track_id, frame_index)?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub fn toggle_keyframe_enabled(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
    frame_index: i64,
    enabled: bool,
) -> Result<(), String> {
    state.toggle_keyframe_enabled(&project_id, &video_id, &track_id, frame_index, enabled)?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub fn bake_video_tracks(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
) -> Result<(), String> {
    let tracks = state.list_tracks(&project_id, &video_id)?;
    let frames = state.list_frames_by_video(&project_id, &video_id)?;

    for frame in &frames {
        let frame_index = frame.frame_index.unwrap_or(0);
        let mut annotations: Vec<AnnotationEntry> = frame.annotations.clone();

        for track in &tracks {
            if !track.enabled {
                continue;
            }

            let keyframe_entries: Vec<KeyframeEntry> = track
                .keyframes
                .iter()
                .map(|k| KeyframeEntry {
                    frame_index: k.frame_index,
                    bbox_x: k.bbox_x,
                    bbox_y: k.bbox_y,
                    bbox_width: k.bbox_width,
                    bbox_height: k.bbox_height,
                    is_keyframe: k.is_keyframe,
                    enabled: k.enabled,
                })
                .collect();

            if let Some((x, y, w, h, bbox_enabled)) =
                interpolate_bbox(&keyframe_entries, frame_index)
            {
                if !bbox_enabled {
                    continue;
                }

                let annotation = AnnotationEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    annotation_type: "bbox".to_string(),
                    class_id: track.class_id,
                    data: serde_json::json!({
                        "x": x,
                        "y": y,
                        "width": w,
                        "height": h,
                    }),
                };
                annotations.push(annotation);
            }
        }

        state.save_annotations(&project_id, &frame.id, &annotations)?;
    }

    let _ = app.emit("db:images-changed", &project_id);
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Retorna (x, y, width, height, enabled) interpolando entre keyframes
fn interpolate_bbox(
    keyframes: &[KeyframeEntry],
    frame_index: i64,
) -> Option<(f64, f64, f64, f64, bool)> {
    if keyframes.is_empty() {
        return None;
    }

    if let Some(kf) = keyframes.iter().find(|k| k.frame_index == frame_index) {
        return Some((kf.bbox_x, kf.bbox_y, kf.bbox_width, kf.bbox_height, kf.enabled));
    }

    let prev = keyframes
        .iter()
        .filter(|k| k.frame_index < frame_index)
        .last();
    let next = keyframes.iter().find(|k| k.frame_index > frame_index);

    match (prev, next) {
        (Some(p), Some(n)) => {
            if !p.enabled || !n.enabled {
                return Some((0.0, 0.0, 0.0, 0.0, false));
            }
            let t = (frame_index - p.frame_index) as f64
                / (n.frame_index - p.frame_index) as f64;
            let x = p.bbox_x + (n.bbox_x - p.bbox_x) * t;
            let y = p.bbox_y + (n.bbox_y - p.bbox_y) * t;
            let w = p.bbox_width + (n.bbox_width - p.bbox_width) * t;
            let h = p.bbox_height + (n.bbox_height - p.bbox_height) * t;
            Some((x, y, w, h, true))
        }
        _ => None,
    }
}
