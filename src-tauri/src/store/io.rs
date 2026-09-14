use std::fmt;
use std::path::Path;

use serde::de::{Deserializer, IgnoredAny, SeqAccess, Visitor};
use serde::Deserialize;

use super::project_file::{ClassDef, P2pDownloadStatus, ProjectFile, CURRENT_VERSION};
use super::videos::{interpolate_bbox, pct_bbox_to_px, TrackInterp};
use crate::crypto::{archivo as cripto, sesion};

/// Código estable del error de leer un proyecto cifrado sin haberlo abierto.
///
/// Va como código y no como frase porque la interfaz tiene que **reconocerlo**
/// para pedir la frase de paso, no para enseñárselo al usuario: quien ve este
/// texto es porque algo se nos escapó.
pub const ERROR_BLOQUEADO: &str = "proyecto_cifrado_bloqueado";

const PROJECT_JSON: &str = "project.json";

/// Lee un archivo del proyecto, descifrándolo si hace falta.
///
/// La decisión de descifrar la toma **el propio archivo** —su marca de
/// cabecera—, no una bandera guardada aparte: un proyecto a medio cifrar, o una
/// copia de seguridad mezclada, se leen igual de bien.
pub fn leer_archivo(dir: &Path, nombre: &str) -> Result<Vec<u8>, String> {
    let ruta = dir.join(nombre);
    let bytes = std::fs::read(&ruta).map_err(|e| format!("Error leyendo {nombre}: {e}"))?;
    if !cripto::es_cifrado(&bytes) {
        return Ok(bytes);
    }
    let clave = sesion::clave(dir).ok_or(ERROR_BLOQUEADO)?;
    cripto::descifrar(&clave, nombre, &bytes)
}

/// Escribe un archivo del proyecto, cifrándolo si el proyecto está cifrado.
///
/// Escritura atómica: `.tmp` y renombrado. Un corte de luz a mitad no puede
/// dejar medio archivo cifrado, que sería indistinguible de uno manipulado.
pub fn escribir_archivo(dir: &Path, nombre: &str, datos: &[u8]) -> Result<(), String> {
    let datos = match sesion::clave(dir) {
        Some(clave) => cripto::cifrar(&clave, nombre, datos)?,
        None if sesion::hay_vault(dir) => return Err(ERROR_BLOQUEADO.to_string()),
        None => datos.to_vec(),
    };
    let ruta = dir.join(nombre);
    let tmp = dir.join(format!("{nombre}.tmp"));
    std::fs::write(&tmp, &datos).map_err(|e| format!("Error escribiendo {nombre}.tmp: {e}"))?;
    std::fs::rename(&tmp, &ruta).map_err(|e| format!("Error renombrando {nombre}.tmp: {e}"))
}

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
    /// Cifrado y sin abrir. No sale del JSON —de ahí no se puede leer nada—:
    /// lo pone el lector cuando encuentra el proyecto bloqueado.
    #[serde(skip)]
    pub locked: bool,
}

fn default_image_format() -> String {
    "jpg".to_string()
}
fn default_webp_preset() -> String {
    "high".to_string()
}

pub fn read_project_summary(dir: &Path) -> Result<ProjectSummaryRaw, String> {
    let path = dir.join(PROJECT_JSON);
    if !path.exists() {
        return Err(format!("project.json no encontrado en {:?}", dir));
    }
    // Un proyecto cifrado y sin abrir no tiene resumen que leer, y la lista de
    // proyectos no puede quedarse en blanco por eso: se devuelve la tarjeta
    // mínima que el vault publica a propósito.
    if crate::crypto::sesion::esta_bloqueado(dir) {
        return Ok(resumen_bloqueado(dir));
    }
    let content = leer_archivo(dir, PROJECT_JSON)?;
    let summary: ProjectSummaryRaw = serde_json::from_slice(&content)
        .map_err(|e| format!("Error parseando summary project.json: {}", e))?;
    Ok(summary)
}

/// La tarjeta de un proyecto cifrado que todavía no se ha abierto.
///
/// Lleva lo que el `vault.json` publica en claro y nada más. El nombre sólo
/// aparece si su dueño puso una **etiqueta pública**: «Sarcoma paciente Pérez»
/// es un nombre de proyecto perfectamente normal y no puede quedar legible en
/// un portátil perdido sólo para que la lista se vea bonita.
fn resumen_bloqueado(dir: &Path) -> ProjectSummaryRaw {
    let vault = crate::crypto::vault::Vault::leer(dir).ok().flatten();
    let mtime = std::fs::metadata(dir.join(PROJECT_JSON))
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);
    ProjectSummaryRaw {
        version: CURRENT_VERSION,
        // El directorio se llama como el proyecto: no hace falta publicar el id.
        id: dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        name: vault
            .as_ref()
            .and_then(|v| v.public_label.clone())
            .unwrap_or_default(),
        project_type: String::new(),
        classes: Vec::new(),
        created: mtime,
        updated: mtime,
        images: CountedSeq(0),
        p2p_download: None,
        p2p: None,
        inference_models: CountedSeq(0),
        folder: None,
        image_format: default_image_format(),
        webp_quality_preset: default_webp_preset(),
        locked: true,
    }
}

pub fn read_project(dir: &Path) -> Result<ProjectFile, String> {
    let path = dir.join(PROJECT_JSON);
    if !path.exists() {
        return Err(format!("project.json no encontrado en {:?}", dir));
    }
    let content = leer_archivo(dir, PROJECT_JSON)?;
    let mut project: ProjectFile = serde_json::from_slice(&content)
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

    // v10 → v11: el plan de augmentación es un bloque opcional nuevo. Ausente
    // significa que no se aumenta, que es lo que hacían todos los proyectos
    // hasta ahora; encenderlo por su cuenta multiplicaría el dataset de alguien
    // sin que lo hubiera pedido. Sólo sube la versión.

    // v9 → v10: el dominio del proyecto es un campo opcional nuevo. Ausente
    // significa `general`, que es lo que era todo proyecto hasta ahora: la
    // migración no tiene nada que escribir, y marcar biomédico un proyecto por
    // su contenido sería decidir por el usuario.

    // v8 → v9: los metadatos de imagen médica son un bloque opcional nuevo. Una
    // imagen que no vino de un DICOM ni de un NIfTI no los tiene, y no hay forma
    // de deducirlos de un PNG ya convertido: lo que se perdió al convertirlo se
    // perdió. Sólo sube la versión.

    // v7 → v8: el protocolo de estudio es un bloque opcional nuevo. Nadie puede
    // rellenarlo por el usuario —un criterio de inclusión no se deduce del
    // corpus—, así que la migración no inventa nada: sólo sube la versión, y el
    // contrato de modelo nota la ausencia y la declara.

    // v6 → v7: las capas de lectura por evaluador (`readings`) son un campo nuevo
    // y opcional. Un proyecto anterior tiene una sola lectura, que ya vive en
    // `annotations` —ahora llamada capa consolidada—: no hay nada que mover, y
    // convertirla en una capa con autor sería inventar quién la hizo.

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
    // JSON compacto en runtime: project.json puede tener miles de anotaciones,
    // y `to_string_pretty` añade ~30-40% de tamaño en saltos/indentación que el
    // usuario rara vez lee. Para debug/export usar `to_string_pretty` en otro sitio.
    let content = serde_json::to_string(data)
        .map_err(|e| format!("Error serializando project.json: {}", e))?;
    escribir_archivo(dir, PROJECT_JSON, content.as_bytes())
}
