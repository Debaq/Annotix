use std::fmt;
use std::path::Path;

use serde::de::{Deserializer, IgnoredAny, SeqAccess, Visitor};
use serde::Deserialize;

use super::project_file::{ClassDef, P2pDownloadStatus, ProjectFile};

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

fn default_image_format() -> String { "jpg".to_string() }
fn default_webp_preset() -> String { "high".to_string() }

pub fn read_project_summary(dir: &Path) -> Result<ProjectSummaryRaw, String> {
    let path = dir.join("project.json");
    if !path.exists() {
        return Err(format!("project.json no encontrado en {:?}", dir));
    }
    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Error abriendo project.json: {}", e))?;
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
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo project.json: {}", e))?;
    let project: ProjectFile = serde_json::from_str(&content)
        .map_err(|e| format!("Error parseando project.json: {}", e))?;
    Ok(project)
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
