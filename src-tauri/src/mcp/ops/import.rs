use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::store::project_file::{ImageEntry, PredictionEntry};
use crate::store::state::AppState;

use super::{exigir_confirm, meta_de, opt_str, proyecto, req_str};

const EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"];

pub(crate) fn sha256_archivo(p: &Path) -> Result<String, String> {
    let mut f = std::fs::File::open(p).map_err(|e| format!("{}: {}", p.display(), e))?;
    let mut h = Sha256::new();
    std::io::copy(&mut f, &mut h).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", h.finalize()))
}

fn rutas_de_dir(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| format!("{}: {}", dir.display(), e))?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|x| x.to_str())
                    .map_or(false, |x| EXTS.contains(&x.to_lowercase().as_str()))
        })
        .collect();
    v.sort();
    Ok(v)
}

/// CSV con una columna `path` (o la primera columna si no hay cabecera con ese
/// nombre). Las rutas relativas se resuelven contra la carpeta del CSV.
fn rutas_de_csv(csv_path: &Path) -> Result<Vec<PathBuf>, String> {
    let base = csv_path.parent().unwrap_or(Path::new("."));
    let mut rdr = csv::Reader::from_path(csv_path).map_err(|e| e.to_string())?;
    let col = rdr
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .position(|h| h.eq_ignore_ascii_case("path") || h.eq_ignore_ascii_case("file"))
        .unwrap_or(0);
    let mut out = Vec::new();
    for rec in rdr.records() {
        let rec = rec.map_err(|e| e.to_string())?;
        if let Some(c) = rec.get(col).filter(|c| !c.trim().is_empty()) {
            let p = PathBuf::from(c.trim());
            out.push(if p.is_absolute() { p } else { base.join(p) });
        }
    }
    Ok(out)
}

pub fn images(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let modo = opt_str(a, "mode").unwrap_or("copy");
    if modo != "copy" && modo != "symlink" {
        return Err("mode debe ser 'copy' o 'symlink'".into());
    }
    let rutas = match (opt_str(a, "dir"), opt_str(a, "manifest_csv")) {
        (Some(d), None) => rutas_de_dir(Path::new(d))?,
        (None, Some(c)) => rutas_de_csv(Path::new(c))?,
        _ => return Err("Indica exactamente uno de 'dir' o 'manifest_csv'".into()),
    };

    let project_dir = state.project_dir(&id)?;
    let mut meta = meta_de(state, &id)?;
    // Ids que siguen existiendo: un hash de una imagen ya borrada no cuenta.
    let vivos: std::collections::HashSet<String> =
        state.with_project(&id, |pf| pf.images.iter().map(|i| i.id.clone()).collect())?;

    let (mut nuevas, mut omitidas, mut errores) = (Vec::<(PathBuf, String)>::new(), 0usize, Vec::<String>::new());
    let mut vistos = std::collections::HashSet::new();
    for r in &rutas {
        match sha256_archivo(r) {
            Err(e) => errores.push(e),
            Ok(h) => {
                let ya = meta.hashes.get(&h).map_or(false, |i| vivos.contains(i));
                if ya || !vistos.insert(h.clone()) {
                    omitidas += 1;
                } else {
                    nuevas.push((r.clone(), h));
                }
            }
        }
    }

    let importadas = nuevas.len();
    if importadas > 0 {
        let ids = if modo == "copy" {
            let paths: Vec<String> = nuevas.iter().map(|(p, _)| p.to_string_lossy().into()).collect();
            state.upload_images_with_progress(&id, &paths, |_, _, _| {})?
        } else {
            enlazar(state, &id, &project_dir, &nuevas)?
        };
        for ((_, h), iid) in nuevas.iter().zip(ids) {
            meta.hashes.insert(h.clone(), iid);
        }
        meta.save(&project_dir)?;
    }

    state.audit(
        &id,
        crate::audit::events::DATA_IMPORTED,
        json!({"file": opt_str(a, "dir").or(opt_str(a, "manifest_csv")), "n_images": importadas,
               "n_annotations": 0, "mode": modo}),
    );
    Ok(json!({"project_id": id, "imported": importadas, "skipped_duplicates": omitidas,
              "errors": errores, "mode": modo}))
}

/// Modo symlink: el archivo del proyecto es un enlace al original, sin copiar ni
/// re-codificar. Es lo que permite 982 imágenes sin duplicar disco.
fn enlazar(
    state: &AppState,
    id: &str,
    _dir: &Path,
    nuevas: &[(PathBuf, String)],
) -> Result<Vec<String>, String> {
    let images_dir = state.project_images_dir(id)?;
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    let now = crate::store::images::js_timestamp_pub();
    let mut entradas = Vec::new();
    for (origen, _) in nuevas {
        let abs = std::fs::canonicalize(origen).map_err(|e| format!("{}: {}", origen.display(), e))?;
        let nombre = abs.file_name().and_then(|n| n.to_str()).unwrap_or("img").to_string();
        let iid = uuid::Uuid::new_v4().to_string();
        let file = format!("{}_{}", iid, nombre);
        #[cfg(unix)]
        std::os::unix::fs::symlink(&abs, images_dir.join(&file)).map_err(|e| e.to_string())?;
        #[cfg(not(unix))]
        return Err("mode=symlink sólo está disponible en Unix; usa mode=copy".into());
        let (w, h) = image::image_dimensions(&abs).map_err(|e| format!("{}: {}", nombre, e))?;
        entradas.push(ImageEntry {
            id: iid,
            name: nombre,
            file,
            subject_id: None,
            width: w,
            height: h,
            uploaded: now,
            annotated: None,
            status: "pending".into(),
            annotations: vec![],
            video_id: None,
            frame_index: None,
            is_background: false,
            locked_by: None,
            lock_expires: None,
            download_status: None,
            predictions: vec![],
            rejected: vec![],
            readings: vec![],
            medical: None,
        });
    }
    let ids = entradas.iter().map(|e| e.id.clone()).collect();
    state.commit_image_entries(id, entradas)?;
    Ok(ids)
}

pub fn delete_images(state: &AppState, a: &Value) -> Result<Value, String> {
    exigir_confirm(a, "Borrar imágenes")?;
    let id = proyecto(state, a)?;
    let ids: Vec<String> = a
        .get("image_ids")
        .and_then(|v| v.as_array())
        .ok_or("Falta 'image_ids'")?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    let existentes: std::collections::HashSet<String> =
        state.with_project(&id, |pf| pf.images.iter().map(|i| i.id.clone()).collect())?;
    let mut n = 0;
    for i in &ids {
        if existentes.contains(i) {
            state.delete_image(&id, i)?;
            n += 1;
        }
    }
    Ok(json!({"project_id": id, "deleted": n, "not_found": ids.len() - n}))
}

/// Importa cajas COCO como PRE-ETIQUETAS (`predictions`), no como anotaciones.
///
/// Quedan marcadas con su origen y versión de modelo, con `status = "prelabel"`, y
/// no cuentan como lectura de nadie: `annotations` y `readings` no se tocan.
/// Idempotente: una pre-etiqueta idéntica (mismo modelo, clase y caja) no se repite.
pub fn annotations(state: &AppState, a: &Value) -> Result<Value, String> {
    let id = proyecto(state, a)?;
    let origen = req_str(a, "origin")?;
    let version = req_str(a, "model_version")?;
    let status = opt_str(a, "status").unwrap_or("prelabel");
    if status != "prelabel" {
        return Err("Sólo se admite status='prelabel': el agente no crea anotaciones de lector".into());
    }
    let modelo = if version.contains(origen) { version.to_string() } else { format!("{}-{}", origen, version) };
    let txt = std::fs::read_to_string(req_str(a, "coco_json")?).map_err(|e| e.to_string())?;
    let coco: Value = serde_json::from_str(&txt).map_err(|e| format!("COCO inválido: {}", e))?;

    let nombre_de: std::collections::HashMap<i64, String> = coco["images"]
        .as_array()
        .ok_or("COCO sin 'images'")?
        .iter()
        .filter_map(|i| Some((i["id"].as_i64()?, i["file_name"].as_str()?.to_string())))
        .collect();
    let anns = coco["annotations"].as_array().ok_or("COCO sin 'annotations'")?;

    let (mut nuevas, mut repetidas, mut sin_imagen, mut sin_clase) = (0, 0, 0, 0);
    state.with_project_mut(&id, |pf| {
        let clases: std::collections::HashMap<i64, String> =
            pf.classes.iter().map(|c| (c.id, c.name.clone())).collect();
        for an in anns {
            let (Some(iid), Some(cat), Some(bb)) =
                (an["image_id"].as_i64(), an["category_id"].as_i64(), an["bbox"].as_array())
            else { continue };
            if bb.len() < 4 { continue; }
            let Some(cname) = clases.get(&cat) else { sin_clase += 1; continue };
            let Some(fname) = nombre_de.get(&iid) else { sin_imagen += 1; continue };
            let base = Path::new(fname).file_name().and_then(|n| n.to_str()).unwrap_or(fname);
            let Some(img) = pf.images.iter_mut().find(|i| i.name == base || i.name == *fname) else {
                sin_imagen += 1;
                continue;
            };
            let data = json!({"x": bb[0], "y": bb[1], "width": bb[2], "height": bb[3]});
            if img.predictions.iter().any(|p| p.model_id == modelo && p.class_id as i64 == cat && p.data == data) {
                repetidas += 1;
                continue;
            }
            img.predictions.push(PredictionEntry {
                id: uuid::Uuid::new_v4().to_string(),
                model_id: modelo.clone(),
                class_id: cat as usize,
                class_name: cname.clone(),
                confidence: an["score"].as_f64().unwrap_or(1.0),
                data,
                status: "prelabel".into(),
            });
            nuevas += 1;
        }
    })?;

    state.audit(
        &id,
        crate::audit::events::DATA_IMPORTED,
        json!({"file": a["coco_json"], "n_images": 0, "n_annotations": nuevas,
               "kind": "prelabels", "origin": modelo}),
    );
    Ok(json!({"project_id": id, "imported": nuevas, "skipped_duplicates": repetidas,
              "unmatched_images": sin_imagen, "unknown_class": sin_clase, "origin": modelo,
              "status": "prelabel"}))
}
