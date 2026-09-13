use std::collections::BTreeMap;

use tauri::{AppHandle, Emitter, State};

use crate::store::state::AppState;
use crate::store::subjects::{PatternPreview, ProvenanceSummary, SubjectSummary};

/// Avisa a la galería de que las imágenes cambiaron.
///
/// El refresco de la UI cuelga del evento de Tauri `db:images-changed`, no de un
/// evento del DOM: sin emitirlo, el sujeto queda bien en disco y la galería sigue
/// mostrando lo de antes hasta que se recarga a mano.
fn avisar_cambio(app: &AppHandle, project_id: &str, cambiadas: usize) {
    if cambiadas == 0 {
        return;
    }
    let _ = app.emit(
        "db:images-changed",
        serde_json::json!({
            "projectId": project_id,
            "action": "updated",
        }),
    );
}

/// Reparto de muestras por sujeto: cuántas hay de cada uno y cuántas sin asignar.
#[tauri::command]
pub fn get_subject_summary(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<SubjectSummary, String> {
    state.subject_summary(&project_id)
}

/// Asigna (o borra, con `null`) el sujeto de un conjunto de imágenes.
#[tauri::command]
pub fn set_image_subjects(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    image_ids: Vec<String>,
    subject_id: Option<String>,
) -> Result<usize, String> {
    let n = state.set_image_subjects(&project_id, &image_ids, subject_id.as_deref())?;
    avisar_cambio(&app, &project_id, n);
    Ok(n)
}

/// Asigna el sujeto de un video y lo propaga a sus fotogramas ya extraídos.
#[tauri::command]
pub fn set_video_subject(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    video_id: String,
    subject_id: Option<String>,
) -> Result<usize, String> {
    let n = state.set_video_subject(&project_id, &video_id, subject_id.as_deref())?;
    avisar_cambio(&app, &project_id, n);
    Ok(n)
}

/// Qué sujeto saldría de aplicar el patrón, sin aplicarlo. La UI enseña los
/// aciertos y los fallos antes de tocar nada.
#[tauri::command]
pub fn preview_subject_pattern(
    state: State<'_, AppState>,
    project_id: String,
    pattern: String,
) -> Result<PatternPreview, String> {
    state.preview_subject_pattern(&project_id, &pattern)
}

/// Aplica el patrón. Las imágenes que no encajan quedan intactas, nunca con un
/// sujeto adivinado.
#[tauri::command]
pub fn apply_subject_pattern(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    pattern: String,
) -> Result<usize, String> {
    let n = state.apply_subject_pattern(&project_id, &pattern)?;
    avisar_cambio(&app, &project_id, n);
    Ok(n)
}

/// Aplica un mapeo `nombre de archivo → sujeto`. Devuelve cuántas cambiaron y
/// qué entradas del mapeo no correspondieron a ninguna imagen del proyecto: un
/// CSV que no corresponde al corpus es un error del usuario que conviene mostrar.
#[tauri::command]
pub fn apply_subject_map(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    mapping: BTreeMap<String, String>,
) -> Result<(usize, Vec<String>), String> {
    let (n, sin_uso) = state.apply_subject_map(&project_id, &mapping)?;
    avisar_cambio(&app, &project_id, n);
    Ok((n, sin_uso))
}

/// De dónde salieron las etiquetas del proyecto y qué pasó con las del modelo.
#[tauri::command]
pub fn get_provenance_summary(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<ProvenanceSummary, String> {
    state.provenance_summary(&project_id)
}
