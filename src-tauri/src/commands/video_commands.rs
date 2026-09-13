use image::{DynamicImage, RgbImage};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::images::ImageResponse;
use crate::store::videos::{
    bake_annotations_for_frame, BakeTrack, NewVideo, SetKeyframeRequest, ToggleKeyframeRequest,
    TrackResponse, TrackUpdate, UpdateTrackRequest, VideoInfo, VideoResponse,
};
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
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;
    let fps_extraction = validate_fps(fps_extraction)?;
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
        NewVideo {
            name: &file_name,
            file: &unique_name,
            fps_extraction,
            total_frames: 0,
            info: &info,
        },
    )?;

    let _ = app.emit(
        "db:videos-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "added",
            "videoIds": [&video_id],
        }),
    );
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
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;
    launch_extraction(&app, &project_id, &video_id).await
}

/// Pide cancelar la extracción en curso de un video. La extracción se detiene en
/// el siguiente fotograma, conserva lo ya extraído y deja el video en `pending`,
/// desde donde se puede reanudar.
#[tauri::command]
pub fn cancel_video_extraction(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<bool, String> {
    state.cancel_extraction(&video_id)
}

/// Fps de extracción admisibles. Sin tope, un valor enorme extrae todos los
/// fotogramas del video; con cero, `pts_interval` se satura y extrae uno solo.
const MIN_FPS_EXTRACTION: f64 = 0.01;
const MAX_FPS_EXTRACTION: f64 = 240.0;

fn validate_fps(fps: f64) -> Result<f64, String> {
    if !fps.is_finite() || !(MIN_FPS_EXTRACTION..=MAX_FPS_EXTRACTION).contains(&fps) {
        return Err(format!(
            "Fps de extracción fuera de rango ({}): debe estar entre {} y {}",
            fps, MIN_FPS_EXTRACTION, MAX_FPS_EXTRACTION
        ));
    }
    Ok(fps)
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

    let fps_extraction = validate_fps(video.fps_extraction)?;
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

    // Fotogramas escritos a disco que nunca llegaron a project.json (un corte a
    // mitad de lote los deja huérfanos). Se limpian antes de volver a contar.
    cleanup_orphan_frames(&state, project_id, video_id);

    if !state.begin_extraction(video_id)? {
        return Err(format!(
            "Ya hay una extracción en curso para el video {}",
            video_id
        ));
    }

    let app_bg = app.clone();
    let pid = project_id.to_string();
    let vid = video_id.to_string();

    let joined = tauri::async_runtime::spawn_blocking(move || {
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
    .await;

    state.end_extraction(video_id);

    let (result, cancelled) = match joined {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(e)) => {
            // Sin esto el video se quedaba en "extracting" y el resume del
            // arranque lo reintentaba en cada inicio, fallando igual.
            let _ = state.update_video_status(project_id, video_id, "error", 0);
            let _ = app.emit(
                "db:videos-changed",
                serde_json::json!({
                    "projectId": project_id,
                    "action": "updated",
                    "videoIds": [video_id],
                }),
            );
            return Err(e);
        }
        Err(e) => {
            let _ = state.update_video_status(project_id, video_id, "error", 0);
            return Err(format!("Error en thread de extracción: {}", e));
        }
    };

    if cancelled {
        log::info!(
            "Extracción cancelada: proyecto={}, video={}",
            project_id,
            video_id
        );
    }

    // Notificar al frontend
    let _ = app.emit(
        "db:videos-changed",
        serde_json::json!({
            "projectId": project_id,
            "action": "updated",
            "videoIds": [video_id],
        }),
    );
    let _ = app.emit(
        "db:images-changed",
        serde_json::json!({
            "projectId": project_id,
            "action": "added",
        }),
    );

    Ok(result)
}

/// Borra los fotogramas de un video que están en disco pero no en project.json,
/// y los thumbnails que no corresponden a ninguna imagen del proyecto.
fn cleanup_orphan_frames(state: &AppState, project_id: &str, video_id: &str) {
    let Ok(images_dir) = state.project_images_dir(project_id) else {
        return;
    };
    let Ok(thumbs_dir) = state.project_thumbnails_dir(project_id) else {
        return;
    };

    let known = state.with_project(project_id, |pf| {
        let files: std::collections::HashSet<String> =
            pf.images.iter().map(|i| i.file.clone()).collect();
        let ids: std::collections::HashSet<String> =
            pf.images.iter().map(|i| i.id.clone()).collect();
        (files, ids)
    });

    let Ok((known_files, known_ids)) = known else {
        return;
    };

    // Los fotogramas se nombran "{uuid}_{video_id}_frame_{n}.{ext}", así que se
    // pueden identificar los de este video sin consultar project.json.
    let marker = format!("_{}_frame_", video_id);
    let mut removed = 0usize;

    if let Ok(entries) = std::fs::read_dir(&images_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.contains(&marker) || known_files.contains(&name) {
                continue;
            }
            if std::fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }

    if let Ok(entries) = std::fs::read_dir(&thumbs_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&name);
            if known_ids.contains(stem) {
                continue;
            }
            let _ = std::fs::remove_file(entry.path());
        }
    }

    if removed > 0 {
        log::info!(
            "Limpiados {} fotogramas huérfanos de {}/{}",
            removed,
            project_id,
            video_id
        );
    }
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
                log::error!(
                    "Error reanudando extracción {}/{}: {}",
                    project_id,
                    video_id,
                    e
                );
            }
        }
    });
}

/// Tamaño del batch antes de hacer flush a disco
const BATCH_FLUSH_SIZE: usize = 50;

/// Trabajo pesado de extracción — corre en un thread separado.
/// `skip_frames`: cantidad de frames ya extraídos (para resume).
/// Devuelve `(fotogramas extraídos, cancelada)`.
fn do_extract_frames(
    app: &AppHandle,
    project_id: &str,
    video_id: &str,
    video_path: &str,
    fps_extraction: f64,
    estimated_total: i64,
    skip_frames: i64,
) -> Result<(i64, bool), String> {
    let state = app.state::<AppState>();

    // Marcar video como "extracting"
    state.update_video_status(project_id, video_id, "extracting", skip_frames)?;
    let _ = app.emit(
        "db:videos-changed",
        serde_json::json!({
            "projectId": project_id,
            "action": "updated",
            "videoIds": [video_id],
        }),
    );

    // Preparar directorio de thumbnails
    let thumb_dir = state.project_thumbnails_dir(project_id)?;
    std::fs::create_dir_all(&thumb_dir)
        .map_err(|e| format!("Error creando directorio de thumbnails: {}", e))?;

    // Formato de imagen del proyecto: "jpg" | "webp"
    let image_format = state.with_project(project_id, |pf| pf.image_format.clone())?;
    let frame_ext = if image_format == "webp" {
        "webp"
    } else {
        "jpg"
    };

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
    let mut cancelled = false;
    let mut next_pts: i64 = 0;
    let mut pending_entries: Vec<crate::store::project_file::ImageEntry> = Vec::new();
    // Throttle de progreso: max ~10 eventos/seg para no saturar IPC ni UI.
    let mut last_progress_emit = std::time::Instant::now()
        .checked_sub(std::time::Duration::from_secs(1))
        .unwrap_or_else(std::time::Instant::now);

    let mut process_decoded = |decoder: &mut ffmpeg_the_third::decoder::Video,
                               pending: &mut Vec<crate::store::project_file::ImageEntry>,
                               fc: &mut i64,
                               cancelled: &mut bool|
     -> Result<(), String> {
        let mut decoded_frame = ffmpeg_the_third::frame::Video::empty();
        while decoder.receive_frame(&mut decoded_frame).is_ok() {
            if *cancelled || state.is_extraction_cancelled(video_id) {
                *cancelled = true;
                return Ok(());
            }
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

            // Encodear al formato del proyecto (jpg/webp)
            let dynamic_img = DynamicImage::ImageRgb8(img);
            let encoded = crate::store::images::encode_image(&dynamic_img, &image_format)?;

            let frame_name = format!(
                "{}_{}_frame_{:06}.{}",
                uuid::Uuid::new_v4(),
                video_id,
                *fc,
                frame_ext
            );

            // Escribir imagen a disco sin flush a project.json
            let (image_id, entry) = state.prepare_image_entry(
                project_id,
                crate::store::images::NewImage {
                    file_name: &frame_name,
                    data: &encoded,
                    width: w as u32,
                    height: h as u32,
                    video_id: Some(video_id),
                    frame_index: Some(*fc),
                },
            )?;

            pending.push(entry);

            // Generar thumbnail (256px max) — siempre JPG para uniformidad con el resto
            let thumb = dynamic_img.thumbnail(256, 256);
            let thumb_path = thumb_dir.join(format!("{}.jpg", image_id));
            let _ = thumb.save(&thumb_path);

            *fc += 1;

            // Flush periódico cada BATCH_FLUSH_SIZE frames
            if pending.len() >= BATCH_FLUSH_SIZE {
                let batch = std::mem::take(pending);
                state.commit_image_entries(project_id, batch)?;
                state.update_video_status(project_id, video_id, "extracting", *fc)?;
                let _ = app.emit(
                    "db:images-changed",
                    serde_json::json!({
                        "projectId": project_id,
                        "action": "added",
                    }),
                );
                let _ = app.emit(
                    "db:videos-changed",
                    serde_json::json!({
                        "projectId": project_id,
                        "action": "updated",
                        "videoIds": [video_id],
                    }),
                );
            }

            // Emitir progreso al frontend (throttle ~10/seg)
            if last_progress_emit.elapsed() >= std::time::Duration::from_millis(100) {
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
                last_progress_emit = std::time::Instant::now();
            }
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
        process_decoded(
            &mut decoder,
            &mut pending_entries,
            &mut frame_count,
            &mut cancelled,
        )?;
        if cancelled {
            break;
        }
    }

    if !cancelled {
        // Flush decoder
        decoder
            .send_eof()
            .map_err(|e| format!("Error enviando EOF: {}", e))?;
        process_decoded(
            &mut decoder,
            &mut pending_entries,
            &mut frame_count,
            &mut cancelled,
        )?;
    }

    // Flush final de entries pendientes
    if !pending_entries.is_empty() {
        state.commit_image_entries(project_id, pending_entries)?;
    }

    // Una extracción cancelada deja el video en "pending": lo ya extraído se
    // conserva y el siguiente intento reanuda desde ahí.
    let status = if cancelled { "pending" } else { "ready" };
    state.update_video_status(project_id, video_id, status, frame_count)?;

    // Asegurar evento final con el estado real (sobrescribe el throttling)
    let _ = app.emit(
        "video:extraction-progress",
        serde_json::json!({
            "videoId": video_id,
            "progress": if cancelled { -1 } else { 100 },
            "current": frame_count,
            "total": estimated_total.max(frame_count),
            "cancelled": cancelled,
        }),
    );

    Ok((frame_count, cancelled))
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
    p2p.check_permission(&project_id, P2pPermission::Delete)
        .await?;
    state.delete_video(&project_id, &video_id)?;
    let _ = app.emit(
        "db:videos-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "deleted",
            "videoIds": [&video_id],
        }),
    );
    let _ = app.emit(
        "db:images-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "deleted",
        }),
    );
    Ok(())
}

// ─── Track Commands ──────────────────────────────────────────────────────────

/// Publica los tracks de un video al doc P2P si hay sesión activa. Se llama tras
/// cada mutación: sin esto, los tracks de un peer nunca salían de su máquina.
async fn publish_tracks(state: &AppState, p2p: &P2pState, project_id: &str, video_id: &str) {
    if p2p.get_session_info(project_id).await.is_none() {
        return;
    }
    let tracks = state.with_project(project_id, |pf| {
        pf.videos
            .iter()
            .find(|v| v.id == video_id)
            .map(|v| v.tracks.clone())
            .unwrap_or_default()
    });
    let Ok(tracks) = tracks else { return };
    if let Err(e) = crate::p2p::sync::sync_tracks_to_doc(p2p, project_id, video_id, &tracks).await {
        log::warn!("Error sincronizando tracks al P2P: {}", e);
    }
}

#[tauri::command]
pub async fn create_track(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    video_id: String,
    class_id: i64,
    label: Option<String>,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::Annotate)
        .await?;
    let id = state.create_track(&project_id, &video_id, class_id, label.as_deref())?;
    publish_tracks(&state, &p2p, &project_id, &video_id).await;
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
    request: UpdateTrackRequest,
) -> Result<(), String> {
    let UpdateTrackRequest {
        project_id,
        video_id,
        track_id,
        class_id,
        label,
        enabled,
        interpolation,
        extend,
    } = request;
    p2p.check_permission(&project_id, P2pPermission::Annotate)
        .await?;
    state.update_track(
        &project_id,
        &video_id,
        &track_id,
        TrackUpdate {
            class_id,
            label: label.map(Some),
            enabled,
            interpolation,
            extend,
        },
    )?;
    publish_tracks(&state, &p2p, &project_id, &video_id).await;
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
    p2p.check_permission(&project_id, P2pPermission::Delete)
        .await?;
    state.delete_track(&project_id, &video_id, &track_id)?;
    publish_tracks(&state, &p2p, &project_id, &video_id).await;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub async fn set_keyframe(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    request: SetKeyframeRequest,
) -> Result<(), String> {
    p2p.check_permission(&request.project_id, P2pPermission::Annotate)
        .await?;
    state.set_keyframe(&request)?;
    publish_tracks(&state, &p2p, &request.project_id, &request.video_id).await;
    let _ = app.emit("db:tracks-changed", &request.video_id);
    Ok(())
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
    p2p.check_permission(&project_id, P2pPermission::Annotate)
        .await?;
    state.delete_keyframe(&project_id, &video_id, &track_id, frame_index)?;
    publish_tracks(&state, &p2p, &project_id, &video_id).await;
    let _ = app.emit("db:tracks-changed", &video_id);
    Ok(())
}

#[tauri::command]
pub async fn toggle_keyframe_enabled(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    request: ToggleKeyframeRequest,
) -> Result<(), String> {
    let ToggleKeyframeRequest {
        project_id,
        video_id,
        track_id,
        frame_index,
        enabled,
    } = request;
    p2p.check_permission(&project_id, P2pPermission::Annotate)
        .await?;
    state.toggle_keyframe_enabled(&project_id, &video_id, &track_id, frame_index, enabled)?;
    publish_tracks(&state, &p2p, &project_id, &video_id).await;
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
    p2p.check_permission(&project_id, P2pPermission::Annotate)
        .await?;
    // Leer tracks una vez
    let tracks = state.with_project(&project_id, |pf| {
        pf.videos
            .iter()
            .find(|v| v.id == video_id)
            .map(|v| v.tracks.clone())
    })?;

    let tracks = tracks.ok_or_else(|| format!("Video no encontrado: {}", video_id))?;

    // Precomputar los tracks habilitados con sus keyframes ordenados y sus
    // ajustes de interpolación.
    let bake_tracks: Vec<BakeTrack> = tracks
        .iter()
        .filter(|t| t.enabled && !t.keyframes.is_empty())
        .map(BakeTrack::from_track)
        .collect();

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
            let new_annotations =
                bake_annotations_for_frame(&bake_tracks, frame_index, img.width, img.height);

            // Quitar solo lo que puso un bake anterior. Lo anotado a mano o por
            // inferencia sobre el fotograma se conserva.
            let had_previous = img.annotations.iter().any(|a| a.track_id.is_some());
            img.annotations.retain(|a| a.track_id.is_none());

            if new_annotations.is_empty() {
                if had_previous {
                    // El track desapareció o el fotograma quedó fuera de su rango:
                    // el fotograma puede haberse quedado sin ninguna anotación.
                    if img.annotations.is_empty() {
                        img.status = "pending".to_string();
                        img.annotated = None;
                    }
                }
                continue;
            }

            img.annotations.extend(new_annotations);
            img.status = "annotated".to_string();
            img.annotated = Some(now);
            baked_count += 1;
        }
        pf.updated = now;
    })?;

    let _ = app.emit(
        "db:images-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "updated",
        }),
    );
    Ok(baked_count)
}

// ─── Seguimiento asistido ────────────────────────────────────────────────────

/// Resultado de propagar un track hacia adelante.
#[derive(Debug, serde::Serialize)]
pub struct TrackingResult {
    /// Fotogramas seguidos, sin contar el de partida.
    pub tracked: i64,
    /// Keyframes escritos tras simplificar la trayectoria.
    pub keyframes: i64,
    /// Último fotograma con caja propuesta.
    #[serde(rename = "lastFrame")]
    pub last_frame: i64,
    /// `completed`, `lost` (encaje por debajo del umbral), `end` (fin del video)
    /// o `noTexture` (la región de partida no se puede buscar).
    pub reason: String,
    /// Peor encaje aceptado del recorrido, para saber cuánto fiarse.
    #[serde(rename = "worstScore")]
    pub worst_score: f64,
}

/// Parámetros de `track_object_forward`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackForwardRequest {
    pub project_id: String,
    pub video_id: String,
    pub track_id: String,
    /// Fotograma de partida: de ahí sale la caja que se va a buscar.
    pub from_frame: i64,
    /// Cuántos fotogramas seguir como mucho.
    pub max_frames: i64,
    /// Encaje mínimo aceptable, en [0, 1]. Por debajo se detiene.
    pub min_score: Option<f64>,
}

/// Sigue la caja de un track desde un fotograma y escribe los keyframes.
///
/// El seguidor propone, no decide: recorre como mucho `max_frames` fotogramas,
/// se detiene en cuanto el encaje baja de `min_score` y deja keyframes normales
/// y editables. Lo que ya hubiera en esos fotogramas se reemplaza.
#[tauri::command]
pub async fn track_object_forward(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    request: TrackForwardRequest,
) -> Result<TrackingResult, String> {
    let TrackForwardRequest {
        project_id,
        video_id,
        track_id,
        from_frame,
        max_frames,
        min_score,
    } = request;

    p2p.check_permission(&project_id, P2pPermission::Annotate)
        .await?;

    if max_frames <= 0 {
        return Err("El número de fotogramas a seguir debe ser positivo".into());
    }
    let min_score = min_score.unwrap_or(0.4);

    // Fotogramas del video ordenados, y el track de partida.
    struct Frame {
        frame_index: i64,
        file: String,
        width: u32,
        height: u32,
    }

    let (frames, keyframes, interp) = state.with_project(&project_id, |pf| {
        let mut frames: Vec<Frame> = pf
            .images
            .iter()
            .filter(|i| i.video_id.as_deref() == Some(&video_id))
            .map(|i| Frame {
                frame_index: i.frame_index.unwrap_or(0),
                file: i.file.clone(),
                width: i.width,
                height: i.height,
            })
            .collect();
        frames.sort_by_key(|f| f.frame_index);

        let track = pf
            .videos
            .iter()
            .find(|v| v.id == video_id)
            .and_then(|v| v.tracks.iter().find(|t| t.id == track_id));
        let keyframes = track.map(|t| {
            let mut kfs = t.keyframes.clone();
            kfs.sort_by_key(|k| k.frame_index);
            kfs
        });
        let interp = track.map(crate::store::videos::TrackInterp::from_track);
        (frames, keyframes, interp)
    })?;

    let keyframes = keyframes.ok_or_else(|| format!("Track no encontrado: {}", track_id))?;
    let interp = interp.unwrap_or_default();

    let start_pct = crate::store::videos::interpolate_bbox(&keyframes, from_frame, interp)
        .filter(|(_, _, _, _, enabled)| *enabled)
        .ok_or("El track no tiene caja en este fotograma")?;

    let start_at = frames
        .iter()
        .position(|f| f.frame_index == from_frame)
        .ok_or_else(|| format!("Fotograma no encontrado: {}", from_frame))?;

    let images_dir = state.project_images_dir(&project_id)?;

    // El trabajo pesado va fuera del runtime async: son varios decodes de
    // imagen y una correlación por fotograma.
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        use crate::tracking::{simplify_trajectory, track_step, PctBox, PxBox, TrackedBox};

        let first = &frames[start_at];
        let (sx, sy, sw, sh) = crate::store::videos::pct_bbox_to_px(
            start_pct.0,
            start_pct.1,
            start_pct.2,
            start_pct.3,
            first.width as f64,
            first.height as f64,
        );

        let mut samples = vec![TrackedBox {
            frame_index: first.frame_index,
            bbox: PctBox {
                x: start_pct.0,
                y: start_pct.1,
                w: start_pct.2,
                h: start_pct.3,
            },
        }];

        let load = |file: &str| -> Result<image::GrayImage, String> {
            image::open(images_dir.join(file))
                .map_err(|e| format!("No se pudo leer el fotograma {}: {}", file, e))
                .map(|img| img.to_luma8())
        };

        let mut prev_img = load(&first.file)?;
        let mut bbox = PxBox {
            x: sx,
            y: sy,
            w: sw,
            h: sh,
        };
        let mut worst_score = 1.0f64;
        let mut reason = "completed";
        let mut last_frame = first.frame_index;

        let end = (start_at + max_frames as usize + 1).min(frames.len());
        if end <= start_at + 1 {
            reason = "end";
        }

        for frame in &frames[start_at + 1..end] {
            let next_img = load(&frame.file)?;
            let Some((found, score)) = track_step(&prev_img, &next_img, bbox) else {
                reason = "noTexture";
                break;
            };
            if score < min_score {
                reason = "lost";
                break;
            }

            worst_score = worst_score.min(score);
            bbox = found;
            last_frame = frame.frame_index;
            samples.push(TrackedBox {
                frame_index: frame.frame_index,
                bbox: PctBox {
                    x: found.x / frame.width as f64 * 100.0,
                    y: found.y / frame.height as f64 * 100.0,
                    w: found.w / frame.width as f64 * 100.0,
                    h: found.h / frame.height as f64 * 100.0,
                },
            });
            prev_img = next_img;
        }

        if reason == "completed" && end == frames.len() {
            reason = "end";
        }

        // Una caja por fotograma es una lista de keyframes inservible: se
        // conservan los que la interpolación lineal no reconstruye sola.
        let kept = simplify_trajectory(&samples, 0.5);
        Ok((
            kept,
            worst_score,
            reason.to_string(),
            last_frame,
            samples.len(),
        ))
    })
    .await
    .map_err(|e| format!("Error siguiendo el objeto: {}", e))??;

    let (kept, worst_score, reason, last_frame, tracked) = result;

    let boxes: Vec<(i64, f64, f64, f64, f64)> = kept
        .iter()
        .map(|s| (s.frame_index, s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h))
        .collect();
    state.set_keyframes_bulk(&project_id, &video_id, &track_id, &boxes)?;

    publish_tracks(&state, &p2p, &project_id, &video_id).await;
    let _ = app.emit("db:tracks-changed", &video_id);

    Ok(TrackingResult {
        tracked: tracked as i64 - 1,
        keyframes: boxes.len() as i64,
        last_frame,
        reason,
        worst_score: if tracked > 1 { worst_score } else { 1.0 },
    })
}
