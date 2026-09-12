use crate::store::project_file::{KeyframeEntry, TrackEntry, VideoEntry};
use crate::store::state::AppState;

/// Timestamp compatible con JS Date.now()
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VideoResponse {
    pub id: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub name: String,
    pub file: String,
    #[serde(rename = "fpsExtraction")]
    pub fps_extraction: f64,
    #[serde(rename = "fpsOriginal")]
    pub fps_original: Option<f64>,
    #[serde(rename = "totalFrames")]
    pub total_frames: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    pub width: i64,
    pub height: i64,
    pub uploaded: f64,
    pub status: String,
    pub tracks: Vec<TrackResponse>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TrackResponse {
    pub id: String,
    #[serde(rename = "videoId")]
    pub video_id: String,
    #[serde(rename = "classId")]
    pub class_id: i64,
    pub label: Option<String>,
    pub enabled: bool,
    pub keyframes: Vec<KeyframeResponse>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KeyframeResponse {
    #[serde(rename = "frameIndex")]
    pub frame_index: i64,
    #[serde(rename = "bboxX")]
    pub bbox_x: f64,
    #[serde(rename = "bboxY")]
    pub bbox_y: f64,
    #[serde(rename = "bboxWidth")]
    pub bbox_width: f64,
    #[serde(rename = "bboxHeight")]
    pub bbox_height: f64,
    #[serde(rename = "isKeyframe")]
    pub is_keyframe: bool,
    pub enabled: bool,
}

/// Info de video (resultado de ffprobe)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VideoInfo {
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    #[serde(rename = "fpsOriginal")]
    pub fps_original: f64,
    pub width: i64,
    pub height: i64,
}

// ─── Interpolación ───────────────────────────────────────────────────────────

/// Anotaciones que producen los tracks sobre un fotograma concreto.
///
/// Los keyframes viven en porcentaje 0-100 del fotograma y una `AnnotationEntry`
/// de tipo bbox está en píxeles: sin la conversión, el dataset sale con todas
/// las cajas colapsadas contra la esquina superior izquierda (factor ancho/100).
///
/// `track_kfs` son ternas (track_id, class_id, keyframes ordenados) de los
/// tracks habilitados.
pub fn bake_annotations_for_frame(
    track_kfs: &[(String, i64, Vec<KeyframeEntry>)],
    frame_index: i64,
    img_width: u32,
    img_height: u32,
) -> Vec<crate::store::project_file::AnnotationEntry> {
    let mut out = Vec::new();

    for (track_id, class_id, kfs) in track_kfs {
        let Some((x_pct, y_pct, w_pct, h_pct, enabled)) = interpolate_bbox(kfs, frame_index) else {
            continue;
        };
        if !enabled {
            continue;
        }

        let (x, y, w, h) = pct_bbox_to_px(
            x_pct,
            y_pct,
            w_pct,
            h_pct,
            img_width as f64,
            img_height as f64,
        );

        out.push(crate::store::project_file::AnnotationEntry {
            id: uuid::Uuid::new_v4().to_string(),
            annotation_type: "bbox".to_string(),
            class_id: *class_id,
            data: serde_json::json!({
                "x": x, "y": y, "width": w, "height": h,
            }),
            source: "track".to_string(),
            confidence: None,
            model_class_name: None,
            created_by: None,
            track_id: Some(track_id.clone()),
        });
    }

    out
}

/// Convierte una caja en porcentaje 0-100 del fotograma a píxeles.
pub fn pct_bbox_to_px(
    x_pct: f64,
    y_pct: f64,
    w_pct: f64,
    h_pct: f64,
    img_w: f64,
    img_h: f64,
) -> (f64, f64, f64, f64) {
    (
        x_pct / 100.0 * img_w,
        y_pct / 100.0 * img_h,
        w_pct / 100.0 * img_w,
        h_pct / 100.0 * img_h,
    )
}

/// Retorna (x, y, width, height, enabled) interpolando entre keyframes, en la
/// misma unidad en la que estén los keyframes (porcentaje 0-100).
///
/// No extrapola: fuera del intervalo `[primer keyframe, último keyframe]` de un
/// track no hay caja. El editor sigue el mismo criterio (`interpolation.ts`).
/// `keyframes` debe venir ordenado por `frame_index`.
pub fn interpolate_bbox(
    keyframes: &[KeyframeEntry],
    frame_index: i64,
) -> Option<(f64, f64, f64, f64, bool)> {
    if keyframes.is_empty() {
        return None;
    }

    if let Some(kf) = keyframes.iter().find(|k| k.frame_index == frame_index) {
        return Some((
            kf.bbox_x,
            kf.bbox_y,
            kf.bbox_width,
            kf.bbox_height,
            kf.enabled,
        ));
    }

    let prev = keyframes.iter().rfind(|k| k.frame_index < frame_index);
    let next = keyframes.iter().find(|k| k.frame_index > frame_index);

    match (prev, next) {
        (Some(p), Some(n)) => {
            if !p.enabled || !n.enabled {
                return Some((0.0, 0.0, 0.0, 0.0, false));
            }
            let t = (frame_index - p.frame_index) as f64 / (n.frame_index - p.frame_index) as f64;
            let x = p.bbox_x + (n.bbox_x - p.bbox_x) * t;
            let y = p.bbox_y + (n.bbox_y - p.bbox_y) * t;
            let w = p.bbox_width + (n.bbox_width - p.bbox_width) * t;
            let h = p.bbox_height + (n.bbox_height - p.bbox_height) * t;
            Some((x, y, w, h, true))
        }
        _ => None,
    }
}

// ─── Conversores ─────────────────────────────────────────────────────────────

fn keyframe_to_response(kf: &KeyframeEntry) -> KeyframeResponse {
    KeyframeResponse {
        frame_index: kf.frame_index,
        bbox_x: kf.bbox_x,
        bbox_y: kf.bbox_y,
        bbox_width: kf.bbox_width,
        bbox_height: kf.bbox_height,
        is_keyframe: kf.is_keyframe,
        enabled: kf.enabled,
    }
}

fn track_to_response(track: &TrackEntry, video_id: &str) -> TrackResponse {
    TrackResponse {
        id: track.id.clone(),
        video_id: video_id.to_string(),
        class_id: track.class_id,
        label: track.label.clone(),
        enabled: track.enabled,
        keyframes: track.keyframes.iter().map(keyframe_to_response).collect(),
    }
}

fn video_to_response(video: &VideoEntry, project_id: &str) -> VideoResponse {
    VideoResponse {
        id: video.id.clone(),
        project_id: project_id.to_string(),
        name: video.name.clone(),
        file: video.file.clone(),
        fps_extraction: video.fps_extraction,
        fps_original: video.fps_original,
        total_frames: video.total_frames,
        duration_ms: video.duration_ms,
        width: video.width,
        height: video.height,
        uploaded: video.uploaded,
        status: video.status.clone(),
        tracks: video
            .tracks
            .iter()
            .map(|t| track_to_response(t, &video.id))
            .collect(),
    }
}

// ─── Errores ─────────────────────────────────────────────────────────────────
//
// Los mutadores devolvían Ok(()) cuando el video o el track no existía: la
// escritura se reportaba como aplicada y no lo estaba. Cualquier carrera con un
// borrado, o un id viejo tras recargar, quedaba invisible.

fn video_not_found(video_id: &str) -> String {
    format!("Video no encontrado: {}", video_id)
}

fn track_not_found(track_id: &str) -> String {
    format!("Track no encontrado: {}", track_id)
}

fn keyframe_not_found(frame_index: i64) -> String {
    format!("Keyframe no encontrado en el fotograma {}", frame_index)
}

/// Resultado de buscar un track dentro de un video.
enum TrackLookup {
    Found,
    NoVideo,
    NoTrack,
}

impl TrackLookup {
    fn resolve(self, video_id: &str, track_id: &str) -> Result<(), String> {
        match self {
            TrackLookup::Found => Ok(()),
            TrackLookup::NoVideo => Err(video_not_found(video_id)),
            TrackLookup::NoTrack => Err(track_not_found(track_id)),
        }
    }
}

/// Aplica `f` sobre un track y dice si lo encontró.
fn with_track(
    pf: &mut crate::store::project_file::ProjectFile,
    video_id: &str,
    track_id: &str,
    f: impl FnOnce(&mut TrackEntry),
) -> TrackLookup {
    match pf.videos.iter_mut().find(|v| v.id == video_id) {
        Some(v) => match v.tracks.iter_mut().find(|t| t.id == track_id) {
            Some(t) => {
                f(t);
                TrackLookup::Found
            }
            None => TrackLookup::NoTrack,
        },
        None => TrackLookup::NoVideo,
    }
}

// ─── AppState impl ────────────────────────────────────────────────────────────

impl AppState {
    // ─── Videos ──────────────────────────────────────────────────────────────

    pub fn create_video(
        &self,
        project_id: &str,
        name: &str,
        file: &str,
        fps_extraction: f64,
        fps_original: Option<f64>,
        total_frames: i64,
        duration_ms: i64,
        width: i64,
        height: i64,
    ) -> Result<String, String> {
        let now = js_timestamp();
        let id = uuid::Uuid::new_v4().to_string();

        let entry = VideoEntry {
            id: id.clone(),
            name: name.to_string(),
            file: file.to_string(),
            fps_extraction,
            fps_original,
            total_frames,
            duration_ms,
            width,
            height,
            uploaded: now,
            status: "pending".to_string(),
            tracks: vec![],
        };

        self.with_project_mut(project_id, |pf| {
            pf.videos.push(entry);
            pf.updated = now;
        })?;

        Ok(id)
    }

    pub fn get_video(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<Option<VideoResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.videos
                .iter()
                .find(|v| v.id == video_id)
                .map(|v| video_to_response(v, &pf.id))
        })
    }

    pub fn list_videos(&self, project_id: &str) -> Result<Vec<VideoResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.videos
                .iter()
                .map(|v| video_to_response(v, &pf.id))
                .collect()
        })
    }

    pub fn update_video_status(
        &self,
        project_id: &str,
        video_id: &str,
        status: &str,
        total_frames: i64,
    ) -> Result<(), String> {
        let now = js_timestamp();
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = match pf.videos.iter_mut().find(|v| v.id == video_id) {
                Some(v) => {
                    v.status = status.to_string();
                    v.total_frames = total_frames;
                    true
                }
                None => false,
            };
            pf.updated = now;
            found
        })?;
        if found {
            Ok(())
        } else {
            Err(video_not_found(video_id))
        }
    }

    pub fn delete_video(&self, project_id: &str, video_id: &str) -> Result<(), String> {
        // Obtener el archivo de video y los IDs de imágenes asociadas antes de eliminar
        let (video_file, image_ids_and_files): (Option<String>, Vec<(String, String)>) = self
            .with_project(project_id, |pf| {
                let video_file = pf
                    .videos
                    .iter()
                    .find(|v| v.id == video_id)
                    .map(|v| v.file.clone());
                let image_data: Vec<(String, String)> = pf
                    .images
                    .iter()
                    .filter(|i| i.video_id.as_deref() == Some(video_id))
                    .map(|i| (i.id.clone(), i.file.clone()))
                    .collect();
                (video_file, image_data)
            })?;

        // Eliminar de project.json
        self.with_project_mut(project_id, |pf| {
            pf.videos.retain(|v| v.id != video_id);
            pf.images
                .retain(|i| i.video_id.as_deref() != Some(video_id));
            pf.updated = js_timestamp();
        })?;

        // Eliminar archivos físicos de imágenes (frames) y sus thumbnails
        let images_dir = self.project_images_dir(project_id)?;
        let thumbs_dir = self.project_thumbnails_dir(project_id)?;
        for (id, file) in &image_ids_and_files {
            let _ = std::fs::remove_file(images_dir.join(file));
            let _ = std::fs::remove_file(thumbs_dir.join(format!("{}.jpg", id)));
        }

        // Eliminar archivo de video físico
        if let Some(file) = video_file {
            let videos_dir = self.project_videos_dir(project_id)?;
            let _ = std::fs::remove_file(videos_dir.join(&file));
        }

        Ok(())
    }

    // ─── Tracks ───────────────────────────────────────────────────────────────

    pub fn create_track(
        &self,
        project_id: &str,
        video_id: &str,
        class_id: i64,
        label: Option<&str>,
    ) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = js_timestamp();

        let entry = TrackEntry {
            id: id.clone(),
            class_id,
            label: label.map(|s| s.to_string()),
            enabled: true,
            keyframes: vec![],
        };

        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = match pf.videos.iter_mut().find(|v| v.id == video_id) {
                Some(v) => {
                    v.tracks.push(entry);
                    true
                }
                None => false,
            };
            pf.updated = now;
            found
        })?;

        if !found {
            return Err(video_not_found(video_id));
        }

        Ok(id)
    }

    pub fn list_tracks(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<Vec<TrackResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.videos
                .iter()
                .find(|v| v.id == video_id)
                .map(|v| {
                    v.tracks
                        .iter()
                        .map(|t| track_to_response(t, video_id))
                        .collect()
                })
                .unwrap_or_default()
        })
    }

    pub fn update_track(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
        class_id: Option<i64>,
        label: Option<Option<String>>,
        enabled: Option<bool>,
    ) -> Result<(), String> {
        let now = js_timestamp();
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = with_track(pf, video_id, track_id, |t| {
                if let Some(cid) = class_id {
                    t.class_id = cid;
                }
                if let Some(lbl) = label {
                    t.label = lbl;
                }
                if let Some(en) = enabled {
                    t.enabled = en;
                }
            });
            pf.updated = now;
            found
        })?;
        found.resolve(video_id, track_id)
    }

    pub fn delete_track(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
    ) -> Result<(), String> {
        let now = js_timestamp();
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = match pf.videos.iter_mut().find(|v| v.id == video_id) {
                Some(v) => {
                    let before = v.tracks.len();
                    v.tracks.retain(|t| t.id != track_id);
                    if v.tracks.len() == before {
                        TrackLookup::NoTrack
                    } else {
                        TrackLookup::Found
                    }
                }
                None => TrackLookup::NoVideo,
            };
            pf.updated = now;
            found
        })?;
        found.resolve(video_id, track_id)
    }

    // ─── Keyframes ────────────────────────────────────────────────────────────

    /// Crea o reemplaza el keyframe de un track en un fotograma.
    ///
    /// La caja va en porcentaje 0-100 del fotograma, que es la unidad en la que
    /// vive un keyframe. La conversión a píxeles ocurre al consolidar.
    pub fn set_keyframe(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
        frame_index: i64,
        bbox_x: f64,
        bbox_y: f64,
        bbox_width: f64,
        bbox_height: f64,
    ) -> Result<(), String> {
        for (name, v) in [
            ("x", bbox_x),
            ("y", bbox_y),
            ("width", bbox_width),
            ("height", bbox_height),
        ] {
            if !v.is_finite() {
                return Err(format!("Coordenada de keyframe inválida ({}): {}", name, v));
            }
        }

        let now = js_timestamp();

        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = with_track(pf, video_id, track_id, |t| {
                // Upsert: reemplazar si ya existe para ese frame_index
                if let Some(existing) = t
                    .keyframes
                    .iter_mut()
                    .find(|k| k.frame_index == frame_index)
                {
                    existing.bbox_x = bbox_x;
                    existing.bbox_y = bbox_y;
                    existing.bbox_width = bbox_width;
                    existing.bbox_height = bbox_height;
                    existing.is_keyframe = true;
                } else {
                    t.keyframes.push(KeyframeEntry {
                        frame_index,
                        bbox_x,
                        bbox_y,
                        bbox_width,
                        bbox_height,
                        is_keyframe: true,
                        enabled: true,
                    });
                    // Mantener orden por frame_index
                    t.keyframes.sort_by_key(|k| k.frame_index);
                }
            });
            pf.updated = now;
            found
        })?;

        found.resolve(video_id, track_id)
    }

    pub fn delete_keyframe(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
        frame_index: i64,
    ) -> Result<(), String> {
        let now = js_timestamp();
        let mut removed = false;
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = with_track(pf, video_id, track_id, |t| {
                let before = t.keyframes.len();
                t.keyframes.retain(|k| k.frame_index != frame_index);
                removed = t.keyframes.len() != before;
            });
            pf.updated = now;
            found
        })?;

        found.resolve(video_id, track_id)?;
        if removed {
            Ok(())
        } else {
            Err(keyframe_not_found(frame_index))
        }
    }

    pub fn toggle_keyframe_enabled(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
        frame_index: i64,
        enabled: bool,
    ) -> Result<(), String> {
        let now = js_timestamp();
        let mut toggled = false;
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = with_track(pf, video_id, track_id, |t| {
                if let Some(kf) = t
                    .keyframes
                    .iter_mut()
                    .find(|k| k.frame_index == frame_index)
                {
                    kf.enabled = enabled;
                    toggled = true;
                }
            });
            pf.updated = now;
            found
        })?;

        found.resolve(video_id, track_id)?;
        if toggled {
            Ok(())
        } else {
            Err(keyframe_not_found(frame_index))
        }
    }
}
