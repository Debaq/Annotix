//! Gestión de modelos SAM a nivel de aplicación (no por proyecto).
//!
//! Almacenamiento: `{data_dir}/sam_models/`
//!   ├ index.json        — metadatos de los modelos registrados
//!   └ {hash}.onnx       — binarios (renombrados a hash para evitar colisiones)

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const INDEX_FILE: &str = "index.json";
const SAM_MODELS_SUBDIR: &str = "sam_models";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamAppModel {
    pub id: String,
    pub name: String,
    /// "encoder" | "decoder"
    pub kind: String,
    /// Nombre del archivo dentro de `sam_models/`.
    pub file: String,
    /// Tamaño en bytes.
    pub size: u64,
    /// Timestamp ms.
    pub uploaded: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct SamModelIndex {
    #[serde(default)]
    models: Vec<SamAppModel>,
}

pub fn sam_models_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(SAM_MODELS_SUBDIR)
}

fn ensure_dir(data_dir: &Path) -> Result<PathBuf, String> {
    let dir = sam_models_dir(data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("No se pudo crear sam_models dir: {}", e))?;
    Ok(dir)
}

fn index_path(data_dir: &Path) -> PathBuf {
    sam_models_dir(data_dir).join(INDEX_FILE)
}

fn read_index(data_dir: &Path) -> Result<SamModelIndex, String> {
    let path = index_path(data_dir);
    if !path.exists() {
        return Ok(SamModelIndex::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo index sam: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Error parseando index sam: {}", e))
}

fn write_index(data_dir: &Path, idx: &SamModelIndex) -> Result<(), String> {
    let path = index_path(data_dir);
    let content = serde_json::to_string_pretty(idx)
        .map_err(|e| format!("Error serializando index sam: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Error escribiendo index sam: {}", e))
}

pub fn list_models(data_dir: &Path) -> Result<Vec<SamAppModel>, String> {
    Ok(read_index(data_dir)?.models)
}

pub fn get_model_path(data_dir: &Path, model_id: &str) -> Result<PathBuf, String> {
    let idx = read_index(data_dir)?;
    let m = idx
        .models
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("sam model {} no encontrado", model_id))?;
    Ok(sam_models_dir(data_dir).join(&m.file))
}

/// Copia un archivo .onnx al directorio app-level y registra en index.
pub fn add_model(
    data_dir: &Path,
    src_path: &Path,
    name: &str,
    kind: &str,
) -> Result<SamAppModel, String> {
    if kind != "encoder" && kind != "decoder" {
        return Err(format!("kind inválido: {} (debe ser encoder o decoder)", kind));
    }
    let dir = ensure_dir(data_dir)?;
    let id = uuid::Uuid::new_v4().to_string();
    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("onnx");
    let file_name = format!("{}.{}", id, ext);
    let dst = dir.join(&file_name);
    std::fs::copy(src_path, &dst)
        .map_err(|e| format!("Error copiando modelo SAM: {}", e))?;

    let size = std::fs::metadata(&dst).map(|m| m.len()).unwrap_or(0);
    let uploaded = chrono::Utc::now().timestamp_millis();

    let mut idx = read_index(data_dir)?;
    let entry = SamAppModel {
        id: id.clone(),
        name: name.to_string(),
        kind: kind.to_string(),
        file: file_name,
        size,
        uploaded,
    };
    idx.models.push(entry.clone());
    write_index(data_dir, &idx)?;
    Ok(entry)
}

pub fn delete_model(data_dir: &Path, model_id: &str) -> Result<(), String> {
    let mut idx = read_index(data_dir)?;
    let pos = idx
        .models
        .iter()
        .position(|m| m.id == model_id)
        .ok_or_else(|| format!("sam model {} no encontrado", model_id))?;
    let removed = idx.models.remove(pos);
    let path = sam_models_dir(data_dir).join(&removed.file);
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    write_index(data_dir, &idx)?;
    Ok(())
}
