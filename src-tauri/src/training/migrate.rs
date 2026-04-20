use std::path::{Path, PathBuf};

use crate::store::AppState;

/// Migra entrenamientos legacy desde `{data_dir}/training/job_*` a
/// `{project_dir}/training/job_*` y actualiza las rutas guardadas en project.json.
///
/// Se ejecuta una vez al arrancar. Seguro re-ejecutar: detecta qué ya se movió.
pub fn migrate_legacy_training_dirs(state: &AppState) {
    let legacy_root = state.data_dir.join("training");
    let projects = match state.list_projects() {
        Ok(list) => list,
        Err(e) => {
            log::warn!("migrate_legacy_training_dirs: no se pudo listar proyectos: {}", e);
            return;
        }
    };

    let mut moved = 0usize;
    let mut rewired = 0usize;

    for summary in projects {
        let project_id = summary.id.clone();
        let project_dir = match state.project_dir(&project_id) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let project_training_root = project_dir.join("training");

        // Leer project.json
        let pf = match state.read_project_file(&project_id) {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Recolectar cambios
        let mut remaps: Vec<(String, PathBuf, PathBuf)> = Vec::new(); // (job_id, old_dir, new_dir)

        for job in &pf.training_jobs {
            let old_dataset_dir = match &job.dataset_dir {
                Some(p) => PathBuf::from(p),
                None => continue,
            };
            // Saltar si ya está dentro del proyecto
            if old_dataset_dir.starts_with(&project_training_root) {
                continue;
            }
            // Saltar si no es el path legacy esperado
            if !old_dataset_dir.starts_with(&legacy_root) {
                continue;
            }
            let new_dataset_dir = project_training_root.join(format!("job_{}", job.id));
            remaps.push((job.id.clone(), old_dataset_dir, new_dataset_dir));
        }

        if remaps.is_empty() {
            continue;
        }

        // Asegurar root
        if let Err(e) = std::fs::create_dir_all(&project_training_root) {
            log::warn!("No se pudo crear {:?}: {}", project_training_root, e);
            continue;
        }

        // Mover directorios
        for (job_id, old_dir, new_dir) in &remaps {
            if !old_dir.exists() {
                // El job existe pero la carpeta ya no → nada que mover, solo reescribir paths
                continue;
            }
            if new_dir.exists() {
                log::warn!(
                    "Destino ya existe, omitiendo move ({}): {:?} → {:?}",
                    job_id, old_dir, new_dir
                );
                continue;
            }
            match std::fs::rename(old_dir, new_dir) {
                Ok(_) => {
                    moved += 1;
                    log::info!("Migrado training: {:?} → {:?}", old_dir, new_dir);
                }
                Err(e) => {
                    // Cross-device o permisos → fallback a copy recursive + remove
                    log::warn!("rename falló ({}): {}. Intentando copy.", job_id, e);
                    if let Err(ce) = copy_dir_recursive(old_dir, new_dir) {
                        log::error!("copy falló ({}): {}", job_id, ce);
                        continue;
                    }
                    let _ = std::fs::remove_dir_all(old_dir);
                    moved += 1;
                }
            }
        }

        // Actualizar project.json con nuevas rutas (prefix replace)
        let remaps_str: Vec<(String, String)> = remaps
            .iter()
            .map(|(_, o, n)| (
                o.to_string_lossy().to_string(),
                n.to_string_lossy().to_string(),
            ))
            .collect();

        let _ = state.with_project_mut(&project_id, |pf| {
            for job in pf.training_jobs.iter_mut() {
                rewired += rewrite_paths_in_job(job, &remaps_str);
            }
        });
        let _ = state.flush_project(&project_id);
    }

    // Limpiar legacy_root si quedó vacío
    if legacy_root.exists() {
        if let Ok(mut entries) = std::fs::read_dir(&legacy_root) {
            if entries.next().is_none() {
                let _ = std::fs::remove_dir(&legacy_root);
            }
        }
    }

    if moved > 0 || rewired > 0 {
        log::info!(
            "Migración training legacy: {} carpetas movidas, {} rutas reescritas",
            moved, rewired
        );
    }

    // Marcar como 'failed' todos los jobs con status='training' al arrancar:
    // si la app reinicia, el proceso Python anterior está muerto sí o sí.
    mark_orphan_training_jobs(state);
}

fn mark_orphan_training_jobs(state: &AppState) {
    let projects = match state.list_projects() {
        Ok(list) => list,
        Err(_) => return,
    };
    for summary in projects {
        let project_id = summary.id;
        let pf = match state.read_project_file(&project_id) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let has_orphan = pf.training_jobs.iter().any(|j| j.status == "training");
        if !has_orphan {
            continue;
        }
        let _ = state.with_project_mut(&project_id, |pf| {
            for job in pf.training_jobs.iter_mut() {
                if job.status == "training" {
                    job.status = "failed".to_string();
                }
            }
        });
        let _ = state.flush_project(&project_id);
    }
}

fn rewrite_paths_in_job(
    job: &mut crate::store::project_file::TrainingJobEntry,
    remaps: &[(String, String)],
) -> usize {
    let mut changes = 0;
    let apply = |s: &mut Option<String>| -> bool {
        if let Some(cur) = s.as_ref() {
            for (from, to) in remaps {
                if cur.starts_with(from) {
                    let new_val = cur.replacen(from, to, 1);
                    *s = Some(new_val);
                    return true;
                }
            }
        }
        false
    };
    if apply(&mut job.dataset_dir) { changes += 1; }
    if apply(&mut job.result_dir) { changes += 1; }
    if apply(&mut job.best_model_path) { changes += 1; }
    changes
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}
