//! Escaneo y restauración de una carpeta de trabajo.
//!
//! Cuando se instala la app de cero (sin `config.json`) pero el usuario ya
//! tiene una carpeta de trabajo de una instalación anterior, al elegirla
//! escaneamos su contenido y reparamos lo que impide que los proyectos
//! aparezcan en el listado:
//!
//! - carpeta anidada más profunda que el primer nivel → se mueve a la raíz,
//! - `project.json` con `id` distinto al nombre de la carpeta → se corrige el
//!   `id` (las rutas se derivan del nombre de la carpeta),
//! - `project.json` ausente pero con `project.json.tmp` (corte de luz durante
//!   una escritura atómica) → se recupera el temporal,
//! - carpeta con `images/` pero sin `project.json` → se reconstruye un
//!   `project.json` mínimo a partir de los archivos (sin anotaciones).

use std::path::{Path, PathBuf};

use serde::Serialize;

use super::io;
use super::project_file::{ImageEntry, ProjectFile, CURRENT_VERSION};
use super::state::AppState;

/// Subcarpetas internas de un proyecto: nunca son proyectos en sí mismas.
const SKIP_DIRS: &[&str] = &[
    "images",
    "thumbnails",
    "videos",
    "models",
    "timeseries",
    "audio",
    "tabular",
    "datasets",
    "dataset",
    "runs",
    "training",
    "exports",
    "frames",
    "node_modules",
    "venv",
    "__pycache__",
];

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"];

/// Profundidad máxima de búsqueda por debajo de la carpeta elegida.
const MAX_DEPTH: usize = 3;

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedProject {
    /// Ruta absoluta de la carpeta del proyecto.
    pub path: String,
    pub dir_name: String,
    /// `id` leído de `project.json` (None si no se pudo leer).
    pub id: Option<String>,
    pub name: String,
    pub project_type: String,
    pub image_count: usize,
    /// Archivos de imagen realmente presentes en `images/`.
    pub image_files: usize,
    pub video_files: usize,
    /// "ok" | "idMismatch" | "recoverable" | "corrupt" | "orphan"
    pub status: String,
    /// Niveles por debajo de la carpeta elegida (1 = hija directa).
    pub depth: usize,
    /// La restauración tendrá que mover la carpeta a la raíz.
    pub needs_move: bool,
    /// Ya visible en el listado actual (raíz + id coincidente).
    pub already_ok: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub root: String,
    pub projects: Vec<ScannedProject>,
    /// Cuántos ya se listarían sin tocar nada.
    pub ok_count: usize,
    /// Cuántos necesitan reparación.
    pub repairable_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub path: String,
    pub name: String,
    pub id: Option<String>,
    /// "restored" | "skipped" | "failed"
    pub result: String,
    /// Acciones aplicadas: "moved", "idFixed", "tmpRecovered", "rebuilt".
    pub actions: Vec<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub restored: usize,
    pub failed: usize,
    pub outcomes: Vec<RestoreOutcome>,
}

// ─── Escaneo ────────────────────────────────────────────────────────────────

fn count_files_with_exts(dir: &Path, exts: Option<&[&str]>) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter(|e| match exts {
            None => true,
            Some(exts) => e
                .path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| exts.contains(&x.to_lowercase().as_str()))
                .unwrap_or(false),
        })
        .count()
}

fn classify(dir: &Path, root: &Path, depth: usize) -> Option<ScannedProject> {
    let dir_name = dir.file_name()?.to_string_lossy().to_string();
    let project_json = dir.join("project.json");
    let tmp_json = dir.join("project.json.tmp");
    let image_files = count_files_with_exts(&dir.join("images"), Some(IMAGE_EXTS));
    let video_files = count_files_with_exts(&dir.join("videos"), None);

    let (id, name, project_type, image_count, status) = if project_json.exists() {
        match io::read_project_summary(dir) {
            Ok(s) => {
                let status = if s.id == dir_name { "ok" } else { "idMismatch" };
                (
                    Some(s.id),
                    s.name,
                    s.project_type,
                    s.images.0,
                    status.to_string(),
                )
            }
            Err(_) if tmp_json.exists() => match read_summary_from_tmp(&tmp_json) {
                Some(s) => (
                    Some(s.id),
                    s.name,
                    s.project_type,
                    s.images.0,
                    "recoverable".to_string(),
                ),
                None => (
                    None,
                    dir_name.clone(),
                    "detection".to_string(),
                    0,
                    "corrupt".to_string(),
                ),
            },
            Err(_) => (
                None,
                dir_name.clone(),
                "detection".to_string(),
                0,
                "corrupt".to_string(),
            ),
        }
    } else if tmp_json.exists() {
        match read_summary_from_tmp(&tmp_json) {
            Some(s) => (
                Some(s.id),
                s.name,
                s.project_type,
                s.images.0,
                "recoverable".to_string(),
            ),
            None if image_files > 0 => (
                None,
                dir_name.clone(),
                "detection".to_string(),
                0,
                "orphan".to_string(),
            ),
            None => return None,
        }
    } else if image_files > 0 || video_files > 0 {
        (
            None,
            dir_name.clone(),
            "detection".to_string(),
            0,
            "orphan".to_string(),
        )
    } else {
        return None;
    };

    let at_root = dir.parent() == Some(root);
    let needs_move = !at_root;
    let already_ok = status == "ok" && at_root;

    Some(ScannedProject {
        path: dir.to_string_lossy().to_string(),
        dir_name,
        id,
        name,
        project_type,
        image_count,
        image_files,
        video_files,
        status,
        depth,
        needs_move,
        already_ok,
    })
}

fn read_summary_from_tmp(tmp: &Path) -> Option<io::ProjectSummaryRaw> {
    let content = std::fs::read_to_string(tmp).ok()?;
    serde_json::from_str(&content).ok()
}

fn walk(dir: &Path, root: &Path, depth: usize, out: &mut Vec<ScannedProject>) {
    if depth > MAX_DEPTH {
        return;
    }

    if depth > 0 {
        if let Some(found) = classify(dir, root, depth) {
            out.push(found);
            // Una carpeta de proyecto no contiene otros proyectos.
            return;
        }
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        walk(&path, root, depth + 1, out);
    }
}

/// Escanea `root` buscando carpetas de proyecto recuperables.
pub fn scan_workspace(root: &Path) -> Result<ScanReport, String> {
    if !root.is_dir() {
        return Err(format!("No es un directorio: {}", root.display()));
    }
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());

    let mut projects = Vec::new();
    walk(&root, &root, 0, &mut projects);
    projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let ok_count = projects.iter().filter(|p| p.already_ok).count();
    let repairable_count = projects.len() - ok_count;

    Ok(ScanReport {
        root: root.to_string_lossy().to_string(),
        projects,
        ok_count,
        repairable_count,
    })
}

// ─── Restauración ───────────────────────────────────────────────────────────

/// Reconstruye un `project.json` mínimo a partir de los archivos en disco.
/// Las anotaciones no se pueden recuperar: solo vuelven las imágenes.
fn rebuild_project_file(dir: &Path, id: &str) -> Result<ProjectFile, String> {
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| id.to_string());

    let images_dir = dir.join("images");
    let mut images = Vec::new();
    let mut webp = 0usize;
    let mut other = 0usize;
    let now = js_timestamp();

    if images_dir.is_dir() {
        let mut files: Vec<PathBuf> = std::fs::read_dir(&images_dir)
            .map_err(|e| format!("Error leyendo images/: {}", e))?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.extension()
                        .and_then(|x| x.to_str())
                        .map(|x| IMAGE_EXTS.contains(&x.to_lowercase().as_str()))
                        .unwrap_or(false)
            })
            .collect();
        files.sort();

        for path in files {
            let file_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let Ok((width, height)) = image::image_dimensions(&path) else {
                log::warn!("Imagen ilegible al reconstruir {:?}: {}", dir, file_name);
                continue;
            };

            // Los archivos se guardan como "{uuid}_{nombre}": si lleva ese
            // prefijo reusamos el id original para no romper referencias.
            let (img_id, display_name) = split_uuid_prefix(&file_name);

            if path
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.to_lowercase())
                == Some("webp".to_string())
            {
                webp += 1;
            } else {
                other += 1;
            }

            images.push(ImageEntry {
                subject_id: None,
                id: img_id,
                name: display_name,
                file: file_name,
                width,
                height,
                uploaded: now,
                annotated: None,
                status: "pending".to_string(),
                annotations: vec![],
                video_id: None,
                frame_index: None,
                is_background: false,
                locked_by: None,
                lock_expires: None,
                download_status: None,
                predictions: vec![],
            rejected: vec![],
            });
        }
    }

    Ok(ProjectFile {
        version: CURRENT_VERSION,
        id: id.to_string(),
        name,
        project_type: "detection".to_string(),
        classes: vec![],
        created: now,
        updated: now,
        images,
        timeseries: vec![],
        videos: vec![],
        training_jobs: vec![],
        tabular_data: vec![],
        audio: vec![],
        p2p: None,
        p2p_download: None,
        inference_models: vec![],
        folder: None,
        tts_sentences: vec![],
        image_format: if webp > other {
            "webp".to_string()
        } else {
            "jpg".to_string()
        },
        webp_quality_preset: "high".to_string(),
        split_policy: None,
    })
}

/// Separa "{uuid}_{nombre}" en (uuid, nombre). Si no hay prefijo válido,
/// genera un id nuevo y devuelve el nombre completo.
fn split_uuid_prefix(file_name: &str) -> (String, String) {
    if let Some((maybe_uuid, rest)) = file_name.split_once('_') {
        if uuid::Uuid::parse_str(maybe_uuid).is_ok() && !rest.is_empty() {
            return (maybe_uuid.to_string(), rest.to_string());
        }
    }
    (uuid::Uuid::new_v4().to_string(), file_name.to_string())
}

/// Nombre de carpeta libre dentro de `root`, partiendo de `preferred`.
fn free_dir_name(root: &Path, preferred: &str) -> String {
    if !root.join(preferred).exists() {
        return preferred.to_string();
    }
    uuid::Uuid::new_v4().to_string()
}

fn restore_one(root: &Path, dir: &Path) -> Result<(String, Option<String>, Vec<String>), String> {
    let mut actions: Vec<String> = Vec::new();

    // Nunca salir de la carpeta de trabajo.
    let canon = dir
        .canonicalize()
        .map_err(|e| format!("Ruta inválida {}: {}", dir.display(), e))?;
    if !canon.starts_with(root) || canon == root {
        return Err("La carpeta está fuera de la carpeta de trabajo".to_string());
    }

    // 1. Recuperar escritura atómica interrumpida.
    let project_json = canon.join("project.json");
    let tmp_json = canon.join("project.json.tmp");
    if !project_json.exists() && tmp_json.exists() {
        std::fs::rename(&tmp_json, &project_json)
            .map_err(|e| format!("No se pudo recuperar project.json.tmp: {}", e))?;
        actions.push("tmpRecovered".to_string());
    }

    // 2. Mover a la raíz si está anidada (renombrar dentro del mismo volumen).
    let mut current = canon.clone();
    if current.parent() != Some(root) {
        let dir_name = current
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .ok_or("Nombre de carpeta inválido")?;
        let target = root.join(free_dir_name(root, &dir_name));
        std::fs::rename(&current, &target)
            .map_err(|e| format!("No se pudo mover a la raíz: {}", e))?;
        current = target;
        actions.push("moved".to_string());
    }

    let dir_name = current
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or("Nombre de carpeta inválido")?;

    // 3. Reconstruir si no hay project.json legible.
    let project_json = current.join("project.json");
    let mut pf = if project_json.exists() {
        match io::read_project(&current) {
            Ok(pf) => pf,
            Err(e) => {
                // JSON ilegible: respaldarlo y reconstruir desde los archivos.
                let backup = current.join("project.json.corrupt");
                let _ = std::fs::rename(&project_json, &backup);
                log::warn!(
                    "project.json corrupto en {:?} ({}), reconstruyendo",
                    current,
                    e
                );
                actions.push("rebuilt".to_string());
                rebuild_project_file(&current, &dir_name)?
            }
        }
    } else {
        actions.push("rebuilt".to_string());
        rebuild_project_file(&current, &dir_name)?
    };

    // 4. El id tiene que ser el nombre de la carpeta: las rutas se derivan de él.
    if pf.id != dir_name {
        pf.id = dir_name.clone();
        if !actions.contains(&"rebuilt".to_string()) {
            actions.push("idFixed".to_string());
        }
    }

    // 5. Asegurar subcarpetas estándar y persistir.
    for sub in ["images", "thumbnails", "videos"] {
        let _ = std::fs::create_dir_all(current.join(sub));
    }
    io::write_project(&current, &pf)?;

    Ok((pf.name.clone(), Some(pf.id.clone()), actions))
}

impl AppState {
    /// Repara y deja visibles los proyectos indicados (rutas absolutas dentro
    /// de `root`). `root` puede no ser todavía el `projects_dir` configurado.
    pub fn restore_workspace(
        &self,
        root: &Path,
        paths: &[String],
    ) -> Result<RestoreReport, String> {
        let root = root
            .canonicalize()
            .map_err(|e| format!("Carpeta de trabajo inválida: {}", e))?;

        let mut outcomes = Vec::new();
        let mut restored = 0usize;
        let mut failed = 0usize;

        for path in paths {
            let dir = PathBuf::from(path);
            let fallback_name = dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());

            match restore_one(&root, &dir) {
                Ok((name, id, actions)) => {
                    restored += 1;
                    outcomes.push(RestoreOutcome {
                        path: path.clone(),
                        name,
                        id,
                        result: "restored".to_string(),
                        actions,
                        message: None,
                    });
                }
                Err(e) => {
                    failed += 1;
                    log::warn!("No se pudo restaurar {}: {}", path, e);
                    outcomes.push(RestoreOutcome {
                        path: path.clone(),
                        name: fallback_name,
                        id: None,
                        result: "failed".to_string(),
                        actions: vec![],
                        message: Some(e),
                    });
                }
            }
        }

        // Los caches quedaron obsoletos tras mover carpetas o cambiar ids.
        self.clear_caches();

        Ok(RestoreReport {
            restored,
            failed,
            outcomes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_pf(dir: &Path, id: &str, name: &str) {
        std::fs::create_dir_all(dir.join("images")).unwrap();
        let pf = serde_json::json!({
            "version": CURRENT_VERSION, "id": id, "name": name, "type": "detection",
            "classes": [], "created": 1.0, "updated": 2.0, "images": []
        });
        std::fs::write(dir.join("project.json"), pf.to_string()).unwrap();
    }

    fn tmp_root(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("annotix_rec_{}_{}", tag, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn detecta_ok_mismatch_anidado_y_huerfano() {
        let root = tmp_root("scan");
        write_pf(&root.join("aaa"), "aaa", "Bien");
        write_pf(&root.join("bbb"), "otro-id", "Id distinto");
        write_pf(&root.join("sub/ccc"), "ccc", "Anidado");
        std::fs::create_dir_all(root.join("ddd/images")).unwrap();
        std::fs::write(root.join("ddd/images/foo.jpg"), b"x").unwrap();

        let report = scan_workspace(&root).unwrap();
        let by_name = |n: &str| {
            report
                .projects
                .iter()
                .find(|p| p.name == n)
                .unwrap()
                .clone()
        };

        assert_eq!(report.projects.len(), 4);
        assert!(by_name("Bien").already_ok);
        assert_eq!(by_name("Id distinto").status, "idMismatch");
        let anidado = by_name("Anidado");
        assert!(anidado.needs_move && anidado.depth == 2);
        assert_eq!(by_name("ddd").status, "orphan");
        assert_eq!(report.ok_count, 1);
        assert_eq!(report.repairable_count, 3);

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn restaura_mismatch_anidado_y_tmp() {
        let root = tmp_root("restore");
        write_pf(&root.join("bbb"), "otro-id", "Id distinto");
        write_pf(&root.join("sub/ccc"), "ccc", "Anidado");

        // Escritura atómica interrumpida: solo queda el .tmp
        let interrupted = root.join("eee");
        write_pf(&interrupted, "eee", "Interrumpido");
        std::fs::rename(
            interrupted.join("project.json"),
            interrupted.join("project.json.tmp"),
        )
        .unwrap();

        let paths: Vec<String> = scan_workspace(&root)
            .unwrap()
            .projects
            .iter()
            .map(|p| p.path.clone())
            .collect();

        let canon = root.canonicalize().unwrap();
        for p in &paths {
            restore_one(&canon, Path::new(p)).unwrap();
        }

        assert_eq!(io::read_project(&canon.join("bbb")).unwrap().id, "bbb");
        assert!(canon.join("ccc/project.json").exists());
        assert_eq!(io::read_project(&canon.join("ccc")).unwrap().id, "ccc");
        assert!(canon.join("eee/project.json").exists());

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn reconstruye_huerfano_desde_imagenes() {
        let root = tmp_root("orphan");
        let dir = root.join("proyecto-viejo");
        std::fs::create_dir_all(dir.join("images")).unwrap();

        let img = image::RgbImage::new(7, 5);
        let id = uuid::Uuid::new_v4().to_string();
        img.save(dir.join("images").join(format!("{}_foto.png", id)))
            .unwrap();

        let canon = root.canonicalize().unwrap();
        restore_one(&canon, &dir).unwrap();

        let pf = io::read_project(&canon.join("proyecto-viejo")).unwrap();
        assert_eq!(pf.id, "proyecto-viejo");
        assert_eq!(pf.images.len(), 1);
        assert_eq!(pf.images[0].id, id);
        assert_eq!(pf.images[0].name, "foto.png");
        assert_eq!((pf.images[0].width, pf.images[0].height), (7, 5));

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rechaza_rutas_fuera_de_la_raiz() {
        let root = tmp_root("escape");
        let outside = tmp_root("escape_out");
        write_pf(&outside.join("xxx"), "xxx", "Fuera");

        let canon = root.canonicalize().unwrap();
        assert!(restore_one(&canon, &outside.join("xxx")).is_err());

        std::fs::remove_dir_all(&root).ok();
        std::fs::remove_dir_all(&outside).ok();
    }
}
