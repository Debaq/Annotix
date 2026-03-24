use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, RgbImage};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
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
pub async fn upload_video(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    file_path: String,
    fps_extraction: f64,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData).await?;
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
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
) -> Result<i64, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData).await?;
    launch_extraction(&app, &project_id, &video_id).await
}

/// Lanza la extracción (o reanudación) de frames de un video.
/// Se usa tanto desde el command como desde el resume al iniciar la app.
async fn launch_extraction(
    app: &AppHandle,
    project_id: &str,
    video_id: &str,
) -> Result<i64, String> {
    let state = app.state::<AppState>();
    let video = state
        .get_video(project_id, video_id)?
        .ok_or("Video no encontrado")?;

    let videos_dir = state.project_videos_dir(project_id)?;
    let video_path_str = videos_dir.join(&video.file).to_string_lossy().to_string();

    let fps_extraction = video.fps_extraction;
    let duration_ms = video.duration_ms;

    let estimated_total = if duration_ms > 0 {
        ((duration_ms as f64 / 1000.0) * fps_extraction).ceil() as i64
    } else {
        0
    };

    // Contar frames ya extraídos para este video (resume)
    let existing_frames = state.with_project(project_id, |pf| {
        pf.images
            .iter()
            .filter(|i| i.video_id.as_deref() == Some(video_id))
            .count() as i64
    })?;

    let app_bg = app.clone();
    let pid = project_id.to_string();
    let vid = video_id.to_string();

    let result = tauri::async_runtime::spawn_blocking(move || {
        do_extract_frames(
            &app_bg,
            &pid,
            &vid,
            &video_path_str,
            fps_extraction,
            estimated_total,
            existing_frames,
        )
    })
    .await
    .map_err(|e| format!("Error en thread de extracción: {}", e))??;

    // Notificar al frontend
    let _ = app.emit("db:videos-changed", project_id);
    let _ = app.emit("db:images-changed", project_id);

    Ok(result)
}

/// Busca videos con status "extracting" en todos los proyectos y reanuda su extracción.
pub fn resume_pending_extractions(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let projects_dir = match state.projects_dir() {
            Ok(d) => d,
            Err(_) => return,
        };

        let entries = match std::fs::read_dir(&projects_dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut to_resume: Vec<(String, String)> = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || !path.join("project.json").exists() {
                continue;
            }

            let project_id = match path.file_name() {
                Some(name) => name.to_string_lossy().to_string(),
                None => continue,
            };

            let extracting_videos = state.with_project(&project_id, |pf| {
                pf.videos
                    .iter()
                    .filter(|v| v.status == "extracting")
                    .map(|v| v.id.clone())
                    .collect::<Vec<_>>()
            });

            if let Ok(video_ids) = extracting_videos {
                for vid in video_ids {
                    to_resume.push((project_id.clone(), vid));
                }
            }
        }

        for (project_id, video_id) in to_resume {
            log::info!(
                "Reanudando extracción: proyecto={}, video={}",
                project_id,
                video_id
            );
            if let Err(e) = launch_extraction(&app, &project_id, &video_id).await {
                log::error!("Error reanudando extracción {}/{}: {}", project_id, video_id, e);
            }
        }
    });
}

/// Tamaño del batch antes de hacer flush a disco
const BATCH_FLUSH_SIZE: usize = 50;

/// Trabajo pesado de extracción — corre en un thread separado.
/// `skip_frames`: cantidad de frames ya extraídos (para resume).
fn do_extract_frames(
    app: &AppHandle,
    project_id: &str,
    video_id: &str,
    video_path: &str,
    fps_extraction: f64,
    estimated_total: i64,
    skip_frames: i64,
) -> Result<i64, String> {
    let state = app.state::<AppState>();

    // Marcar video como "extracting"
    state.update_video_status(project_id, video_id, "extracting", skip_frames)?;
    let _ = app.emit("db:videos-changed", project_id);

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

    let mut frame_count: i64 = 0; // cuenta global (incluye skipped)
    let mut next_pts: i64 = 0;
    let mut pending_entries: Vec<crate::store::project_file::ImageEntry> = Vec::new();

    let mut process_decoded = |decoder: &mut ffmpeg_the_third::decoder::Video,
                                pending: &mut Vec<crate::store::project_file::ImageEntry>,
                                fc: &mut i64|
     -> Result<(), String> {
        let mut decoded_frame = ffmpeg_the_third::frame::Video::empty();
        while decoder.receive_frame(&mut decoded_frame).is_ok() {
            let pts = decoded_frame.pts().unwrap_or(0);

            if pts < next_pts {
                continue;
            }
            next_pts = pts + pts_interval;

            // Saltar frames ya extraídos (resume)
            if *fc < skip_frames {
                *fc += 1;
                continue;
            }

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
                *fc
            );

            // Escribir imagen a disco sin flush a project.json
            let (image_id, entry) = state.prepare_image_entry(
                project_id,
                &frame_name,
                &jpeg_data,
                w as u32,
                h as u32,
                Some(video_id),
                Some(*fc),
            )?;

            pending.push(entry);

            // Generar thumbnail (256px max)
            let dynamic_img = DynamicImage::ImageRgb8(img);
            let thumb = dynamic_img.thumbnail(256, 256);
            let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));
            let _ = thumb.save(&thumb_path);

            *fc += 1;

            // Flush periódico cada BATCH_FLUSH_SIZE frames
            if pending.len() >= BATCH_FLUSH_SIZE {
                let batch = std::mem::take(pending);
                state.commit_image_entries(project_id, batch)?;
                state.update_video_status(project_id, video_id, "extracting", *fc)?;
                let _ = app.emit("db:images-changed", project_id);
                let _ = app.emit("db:videos-changed", project_id);
            }

            // Emitir progreso al frontend
            let progress = if estimated_total > 0 {
                ((*fc as f64 / estimated_total as f64) * 100.0).min(99.0) as i32
            } else {
                0
            };

            let _ = app.emit(
                "video:extraction-progress",
                serde_json::json!({
                    "videoId": video_id,
                    "progress": progress,
                    "current": *fc,
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
        process_decoded(&mut decoder, &mut pending_entries, &mut frame_count)?;
    }

    // Flush decoder
    decoder
        .send_eof()
        .map_err(|e| format!("Error enviando EOF: {}", e))?;
    process_decoded(&mut decoder, &mut pending_entries, &mut frame_count)?;

    // Flush final de entries pendientes
    if !pending_entries.is_empty() {
        state.commit_image_entries(project_id, pending_entries)?;
    }

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
pub async fn delete_video(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Delete).await?;
    state.delete_video(&project_id, &video_id)?;
    let _ = app.emit("db:videos-changed", &project_id);
    let _ = app.emit("db:images-changed", &project_id);
    Ok(())
}

// ─── Track Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_track(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_uuid: String,
    class_id: i64,
    label: Option<String>,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
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
pub async fn update_track(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
    class_id: Option<i64>,
    label: Option<String>,
    enabled: Option<bool>,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
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
pub async fn delete_track(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Delete).await?;
    state.delete_track(&project_id, &video_id, &track_id)?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub async fn set_keyframe(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
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
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
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
pub async fn delete_keyframe(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
    frame_index: i64,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
    state.delete_keyframe(&project_id, &video_id, &track_id, frame_index)?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub async fn toggle_keyframe_enabled(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    track_id: String,
    frame_index: i64,
    enabled: bool,
) -> Result<(), String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
    state.toggle_keyframe_enabled(&project_id, &video_id, &track_id, frame_index, enabled)?;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub async fn bake_video_tracks(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
) -> Result<i64, String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate).await?;
    // Leer tracks una vez
    let tracks = state.with_project(&project_id, |pf| {
        pf.videos
            .iter()
            .find(|v| v.id == video_id)
            .map(|v| v.tracks.clone())
            .unwrap_or_default()
    })?;

    if tracks.is_empty() {
        return Ok(0);
    }

    // Precomputar keyframe entries por track habilitado
    let track_kfs: Vec<(i64, Vec<KeyframeEntry>)> = tracks
        .iter()
        .filter(|t| t.enabled && !t.keyframes.is_empty())
        .map(|t| (t.class_id, t.keyframes.clone()))
        .collect();

    if track_kfs.is_empty() {
        return Ok(0);
    }

    let now = crate::store::images::js_timestamp_pub();
    let mut baked_count: i64 = 0;

    // Un solo with_project_mut para todo el bake
    state.with_project_mut(&project_id, |pf| {
        for img in pf.images.iter_mut() {
            if img.video_id.as_deref() != Some(&video_id) {
                continue;
            }
            let frame_index = img.frame_index.unwrap_or(0);

            // Calcular nuevas anotaciones de tracks para este frame
            let mut new_annotations: Vec<AnnotationEntry> = Vec::new();
            for (class_id, kfs) in &track_kfs {
                if let Some((x, y, w, h, enabled)) = interpolate_bbox(kfs, frame_index) {
                    if !enabled {
                        continue;
                    }
                    new_annotations.push(AnnotationEntry {
                        id: uuid::Uuid::new_v4().to_string(),
                        annotation_type: "bbox".to_string(),
                        class_id: *class_id,
                        data: serde_json::json!({
                            "x": x, "y": y, "width": w, "height": h,
                        }),
                        source: "user".to_string(),
                        confidence: None,
                        model_class_name: None,
                    });
                }
            }

            if new_annotations.is_empty() {
                continue;
            }

            // Reemplazar anotaciones del frame (video frames solo tienen anotaciones de bake)
            img.annotations = new_annotations;
            img.status = "annotated".to_string();
            img.annotated = Some(now);
            baked_count += 1;
        }
        pf.updated = now;
    })?;

    let _ = app.emit("db:images-changed", &project_id);
    Ok(baked_count)
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
