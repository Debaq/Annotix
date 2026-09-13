use std::collections::BTreeMap;

use tauri::State;

use crate::store::state::AppState;
use crate::store::subjects::{PatternPreview, SubjectSummary};

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
    state: State<'_, AppState>,
    project_id: String,
    image_ids: Vec<String>,
    subject_id: Option<String>,
) -> Result<usize, String> {
    state.set_image_subjects(&project_id, &image_ids, subject_id.as_deref())
}

/// Asigna el sujeto de un video y lo propaga a sus fotogramas ya extraídos.
#[tauri::command]
pub fn set_video_subject(
    state: State<'_, AppState>,
    project_id: String,
    video_id: String,
    subject_id: Option<String>,
) -> Result<usize, String> {
    state.set_video_subject(&project_id, &video_id, subject_id.as_deref())
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
    state: State<'_, AppState>,
    project_id: String,
    pattern: String,
) -> Result<usize, String> {
    state.apply_subject_pattern(&project_id, &pattern)
}

/// Aplica un mapeo `nombre de archivo → sujeto`. Devuelve cuántas cambiaron y
/// qué entradas del mapeo no correspondieron a ninguna imagen del proyecto: un
/// CSV que no corresponde al corpus es un error del usuario que conviene mostrar.
#[tauri::command]
pub fn apply_subject_map(
    state: State<'_, AppState>,
    project_id: String,
    mapping: BTreeMap<String, String>,
) -> Result<(usize, Vec<String>), String> {
    state.apply_subject_map(&project_id, &mapping)
}
