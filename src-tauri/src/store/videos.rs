use serde::Deserialize;

use crate::store::project_file::{KeyframeEntry, TrackEntry, VideoEntry};
use crate::store::state::AppState;

/// Parámetros de `set_frame_reviewed`. Los tres ids y el fotograma van siempre
/// juntos, igual que en `SetKeyframeRequest`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFrameReviewedRequest {
    pub project_id: String,
    pub video_id: String,
    pub track_id: String,
    pub frame_index: i64,
    pub reviewed: bool,
}

/// Parámetros de `set_keyframe`. La caja va en porcentaje 0-100 del fotograma.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetKeyframeRequest {
    pub project_id: String,
    pub video_id: String,
    pub track_id: String,
    pub frame_index: i64,
    pub bbox_x: f64,
    pub bbox_y: f64,
    pub bbox_width: f64,
    pub bbox_height: f64,
}

/// Parámetros de `update_track`. Los tres ids van siempre juntos y `class_id`
/// / `enabled` son opcionales del mismo tipo que `label`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTrackRequest {
    pub project_id: String,
    pub video_id: String,
    pub track_id: String,
    pub class_id: Option<i64>,
    pub label: Option<String>,
    pub enabled: Option<bool>,
    pub interpolation: Option<String>,
    pub extend: Option<String>,
}

/// Cambios a aplicar sobre un track. Cada campo en `None` se deja como está;
/// `label` distingue "no tocar" de "borrar la etiqueta".
#[derive(Debug, Default)]
pub struct TrackUpdate {
    pub class_id: Option<i64>,
    pub label: Option<Option<String>>,
    pub enabled: Option<bool>,
    pub interpolation: Option<String>,
    pub extend: Option<String>,
}

/// Parámetros de `toggle_keyframe_enabled`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleKeyframeRequest {
    pub project_id: String,
    pub video_id: String,
    pub track_id: String,
    pub frame_index: i64,
    pub enabled: bool,
}

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
    pub interpolation: String,
    pub extend: String,
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

/// Cómo se rellena el hueco entre dos keyframes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum InterpMode {
    /// Recta entre las dos cajas.
    #[default]
    Linear,
    /// Recta con arranque y frenada suaves (smoothstep sobre `t`).
    Ease,
    /// Spline de Catmull-Rom sobre los keyframes vecinos: sigue la curva del
    /// movimiento en vez de quebrarse en cada keyframe.
    Smooth,
}

/// Qué hace el track fuera del rango que cubren sus keyframes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Extend {
    /// Nada: sin caja antes del primer keyframe ni después del último.
    #[default]
    None,
    /// La última caja sigue hasta el final del video.
    After,
    /// Además, la primera caja se prolonga hacia atrás hasta el inicio.
    Both,
}

impl Extend {
    fn before(self) -> bool {
        matches!(self, Extend::Both)
    }
    fn after(self) -> bool {
        matches!(self, Extend::After | Extend::Both)
    }
}

/// Ajustes de interpolación de un track, ya parseados.
#[derive(Debug, Clone, Copy, Default)]
pub struct TrackInterp {
    pub mode: InterpMode,
    pub extend: Extend,
}

impl TrackInterp {
    /// Lee los dos campos de texto de un `TrackEntry`. Un valor desconocido cae
    /// al comportamiento por defecto en vez de fallar.
    pub fn from_track(track: &TrackEntry) -> Self {
        Self {
            mode: match track.interpolation.as_str() {
                "ease" => InterpMode::Ease,
                "smooth" => InterpMode::Smooth,
                _ => InterpMode::Linear,
            },
            extend: match track.extend.as_str() {
                "after" => Extend::After,
                "both" => Extend::Both,
                _ => Extend::None,
            },
        }
    }
}

/// Un track listo para consolidar: sus keyframes ordenados y sus ajustes.
pub struct BakeTrack {
    pub track_id: String,
    pub class_id: i64,
    pub keyframes: Vec<KeyframeEntry>,
    pub interp: TrackInterp,
}

impl BakeTrack {
    /// Ordena los keyframes por fotograma, que es lo que asume la interpolación.
    /// `set_keyframe` ya los mantiene ordenados, pero un `project.json`
    /// importado o editado a mano puede llegar desordenado.
    pub fn from_track(track: &TrackEntry) -> Self {
        let mut keyframes = track.keyframes.clone();
        keyframes.sort_by_key(|k| k.frame_index);
        Self {
            track_id: track.id.clone(),
            class_id: track.class_id,
            keyframes,
            interp: TrackInterp::from_track(track),
        }
    }
}

/// Anotaciones que producen los tracks sobre un fotograma concreto.
///
/// Los keyframes viven en porcentaje 0-100 del fotograma y una `AnnotationEntry`
/// de tipo bbox está en píxeles: sin la conversión, el dataset sale con todas
/// las cajas colapsadas contra la esquina superior izquierda (factor ancho/100).
pub fn bake_annotations_for_frame(
    tracks: &[BakeTrack],
    frame_index: i64,
    img_width: u32,
    img_height: u32,
) -> Vec<crate::store::project_file::AnnotationEntry> {
    let mut out = Vec::new();

    for bt in tracks {
        let Some((x_pct, y_pct, w_pct, h_pct, enabled)) =
            interpolate_bbox(&bt.keyframes, frame_index, bt.interp)
        else {
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
            class_id: bt.class_id,
            data: serde_json::json!({
                "x": x, "y": y, "width": w, "height": h,
            }),
            source: "track".to_string(),
            confidence: None,
            model_class_name: None,
            created_by: None,
            track_id: Some(bt.track_id.clone()),
            origin: Some("track".to_string()),
            model_id: None,
            // Un fotograma interpolado no lo revisó nadie; uno fijado o marcado
            // como visto, sí. Es lo que distingue una caja que una persona validó
            // de una que el sistema dedujo y nadie miró.
            review: Some(
                if bt
                    .keyframes
                    .iter()
                    .any(|k| k.frame_index == frame_index && k.reviewed)
                {
                    "reviewed"
                } else {
                    "unreviewed"
                }
                .to_string(),
            ),
            reviewed_by: None,
            reviewed_at: None,
            created_at: Some(crate::store::images::js_timestamp_pub()),
            updated_at: None,
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

/// Retorna (x, y, width, height, enabled) para un fotograma, en la misma unidad
/// en la que estén los keyframes (porcentaje 0-100). `keyframes` debe venir
/// ordenado por `frame_index`.
///
/// Un keyframe deshabilitado marca que el objeto sale de escena **desde ese
/// fotograma en adelante**, hasta el siguiente keyframe. Antes apagaba también
/// el tramo anterior: borrar la caja de un fotograma interpolado hacía
/// desaparecer el track entre sus dos keyframes vecinos, decenas de fotogramas
/// que el usuario no había tocado.
///
/// Fuera del rango de keyframes manda `interp.extend`. La caja devuelta con
/// `enabled == false` sigue existiendo para el editor —se dibuja en gris y se
/// puede reactivar— pero la consolidación la descarta.
///
/// El editor calcula esto mismo en `src/features/video/utils/interpolation.ts`.
/// Si los dos lados divergen, el editor muestra cajas que nunca llegan al
/// dataset.
pub fn interpolate_bbox(
    keyframes: &[KeyframeEntry],
    frame_index: i64,
    interp: TrackInterp,
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

    let prev_idx = keyframes.iter().rposition(|k| k.frame_index < frame_index);
    let next_idx = keyframes.iter().position(|k| k.frame_index > frame_index);

    match (prev_idx, next_idx) {
        // Fuera de escena desde el keyframe anterior: caja fantasma con su
        // geometría, para poder reactivarla desde cualquier fotograma del tramo.
        (Some(i), _) if !keyframes[i].enabled => {
            let p = &keyframes[i];
            Some((p.bbox_x, p.bbox_y, p.bbox_width, p.bbox_height, false))
        }
        (Some(i), Some(j)) => {
            let (x, y, w, h) = sample_span(keyframes, i, j, frame_index, interp.mode);
            Some((x, y, w, h, true))
        }
        (Some(i), None) if interp.extend.after() => {
            let p = &keyframes[i];
            Some((p.bbox_x, p.bbox_y, p.bbox_width, p.bbox_height, true))
        }
        (None, Some(j)) if interp.extend.before() => {
            let n = &keyframes[j];
            Some((n.bbox_x, n.bbox_y, n.bbox_width, n.bbox_height, n.enabled))
        }
        _ => None,
    }
}

/// Muestrea el tramo entre los keyframes `i` y `j` (contiguos) en `frame_index`.
fn sample_span(
    keyframes: &[KeyframeEntry],
    i: usize,
    j: usize,
    frame_index: i64,
    mode: InterpMode,
) -> (f64, f64, f64, f64) {
    let p = &keyframes[i];
    let n = &keyframes[j];
    let span = (n.frame_index - p.frame_index) as f64;
    let t = (frame_index - p.frame_index) as f64 / span;

    match mode {
        InterpMode::Linear => lerp_box(p, n, t),
        InterpMode::Ease => lerp_box(p, n, t * t * (3.0 - 2.0 * t)),
        InterpMode::Smooth => {
            // Catmull-Rom con nodos no equiespaciados (Hermite con tangentes por
            // diferencias finitas). Un keyframe deshabilitado no sirve de punto
            // de control: su geometría es la que tenía al salir de escena.
            let before = i
                .checked_sub(1)
                .map(|k| &keyframes[k])
                .filter(|k| k.enabled);
            let after = keyframes.get(j + 1).filter(|k| k.enabled);
            let comp = |get: fn(&KeyframeEntry) -> f64| {
                catmull_rom(
                    before.map(|k| (k.frame_index as f64, get(k))),
                    (p.frame_index as f64, get(p)),
                    (n.frame_index as f64, get(n)),
                    after.map(|k| (k.frame_index as f64, get(k))),
                    t,
                )
            };
            (
                comp(|k| k.bbox_x),
                comp(|k| k.bbox_y),
                // Un spline sobrepasa los extremos: el ancho no puede salir
                // negativo por un rebote entre dos keyframes.
                comp(|k| k.bbox_width).max(0.0),
                comp(|k| k.bbox_height).max(0.0),
            )
        }
    }
}

fn lerp_box(p: &KeyframeEntry, n: &KeyframeEntry, t: f64) -> (f64, f64, f64, f64) {
    (
        p.bbox_x + (n.bbox_x - p.bbox_x) * t,
        p.bbox_y + (n.bbox_y - p.bbox_y) * t,
        p.bbox_width + (n.bbox_width - p.bbox_width) * t,
        p.bbox_height + (n.bbox_height - p.bbox_height) * t,
    )
}

/// Hermite cúbico sobre `[p1, p2]` con tangentes de Catmull-Rom. Los nodos son
/// índices de fotograma, así que el espaciado es irregular y las tangentes se
/// calculan con la diferencia dividida, no con `(v2 - v0) / 2`. Sin vecino, la
/// tangente cae a la pendiente del propio tramo, que reproduce la recta.
fn catmull_rom(
    p0: Option<(f64, f64)>,
    p1: (f64, f64),
    p2: (f64, f64),
    p3: Option<(f64, f64)>,
    t: f64,
) -> f64 {
    let (f1, v1) = p1;
    let (f2, v2) = p2;
    let h = f2 - f1;
    let slope = (v2 - v1) / h;

    let m1 = match p0 {
        Some((f0, v0)) if f2 - f0 != 0.0 => (v2 - v0) / (f2 - f0),
        _ => slope,
    };
    let m2 = match p3 {
        Some((f3, v3)) if f3 - f1 != 0.0 => (v3 - v1) / (f3 - f1),
        _ => slope,
    };

    let t2 = t * t;
    let t3 = t2 * t;
    let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
    let h10 = t3 - 2.0 * t2 + t;
    let h01 = -2.0 * t3 + 3.0 * t2;
    let h11 = t3 - t2;

    h00 * v1 + h10 * h * m1 + h01 * v2 + h11 * h * m2
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
        interpolation: track.interpolation.clone(),
        extend: track.extend.clone(),
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

/// Video recién copiado al proyecto. `info` son los datos que ya devolvió
/// `get_video_info` sobre el archivo.
pub struct NewVideo<'a> {
    pub name: &'a str,
    pub file: &'a str,
    pub fps_extraction: f64,
    pub total_frames: i64,
    pub info: &'a VideoInfo,
}

// ─── AppState impl ────────────────────────────────────────────────────────────

impl AppState {
    // ─── Videos ──────────────────────────────────────────────────────────────

    pub fn create_video(&self, project_id: &str, video: NewVideo<'_>) -> Result<String, String> {
        let NewVideo {
            name,
            file,
            fps_extraction,
            total_frames,
            info,
        } = video;
        let now = js_timestamp();
        let id = uuid::Uuid::new_v4().to_string();

        let entry = VideoEntry {
            subject_id: None,
            id: id.clone(),
            name: name.to_string(),
            file: file.to_string(),
            fps_extraction,
            fps_original: Some(info.fps_original),
            total_frames,
            duration_ms: info.duration_ms,
            width: info.width,
            height: info.height,
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

        // Los tracks nuevos prolongan su última caja hasta el final del video:
        // el objeto sigue ahí hasta que se marca su salida de escena. Los tracks
        // anteriores a este campo se quedan en `none` para no cambiarles el
        // dataset por debajo.
        let entry = TrackEntry {
            id: id.clone(),
            class_id,
            label: label.map(|s| s.to_string()),
            enabled: true,
            interpolation: "linear".to_string(),
            extend: "after".to_string(),
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
        update: TrackUpdate,
    ) -> Result<(), String> {
        let now = js_timestamp();
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = with_track(pf, video_id, track_id, |t| {
                if let Some(cid) = update.class_id {
                    t.class_id = cid;
                }
                if let Some(lbl) = update.label {
                    t.label = lbl;
                }
                if let Some(en) = update.enabled {
                    t.enabled = en;
                }
                if let Some(mode) = update.interpolation {
                    t.interpolation = mode;
                }
                if let Some(ext) = update.extend {
                    t.extend = ext;
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
    pub fn set_keyframe(&self, req: &SetKeyframeRequest) -> Result<(), String> {
        let project_id = req.project_id.as_str();
        let video_id = req.video_id.as_str();
        let track_id = req.track_id.as_str();
        let frame_index = req.frame_index;
        let (bbox_x, bbox_y, bbox_width, bbox_height) =
            (req.bbox_x, req.bbox_y, req.bbox_width, req.bbox_height);

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
                    existing.reviewed = true;
                } else {
                    t.keyframes.push(KeyframeEntry {
                        frame_index,
                        bbox_x,
                        bbox_y,
                        bbox_width,
                        bbox_height,
                        is_keyframe: true,
                        enabled: true,
                        // Fijar la caja a mano es revisarla: la persona la puso ahí.
                        reviewed: true,
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

    /// Inserta o reemplaza varios keyframes de un track de una sola vez.
    ///
    /// El seguidor escribe una tanda entera; uno a uno serían tantas escrituras
    /// completas de `project.json` como keyframes propuestos.
    /// Marca (o desmarca) como revisado un fotograma de un track.
    ///
    /// Existe para los fotogramas **interpolados**: el sistema dedujo la caja y
    /// hasta que alguien la mira esa deducción no está validada. Si el fotograma
    /// no tiene entrada propia se crea una sin fijar la caja (`isKeyframe: false`),
    /// porque marcar como visto no debe convertir una interpolación en un
    /// keyframe: eso cambiaría la trayectoria.
    pub fn set_frame_reviewed(&self, req: &SetFrameReviewedRequest) -> Result<(), String> {
        let SetFrameReviewedRequest {
            project_id,
            video_id,
            track_id,
            frame_index,
            reviewed,
        } = req;
        let (frame_index, reviewed) = (*frame_index, *reviewed);
        self.with_project_mut(project_id, |pf| {
            if let Some(v) = pf.videos.iter_mut().find(|v| &v.id == video_id) {
                if let Some(t) = v.tracks.iter_mut().find(|t| &t.id == track_id) {
                    match t
                        .keyframes
                        .iter_mut()
                        .find(|k| k.frame_index == frame_index)
                    {
                        Some(k) => k.reviewed = reviewed,
                        None => {
                            if reviewed {
                                t.keyframes.push(KeyframeEntry {
                                    frame_index,
                                    bbox_x: 0.0,
                                    bbox_y: 0.0,
                                    bbox_width: 0.0,
                                    bbox_height: 0.0,
                                    is_keyframe: false,
                                    enabled: true,
                                    reviewed: true,
                                });
                                t.keyframes.sort_by_key(|k| k.frame_index);
                            }
                        }
                    }
                }
            }
        })
    }

    pub fn set_keyframes_bulk(
        &self,
        project_id: &str,
        video_id: &str,
        track_id: &str,
        boxes: &[(i64, f64, f64, f64, f64)],
    ) -> Result<(), String> {
        for (frame_index, x, y, w, h) in boxes {
            for (name, v) in [("x", x), ("y", y), ("width", w), ("height", h)] {
                if !v.is_finite() {
                    return Err(format!(
                        "Coordenada de keyframe inválida ({}) en el fotograma {}: {}",
                        name, frame_index, v
                    ));
                }
            }
        }

        let now = js_timestamp();
        let found = self.with_project_mut_ret(project_id, |pf| {
            let found = with_track(pf, video_id, track_id, |t| {
                for (frame_index, x, y, w, h) in boxes {
                    if let Some(existing) = t
                        .keyframes
                        .iter_mut()
                        .find(|k| k.frame_index == *frame_index)
                    {
                        existing.bbox_x = *x;
                        existing.bbox_y = *y;
                        existing.bbox_width = *w;
                        existing.bbox_height = *h;
                        existing.is_keyframe = true;
                        existing.reviewed = true;
                    } else {
                        t.keyframes.push(KeyframeEntry {
                            frame_index: *frame_index,
                            bbox_x: *x,
                            bbox_y: *y,
                            bbox_width: *w,
                            bbox_height: *h,
                            is_keyframe: true,
                            enabled: true,
                            reviewed: true,
                        });
                    }
                }
                t.keyframes.sort_by_key(|k| k.frame_index);
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
