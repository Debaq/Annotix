//! Estado propio del MCP, en `mcp.json` dentro del directorio del proyecto.
//!
//! Va aparte de `project.json` a propósito: el formato del proyecto no tiene
//! sesiones locales ni el hash de origen de las imágenes, y añadirlos allí obligaría
//! a tocar todo lo que construye un `ImageEntry` o un `ProjectFile`. El resto de la
//! app ignora este archivo; el MCP lo trata como una caché reconstruible salvo por
//! las reglas y la asignación, que sí son declaración del usuario.

use std::collections::BTreeMap;
use std::path::Path;

use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};

pub const FILE_NAME: &str = "mcp.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpMeta {
    /// Lecturas independientes que se piden de cada imagen (1 = lectura única).
    #[serde(default = "uno")]
    pub replication: u32,
    /// Lectura ciega: nadie ve las capas de los demás hasta resolver.
    #[serde(default)]
    pub blind: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<LocalSession>,
    /// sha256 del archivo original → id de la imagen importada. Es lo que hace
    /// idempotente el import: el archivo del proyecto está re-codificado y su hash
    /// ya no es el del original.
    #[serde(default)]
    pub hashes: BTreeMap<String, String>,
    /// Procedencia de las pre-etiquetas importadas: modelo, versión, sha256 y archivos.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub prelabel_sources: Vec<serde_json::Value>,
}

fn uno() -> u32 {
    1
}

impl Default for McpMeta {
    fn default() -> Self {
        Self {
            replication: 1,
            blind: false,
            session: None,
            hashes: BTreeMap::new(),
            prelabel_sources: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSession {
    pub readers: Vec<String>,
    pub seed: u64,
    pub created: String,
    /// Cerrada: no admite más reparto. No resuelve nada ni levanta el cegado.
    #[serde(default)]
    pub closed: bool,
    /// id de imagen → lectores a quienes se asigna.
    pub assignments: BTreeMap<String, Vec<String>>,
}

impl McpMeta {
    pub fn load(project_dir: &Path) -> Result<Self, String> {
        let path = project_dir.join(FILE_NAME);
        if !path.exists() {
            return Ok(Self::default());
        }
        let txt = std::fs::read_to_string(&path).map_err(|e| format!("{}: {}", FILE_NAME, e))?;
        serde_json::from_str(&txt).map_err(|e| format!("{} ilegible: {}", FILE_NAME, e))
    }

    /// Escritura atómica (.tmp → rename), como `project.json`.
    pub fn save(&self, project_dir: &Path) -> Result<(), String> {
        let path = project_dir.join(FILE_NAME);
        let tmp = project_dir.join(format!("{}.tmp", FILE_NAME));
        let txt = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, txt).map_err(|e| format!("{}: {}", FILE_NAME, e))?;
        std::fs::rename(&tmp, &path).map_err(|e| format!("{}: {}", FILE_NAME, e))
    }

    pub fn replication(&self) -> usize {
        self.replication.max(1) as usize
    }
}

/// Reparte imágenes entre lectores con una semilla.
///
/// Reproducible: mismas imágenes, mismos lectores, misma semilla → misma
/// asignación, sin depender del orden en que llegaron. Cada imagen va a
/// `replication` lectores distintos, siempre a los menos cargados (el desempate lo
/// decide la semilla), así que la carga queda equilibrada.
pub fn asignar(
    image_ids: &[String],
    readers: &[String],
    replication: usize,
    seed: u64,
) -> Result<BTreeMap<String, Vec<String>>, String> {
    if readers.is_empty() {
        return Err("Hacen falta lectores".into());
    }
    if replication > readers.len() {
        return Err(format!(
            "replication={} pide más lectores de los que hay ({})",
            replication,
            readers.len()
        ));
    }
    let mut ids: Vec<&String> = image_ids.iter().collect();
    ids.sort();
    let mut rng = StdRng::seed_from_u64(seed);
    let mut carga = vec![0usize; readers.len()];
    let mut out = BTreeMap::new();
    for id in ids {
        let mut orden: Vec<usize> = (0..readers.len()).collect();
        orden.shuffle(&mut rng);
        orden.sort_by_key(|&i| carga[i]);
        let elegidos: Vec<String> = orden
            .into_iter()
            .take(replication)
            .map(|i| {
                carga[i] += 1;
                readers[i].clone()
            })
            .collect();
        let _ = rng.gen::<u8>(); // avanza el flujo aunque el reparto no lo necesite
        out.insert(id.clone(), elegidos);
    }
    Ok(out)
}
