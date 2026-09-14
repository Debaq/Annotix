use std::fmt;
use std::path::Path;

use serde::de::{Deserializer, IgnoredAny, SeqAccess, Visitor};
use serde::Deserialize;

use super::project_file::{ClassDef, P2pDownloadStatus, ProjectFile, CURRENT_VERSION};
use super::videos::{interpolate_bbox, pct_bbox_to_px, TrackInterp};

// ─── Lectura ligera para listado de proyectos ───────────────────────────────
//
// `ProjectFile` contiene `Vec<ImageEntry>` con miles de anotaciones, vídeos,
// training_jobs con métricas, etc. Parsear todo eso solo para mostrar la
// grilla de proyectos es costoso. `ProjectSummaryRaw` parsea exactamente los
// campos que el frontend necesita y cuenta secuencias sin allocar elementos.

/// Cuenta elementos de un array sin deserializar cada uno (usa IgnoredAny).
#[derive(Debug, Clone, Default)]
pub struct CountedSeq(pub usize);

impl<'de> Deserialize<'de> for CountedSeq {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = usize;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("una secuencia")
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<usize, A::Error> {
                let mut n = 0usize;
                while seq.next_element::<IgnoredAny>()?.is_some() {
                    n += 1;
                }
                Ok(n)
            }
        }
        d.deserialize_seq(V).map(CountedSeq)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectSummaryRaw {
    #[serde(default)]
    pub version: u32,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub project_type: String,
    #[serde(default)]
    pub classes: Vec<ClassDef>,
    pub created: f64,
    pub updated: f64,
    #[serde(default)]
    pub images: CountedSeq,
    #[serde(default, rename = "p2pDownload")]
    pub p2p_download: Option<P2pDownloadStatus>,
    #[serde(default)]
    pub p2p: Option<IgnoredAny>,
    #[serde(default)]
    pub inference_models: CountedSeq,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default = "default_image_format", rename = "imageFormat")]
    pub image_format: String,
    #[serde(default = "default_webp_preset", rename = "webpQualityPreset")]
    pub webp_quality_preset: String,
}

fn default_image_format() -> String {
    "jpg".to_string()
}
fn default_webp_preset() -> String {
    "high".to_string()
}

pub fn read_project_summary(dir: &Path) -> Result<ProjectSummaryRaw, String> {
    let path = dir.join("project.json");
    if !path.exists() {
        return Err(format!("project.json no encontrado en {:?}", dir));
    }
    let file =
        std::fs::File::open(&path).map_err(|e| format!("Error abriendo project.json: {}", e))?;
    let reader = std::io::BufReader::new(file);
    let summary: ProjectSummaryRaw = serde_json::from_reader(reader)
        .map_err(|e| format!("Error parseando summary project.json: {}", e))?;
    Ok(summary)
}

pub fn read_project(dir: &Path) -> Result<ProjectFile, String> {
    let path = dir.join("project.json");
    if !path.exists() {
        return Err(format!("project.json no encontrado en {:?}", dir));
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Error leyendo project.json: {}", e))?;
    let mut project: ProjectFile = serde_json::from_str(&content)
        .map_err(|e| format!("Error parseando project.json: {}", e))?;

    if migrate_project(&mut project, dir) {
        // Persistir la migración para no repetirla en cada lectura. Si el disco
        // falla, el proyecto sigue siendo usable en memoria: se reintentará.
        if let Err(e) = write_project(dir, &project) {
            log::warn!("No se pudo persistir la migración de {}: {}", project.id, e);
        }
    }

    Ok(project)
}

/// Migraciones de formato de `project.json`. Devuelve `true` si cambió algo.
/// `dir` es el directorio del proyecto: alguna migración escribe archivos nuevos.
pub fn migrate_project(project: &mut ProjectFile, dir: &Path) -> bool {
    let mut changed = false;

    if project.version < 2 {
        migrate_v1_baked_bboxes_to_pixels(project);
        changed = true;
    }

    if project.version < 3 {
        migrate_v2_timeseries_data_to_files(project, dir);
        changed = true;
    }

    if project.version < 5 {
        migrate_v4_procedencia(project);
        changed = true;
    }

    // v5 → v6: la política de partición es un bloque opcional nuevo. Un proyecto
    // sin ella se reparte como antes —cascada sujeto → video → imagen y semilla
    // derivada del id—, así que tampoco hay datos que reescribir: declararla es
    // una decisión del usuario, y rellenarla aquí sería declarar por él una
    // política que nunca eligió.

    // v3 → v4: el sujeto es un campo opcional nuevo. Los proyectos anteriores se
    // leen con `None` gracias a `#[serde(default)]`, así que no hay datos que
    // reescribir: sólo sube el número de versión, y eso lo hace el bloque de
    // abajo. Se documenta aquí para que la ausencia de una función de migración
    // sea una decisión visible y no un olvido.

    if project.version < CURRENT_VERSION {
        project.version = CURRENT_VERSION;
        changed = true;
    }

    changed
}

/// v4 → v5: rellena `origin` desde el `source` legado, sólo donde no hay
/// ambigüedad.
///
/// `source: "ai"` y `source: "track"` dicen inequívocamente de dónde salió la
/// etiqueta. `source: "user"` no: mezcla lo trazado a mano con lo que un modelo
/// sugirió y alguien aceptó sin tocar, que es exactamente la distinción que este
/// campo viene a hacer. Esas quedan `unknown` en vez de marcarse `manual`, porque
/// marcarlas sería inventar procedencia sobre corpus ya existente — y el contrato
/// de modelo la reportaría como si fuera un dato.
fn migrate_v4_procedencia(project: &mut ProjectFile) {
    for img in project.images.iter_mut() {
        for ann in img.annotations.iter_mut() {
            if ann.origin.is_none() {
                ann.origin = Some(
                    match ann.source.as_str() {
                        "ai" => "model",
                        "track" => "track",
                        _ => "unknown",
                    }
                    .to_string(),
                );
            }
        }
    }
}

/// v1 → v2: la consolidación de tracks escribía las cajas en porcentaje 0-100
/// (la unidad de los keyframes) sobre un campo que el resto del programa lee
/// como píxeles, así que todo dataset exportado salía con las cajas colapsadas
/// contra la esquina superior izquierda.
///
/// La migración recalcula la interpolación de cada track sobre cada fotograma y
/// convierte solo las anotaciones que coinciden numéricamente con el valor en
/// porcentaje que habría escrito el bake antiguo. Lo anotado a mano o por
/// inferencia no coincide y se queda como está.
fn migrate_v1_baked_bboxes_to_pixels(project: &mut ProjectFile) -> bool {
    if project.videos.is_empty() {
        return false;
    }

    // (video_id, track_id, class_id, keyframes ordenados)
    let mut track_kfs: Vec<(
        String,
        String,
        i64,
        Vec<crate::store::project_file::KeyframeEntry>,
    )> = Vec::new();
    for video in &project.videos {
        for track in &video.tracks {
            if !track.enabled || track.keyframes.is_empty() {
                continue;
            }
            let mut kfs = track.keyframes.clone();
            kfs.sort_by_key(|k| k.frame_index);
            track_kfs.push((video.id.clone(), track.id.clone(), track.class_id, kfs));
        }
    }

    if track_kfs.is_empty() {
        return false;
    }

    let mut migrated = 0usize;

    for img in project.images.iter_mut() {
        let Some(video_id) = img.video_id.clone() else {
            continue;
        };
        let frame_index = img.frame_index.unwrap_or(0);

        for (vid, track_id, class_id, kfs) in &track_kfs {
            if vid != &video_id {
                continue;
            }
            // Ajustes por defecto (lineal, sin prolongar): reproduce lo que
            // escribía el bake de la v1, que es lo que esta migración busca.
            let Some((x_pct, y_pct, w_pct, h_pct, enabled)) =
                interpolate_bbox(kfs, frame_index, TrackInterp::default())
            else {
                continue;
            };
            if !enabled {
                continue;
            }

            // Buscar la anotación que el bake antiguo dejó con esos mismos valores.
            let target = img.annotations.iter_mut().find(|a| {
                a.track_id.is_none()
                    && a.annotation_type == "bbox"
                    && a.class_id == *class_id
                    && bbox_matches(&a.data, x_pct, y_pct, w_pct, h_pct)
            });

            let Some(ann) = target else { continue };

            let (x, y, w, h) = pct_bbox_to_px(
                x_pct,
                y_pct,
                w_pct,
                h_pct,
                img.width as f64,
                img.height as f64,
            );
            ann.data = serde_json::json!({ "x": x, "y": y, "width": w, "height": h });
            ann.source = "track".to_string();
            ann.track_id = Some(track_id.clone());
            migrated += 1;
        }
    }

    if migrated > 0 {
        log::info!(
            "Migración v1→v2 en proyecto {}: {} cajas consolidadas reescaladas a píxeles",
            project.id,
            migrated
        );
    }

    migrated > 0
}

/// v2 → v3: los datos de cada serie temporal salen de `project.json` a
/// `timeseries/{id}.json`. Con la serie dentro, cada anotación colocada obligaba
/// a reserializar todos sus puntos.
fn migrate_v2_timeseries_data_to_files(project: &mut ProjectFile, dir: &Path) {
    if project.timeseries.is_empty() {
        return;
    }

    let ts_dir = dir.join("timeseries");
    if let Err(e) = std::fs::create_dir_all(&ts_dir) {
        log::warn!(
            "No se pudo crear el directorio de series de {}: {}",
            project.id,
            e
        );
        return;
    }

    let mut moved = 0usize;

    for ts in project.timeseries.iter_mut() {
        let Some(data) = ts.data.take() else {
            continue;
        };

        let (point_count, series_count, columns) = crate::store::timeseries::describe_data(&data);
        ts.point_count = point_count;
        ts.series_count = series_count;
        ts.columns = columns;

        let path = ts_dir.join(format!("{}.json", ts.id));
        match serde_json::to_vec(&data) {
            Ok(bytes) => {
                if let Err(e) = std::fs::write(&path, bytes) {
                    log::warn!(
                        "No se pudieron escribir los datos de la serie {}: {}",
                        ts.id,
                        e
                    );
                    // Devolver el dato al entry: mejor un project.json grande que
                    // una serie que apunta a un archivo inexistente.
                    ts.data = Some(data);
                    continue;
                }
                moved += 1;
            }
            Err(e) => {
                log::warn!(
                    "No se pudieron serializar los datos de la serie {}: {}",
                    ts.id,
                    e
                );
                ts.data = Some(data);
            }
        }
    }

    if moved > 0 {
        log::info!(
            "Migración v2→v3 en proyecto {}: {} series movidas a archivos propios",
            project.id,
            moved
        );
    }
}

/// Compara una caja almacenada con unos valores esperados, con la tolerancia
/// justa para absorber el ida y vuelta por JSON.
fn bbox_matches(data: &serde_json::Value, x: f64, y: f64, w: f64, h: f64) -> bool {
    const EPS: f64 = 1e-6;
    let get = |k: &str| data.get(k).and_then(|v| v.as_f64());
    match (get("x"), get("y"), get("width"), get("height")) {
        (Some(ax), Some(ay), Some(aw), Some(ah)) => {
            (ax - x).abs() < EPS
                && (ay - y).abs() < EPS
                && (aw - w).abs() < EPS
                && (ah - h).abs() < EPS
        }
        _ => false,
    }
}

pub fn write_project(dir: &Path, data: &ProjectFile) -> Result<(), String> {
    let path = dir.join("project.json");
    let tmp_path = dir.join("project.json.tmp");

    // JSON compacto en runtime: project.json puede tener miles de anotaciones,
    // y `to_string_pretty` añade ~30-40% de tamaño en saltos/indentación que el
    // usuario rara vez lee. Para debug/export usar `to_string_pretty` en otro sitio.
    let content = serde_json::to_string(data)
        .map_err(|e| format!("Error serializando project.json: {}", e))?;

    // Escritura atómica: escribir a .tmp y luego renombrar
    std::fs::write(&tmp_path, &content)
        .map_err(|e| format!("Error escribiendo project.json.tmp: {}", e))?;

    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Error renombrando project.json.tmp: {}", e))?;

    Ok(())
}
