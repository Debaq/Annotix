use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use image::{DynamicImage, ImageFormat};
use pdfium_render::prelude::*;
use tauri::{AppHandle, Emitter, Manager};

use crate::store::AppState;

static PDFIUM_LIB_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Resuelve ruta a la librería pdfium bundleada.
/// Orden:
///   1. env var PDFIUM_DYNAMIC_LIB_PATH (override)
///   2. resource_dir/pdfium/<lib>
///   3. exe_dir/pdfium/<lib>
///   4. None → bind_to_system_library
fn resolve_pdfium_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("PDFIUM_DYNAMIC_LIB_PATH") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }

    let lib_name = Pdfium::pdfium_platform_library_name();

    if let Ok(res_dir) = app.path().resource_dir() {
        for sub in ["pdfium", ""] {
            let candidate = if sub.is_empty() {
                res_dir.join(&lib_name)
            } else {
                res_dir.join(sub).join(&lib_name)
            };
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            for sub in ["pdfium", ""] {
                let candidate = if sub.is_empty() {
                    parent.join(&lib_name)
                } else {
                    parent.join(sub).join(&lib_name)
                };
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

fn build_pdfium(app: &AppHandle) -> Result<Pdfium, String> {
    let path_opt = PDFIUM_LIB_PATH
        .get_or_init(|| resolve_pdfium_path(app))
        .clone();

    let bindings = match path_opt.as_ref() {
        Some(lib_path) => Pdfium::bind_to_library(lib_path)
            .map_err(|e| format!("No se pudo cargar pdfium desde '{}': {}", lib_path.display(), e))?,
        None => Pdfium::bind_to_system_library()
            .map_err(|e| format!(
                "pdfium no encontrado. Instalá libpdfium en el sistema o coloca la lib en resources/pdfium/. Error: {}",
                e
            ))?,
    };

    Ok(Pdfium::new(bindings))
}

/// Extrae páginas de un PDF como imágenes JPEG y las agrega al proyecto.
#[tauri::command]
pub async fn extract_pdf_pages(
    app: AppHandle,
    project_id: String,
    pdf_path: String,
    dpi: Option<u32>,
) -> Result<Vec<String>, String> {
    let dpi = dpi.unwrap_or(200).max(50).min(600);

    if !Path::new(&pdf_path).exists() {
        return Err(format!("Archivo no encontrado: {}", pdf_path));
    }

    let app_bg = app.clone();
    let pid = project_id.clone();

    let ids = tauri::async_runtime::spawn_blocking(move || {
        extract_pages_blocking(&app_bg, &pid, &pdf_path, dpi)
    })
    .await
    .map_err(|e| format!("Error en tarea de extracción: {}", e))??;

    let _ = app.emit("db:images-changed", &project_id);
    let _ = app.emit(
        "pdf:extraction-progress",
        serde_json::json!({
            "pdfPath": "",
            "progress": 100,
            "current": ids.len(),
            "total": ids.len(),
        }),
    );

    Ok(ids)
}

fn extract_pages_blocking(
    app: &AppHandle,
    project_id: &str,
    pdf_path: &str,
    dpi: u32,
) -> Result<Vec<String>, String> {
    let state = app.state::<AppState>();
    let pdfium = build_pdfium(app)?;

    let pdf_name = PathBuf::from(pdf_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "document".to_string());

    let document = pdfium
        .load_pdf_from_file(pdf_path, None)
        .map_err(|e| format!("Error abriendo PDF: {}", e))?;

    let pages = document.pages();
    let total_pages = pages.len() as u32;
    if total_pages == 0 {
        return Err("El PDF no tiene páginas".into());
    }

    let _ = app.emit(
        "pdf:extraction-progress",
        serde_json::json!({
            "pdfPath": pdf_path,
            "progress": 0,
            "current": 0,
            "total": total_pages,
        }),
    );

    let scale = dpi as f32 / 72.0;
    let render_cfg = PdfRenderConfig::new().scale_page_by_factor(scale);

    let mut all_ids = Vec::with_capacity(total_pages as usize);
    let mut pending_entries = Vec::new();
    let batch_size: usize = 20;

    for (i, page) in pages.iter().enumerate() {
        let bitmap = page
            .render_with_config(&render_cfg)
            .map_err(|e| format!("Error renderizando página {}: {}", i + 1, e))?;

        let dyn_img: DynamicImage = bitmap.as_image();
        let rgb = dyn_img.to_rgb8();
        let (w, h) = rgb.dimensions();

        let mut buf = Vec::with_capacity((w * h * 3 / 2) as usize);
        DynamicImage::ImageRgb8(rgb)
            .write_to(&mut Cursor::new(&mut buf), ImageFormat::Jpeg)
            .map_err(|e| format!("Error encodeando JPEG página {}: {}", i + 1, e))?;

        let file_name = format!("{}_page_{:03}.jpg", pdf_name, i + 1);

        let (id, entry) =
            state.prepare_image_entry(project_id, &file_name, &buf, w, h, None, None)?;

        all_ids.push(id);
        pending_entries.push(entry);

        if pending_entries.len() >= batch_size {
            let batch = std::mem::take(&mut pending_entries);
            state.commit_image_entries(project_id, batch)?;
            let _ = app.emit("db:images-changed", project_id);
        }

        let progress = (((i as f64 + 1.0) / total_pages as f64) * 100.0).min(99.0) as i32;
        let _ = app.emit(
            "pdf:extraction-progress",
            serde_json::json!({
                "pdfPath": pdf_path,
                "progress": progress,
                "current": i + 1,
                "total": total_pages,
            }),
        );
    }

    if !pending_entries.is_empty() {
        state.commit_image_entries(project_id, pending_entries)?;
    }

    Ok(all_ids)
}
