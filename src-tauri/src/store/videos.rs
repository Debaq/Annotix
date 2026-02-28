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
        tracks: video.tracks.iter().map(|t| track_to_response(t, &video.id)).collect(),
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

    pub fn list_videos(
        &self,
        project_id: &str,
    ) -> Result<Vec<VideoResponse>, String> {
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
        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| v.id == video_id) {
                v.status = status.to_string();
                v.total_frames = total_frames;
            }
            pf.updated = now;
        })
    }

    pub fn delete_video(
        &self,
        project_id: &str,
        video_id: &str,
    ) -> Result<(), String> {
        // Obtener el archivo de video y los IDs de imágenes asociadas antes de eliminar
        let (video_file, image_ids_and_files): (Option<String>, Vec<(String, String)>) =
            self.with_project(project_id, |pf| {
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
            pf.images.retain(|i| i.video_id.as_deref() != Some(video_id));
            pf.updated = js_timestamp();
        })?;

        // Eliminar archivos físicos de imágenes (frames)
        for (_id, file) in &image_ids_and_files {
            let images_dir = self.project_images_dir(project_id)?;
            let _ = std::fs::remove_file(images_dir.join(file));
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
        _track_uuid: &str,
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

        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| v.id == video_id) {
                v.tracks.push(entry);
            }
            pf.updated = now;
        })?;

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
                .map(|v| v.tracks.iter().map(|t| track_to_response(t, video_id)).collect())
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
        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| v.id == video_id) {
                if let Some(t) = v.tracks.iter_mut().find(|t| t.id == track_id) {
                    if let Some(cid) = class_id {
                        t.class_id = cid;
                    }
                    if let Some(lbl) = label {
                        t.label = lbl;
                    }
                    if let Some(en) = enabled {
                        t.enabled = en;
                    }
                }
            }
            pf.updated = now;
        })
    }

    pub fn delete_track(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
    ) -> Result<(), String> {
        let now = js_timestamp();
        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| v.id == video_id) {
                v.tracks.retain(|t| t.id != track_id);
            }
            pf.updated = now;
        })
    }

    // ─── Keyframes ────────────────────────────────────────────────────────────

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
    ) -> Result<String, String> {
        let now = js_timestamp();
        let kf_id = uuid::Uuid::new_v4().to_string();

        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| v.id == video_id) {
                if let Some(t) = v.tracks.iter_mut().find(|t| t.id == track_id) {
                    // Upsert: reemplazar si ya existe para ese frame_index
                    if let Some(existing) = t.keyframes.iter_mut().find(|k| k.frame_index == frame_index) {
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
                }
            }
            pf.updated = now;
        })?;

        Ok(kf_id)
    }

    pub fn delete_keyframe(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
        frame_index: i64,
    ) -> Result<(), String> {
        let now = js_timestamp();
        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| v.id == video_id) {
                if let Some(t) = v.tracks.iter_mut().find(|t| t.id == track_id) {
                    t.keyframes.retain(|k| k.frame_index != frame_index);
                }
            }
            pf.updated = now;
        })
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
        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| v.id == video_id) {
                if let Some(t) = v.tracks.iter_mut().find(|t| t.id == track_id) {
                    if let Some(kf) = t.keyframes.iter_mut().find(|k| k.frame_index == frame_index) {
                        kf.enabled = enabled;
                    }
                }
            }
            pf.updated = now;
        })
    }
}
