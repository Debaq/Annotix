use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

use crate::store::AppState;

/// Obtiene el número de páginas de un PDF usando pdfinfo.
fn pdf_page_count(pdf_path: &str) -> Result<u32, String> {
    let output = Command::new("pdfinfo")
        .arg(pdf_path)
        .output()
        .map_err(|e| format!("Error ejecutando pdfinfo: {}. ¿Está instalado poppler-utils?", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pdfinfo falló: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.starts_with("Pages:") {
            let count_str = line["Pages:".len()..].trim();
            return count_str
                .parse::<u32>()
                .map_err(|_| format!("No se pudo parsear número de páginas: '{}'", count_str));
        }
    }

    Err("No se encontró información de páginas en el PDF".into())
}

/// Extrae páginas de un PDF como imágenes JPEG y las agrega al proyecto.
#[tauri::command]
pub async fn extract_pdf_pages(
    app: AppHandle,
    project_id: String,
    pdf_path: String,
    dpi: Option<u32>,
) -> Result<Vec<String>, String> {
    let dpi = dpi.unwrap_or(200);

    // Validar que el archivo existe
    if !PathBuf::from(&pdf_path).exists() {
        return Err(format!("Archivo no encontrado: {}", pdf_path));
    }

    // Obtener número de páginas
    let total_pages = pdf_page_count(&pdf_path)?;
    if total_pages == 0 {
        return Err("El PDF no tiene páginas".into());
    }

    // Emitir inicio
    let _ = app.emit(
        "pdf:extraction-progress",
        serde_json::json!({
            "pdfPath": &pdf_path,
            "progress": 0,
            "current": 0,
            "total": total_pages,
        }),
    );

    let app_bg = app.clone();
    let pid = project_id.clone();

    let ids = tauri::async_runtime::spawn_blocking(move || {
        extract_pages_blocking(&app_bg, &pid, &pdf_path, total_pages, dpi)
    })
    .await
    .map_err(|e| format!("Error en tarea de extracción: {}", e))??;

    // Emitir finalización
    let _ = app.emit("db:images-changed", &project_id);
    let _ = app.emit(
        "pdf:extraction-progress",
        serde_json::json!({
            "pdfPath": "",
            "progress": 100,
            "current": total_pages,
            "total": total_pages,
        }),
    );

    Ok(ids)
}

fn extract_pages_blocking(
    app: &AppHandle,
    project_id: &str,
    pdf_path: &str,
    total_pages: u32,
    dpi: u32,
) -> Result<Vec<String>, String> {
    let state = app.state::<AppState>();

    // Nombre base del PDF
    let pdf_name = PathBuf::from(pdf_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "document".to_string());

    // Crear directorio temporal
    let tmp_dir = tempfile::tempdir()
        .map_err(|e| format!("Error creando directorio temporal: {}", e))?;

    let output_prefix = tmp_dir.path().join("page");
    let prefix_str = output_prefix.to_string_lossy().to_string();

    // Ejecutar pdftoppm
    let output = Command::new("pdftoppm")
        .args(["-jpeg", "-r", &dpi.to_string(), pdf_path, &prefix_str])
        .output()
        .map_err(|e| {
            format!(
                "Error ejecutando pdftoppm: {}. ¿Está instalado poppler-utils?",
                e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pdftoppm falló: {}", stderr));
    }

    // Recopilar archivos generados (page-01.jpg, page-02.jpg, etc.)
    let mut page_files: Vec<(u32, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(tmp_dir.path())
        .map_err(|e| format!("Error leyendo directorio temporal: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Error leyendo entrada: {}", e))?;
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext == "jpg" {
                if let Some(stem) = path.file_stem() {
                    let stem_str = stem.to_string_lossy();
                    if let Some(num_str) = stem_str.rsplit('-').next() {
                        if let Ok(page_num) = num_str.parse::<u32>() {
                            page_files.push((page_num, path));
                        }
                    }
                }
            }
        }
    }

    page_files.sort_by_key(|(n, _)| *n);

    if page_files.is_empty() {
        return Err("pdftoppm no generó imágenes. Verifica que el PDF es válido.".into());
    }

    // Importar cada página
    let mut all_ids = Vec::new();
    let mut pending_entries = Vec::new();
    let batch_size = 20;

    for (i, (page_num, page_path)) in page_files.iter().enumerate() {
        let page_data = std::fs::read(page_path)
            .map_err(|e| format!("Error leyendo página {}: {}", page_num, e))?;

        let file_name = format!("{}_page_{:03}.jpg", pdf_name, page_num);

        let img = image::open(page_path)
            .map_err(|e| format!("Error decodificando página {}: {}", page_num, e))?;
        let (w, h) = (img.width(), img.height());

        let (id, entry) =
            state.prepare_image_entry(project_id, &file_name, &page_data, w, h, None, None)?;

        all_ids.push(id);
        pending_entries.push(entry);

        // Flush periódico
        if pending_entries.len() >= batch_size {
            let batch = std::mem::take(&mut pending_entries);
            state.commit_image_entries(project_id, batch)?;
            let _ = app.emit("db:images-changed", project_id);
        }

        // Progreso
        let progress = ((i as f64 + 1.0) / total_pages as f64 * 100.0).min(99.0) as i32;
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

    // Flush restantes
    if !pending_entries.is_empty() {
        state.commit_image_entries(project_id, pending_entries)?;
    }

    Ok(all_ids)
}
