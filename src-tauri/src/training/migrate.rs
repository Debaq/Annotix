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

    // Reescribir paths internos en data.yaml y train/args.yaml de todos los jobs
    // para dejarlos consistentes con su dataset_dir actual. Idempotente.
    fixup_internal_paths(state);

    // Recuperar progreso: si quedó un last.pt/best.pt más reciente en la ubicación
    // legacy (p.ej. porque ultralytics en resume ignoró los overrides y siguió
    // escribiendo ahí), copiarlo al dataset_dir actual.
    recover_stale_weights(state, &legacy_root);
}

fn recover_stale_weights(state: &AppState, legacy_root: &Path) {
    if !legacy_root.exists() {
        return;
    }
    let projects = match state.list_projects() {
        Ok(list) => list,
        Err(_) => return,
    };
    let mut recovered = 0usize;
    for summary in projects {
        let pf = match state.read_project_file(&summary.id) {
            Ok(p) => p,
            Err(_) => continue,
        };
        for job in &pf.training_jobs {
            let dataset_dir = match &job.dataset_dir {
                Some(p) => PathBuf::from(p),
                None => continue,
            };
            let legacy_job = legacy_root.join(format!("job_{}", job.id));
            if !legacy_job.exists() {
                continue;
            }
            let new_train = dataset_dir.join("train");
            // Ultralytics normalmente usa `train/` (exist_ok=True), pero si alguna
            // vez se creó con exist_ok=False aparecerían hermanos `train2`, `train3`...
            // Escaneamos todos y nos quedamos con el más reciente por archivo.
            let mut candidate_trains: Vec<PathBuf> = Vec::new();
            if let Ok(rd) = std::fs::read_dir(&legacy_job) {
                for entry in rd.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                            if name == "train" || name.starts_with("train") {
                                candidate_trains.push(p);
                            }
                        }
                    }
                }
            }
            for fname in ["last.pt", "best.pt"] {
                let mut best_src: Option<(PathBuf, std::time::SystemTime)> = None;
                for train_dir in &candidate_trains {
                    let w = train_dir.join("weights").join(fname);
                    if !w.exists() {
                        continue;
                    }
                    let mt = match std::fs::metadata(&w).and_then(|m| m.modified()) {
                        Ok(t) => t,
                        Err(_) => continue,
                    };
                    match &best_src {
                        Some((_, cur)) if *cur >= mt => {}
                        _ => best_src = Some((w, mt)),
                    }
                }
                let Some((legacy_w, legacy_mtime)) = best_src else { continue; };
                let new_w = new_train.join("weights").join(fname);
                let new_mtime = std::fs::metadata(&new_w).and_then(|m| m.modified()).ok();
                let should_copy = match new_mtime {
                    Some(n) => legacy_mtime > n,
                    None => true,
                };
                if !should_copy {
                    continue;
                }
                if let Some(parent) = new_w.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                match std::fs::copy(&legacy_w, &new_w) {
                    Ok(_) => {
                        recovered += 1;
                        log::info!("Recuperado {} desde legacy: {:?} → {:?}", fname, legacy_w, new_w);
                    }
                    Err(e) => log::warn!("Falló copy {:?} → {:?}: {}", legacy_w, new_w, e),
                }
            }
            // Remover legacy tras recuperar, para que no vuelva a ocurrir.
            let _ = std::fs::remove_dir_all(&legacy_job);
        }
    }
    if recovered > 0 {
        log::info!("Recuperación de pesos legacy: {} archivos copiados", recovered);
    }
}

/// Reescribe rutas absolutas dentro de data.yaml y train/args.yaml de cada job
/// para que apunten al `dataset_dir` actual. Necesario tras migración o si el
/// usuario movió manualmente carpetas.
fn fixup_internal_paths(state: &AppState) {
    let projects = match state.list_projects() {
        Ok(list) => list,
        Err(_) => return,
    };
    let mut fixed = 0usize;
    for summary in projects {
        let pf = match state.read_project_file(&summary.id) {
            Ok(p) => p,
            Err(_) => continue,
        };
        for job in &pf.training_jobs {
            let dataset_dir = match &job.dataset_dir {
                Some(p) => PathBuf::from(p),
                None => continue,
            };
            if !dataset_dir.exists() {
                continue;
            }
            let dataset_dir_str = dataset_dir.to_string_lossy().replace('\\', "/");
            // Ultralytics/ficheros yaml pueden contener paths con `/` (POSIX/Mac
            // o normalizados) o con `\` (Windows nativo). Intentamos ambos.
            let markers = [
                format!("/training/job_{}", job.id),
                format!("\\training\\job_{}", job.id),
            ];

            let rewrite_all = |content: &str| -> String {
                let mut cur = content.to_string();
                for m in &markers {
                    cur = rewrite_paths(&cur, m, &dataset_dir_str);
                }
                cur
            };

            // data.yaml → reescribir "path:" absoluto
            let data_yaml = dataset_dir.join("data.yaml");
            if data_yaml.exists() {
                if let Ok(content) = std::fs::read_to_string(&data_yaml) {
                    let new_content = rewrite_all(&content);
                    if new_content != content {
                        let _ = std::fs::write(&data_yaml, new_content);
                        fixed += 1;
                    }
                }
            }

            // train/args.yaml → reescribir todas las rutas absolutas al viejo prefijo
            let args_yaml = dataset_dir.join("train").join("args.yaml");
            if args_yaml.exists() {
                if let Ok(content) = std::fs::read_to_string(&args_yaml) {
                    let new_content = rewrite_all(&content);
                    if new_content != content {
                        let _ = std::fs::write(&args_yaml, new_content);
                        fixed += 1;
                    }
                }
            }
        }
    }
    if fixed > 0 {
        log::info!("Fixup de rutas internas: {} archivos reescritos", fixed);
    }
}

/// Dentro de un texto, reemplaza cualquier prefijo absoluto
/// `<algo>/training/job_{id}` por `new_dataset_dir`. El matcher busca el marker
/// y retrocede hasta el inicio del path (separador de línea, espacio o comillas).
fn rewrite_paths(content: &str, marker: &str, new_dataset_dir: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut rest = content;
    while let Some(idx) = rest.find(marker) {
        // Retroceder para encontrar el inicio del path absoluto
        let before = &rest[..idx];
        let mut start = idx;
        for (i, ch) in before.char_indices().rev() {
            if matches!(ch, ' ' | '\t' | '\n' | '\r' | '"' | '\'' | '[' | ',') {
                start = i + ch.len_utf8();
                break;
            }
            start = i;
        }
        out.push_str(&rest[..start]);
        out.push_str(new_dataset_dir);
        // Saltar el prefijo viejo completo (hasta terminar job_{id})
        let after_marker_end = idx + marker.len();
        rest = &rest[after_marker_end..];
    }
    out.push_str(rest);
    out
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
