use tauri::State;

use crate::contract::ModelContract;
use crate::store::project_file::StudyProtocol;
use crate::store::state::AppState;

/// Arma el contrato de un modelo entrenado, sin escribirlo.
///
/// Para verlo en pantalla antes de emitirlo: lo primero que hay que leer es la
/// lista de limitaciones, y conviene verla antes de repartir el archivo.
#[tauri::command]
pub fn build_model_contract(
    state: State<'_, AppState>,
    project_id: String,
    job_id: String,
) -> Result<ModelContract, String> {
    state.build_model_contract(&project_id, &job_id)
}

/// Escribe `model_contract.json` junto al modelo. Devuelve el contrato y su ruta.
#[tauri::command]
pub fn write_model_contract(
    state: State<'_, AppState>,
    project_id: String,
    job_id: String,
) -> Result<(ModelContract, String), String> {
    state.write_model_contract(&project_id, &job_id)
}

/// Lo que el proyecto declara sobre sí mismo. Devuelve el bloque vacío cuando no
/// declaró nada: la UI enseña los campos igual, que es como se rellenan.
#[tauri::command]
pub fn get_study_protocol(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<StudyProtocol, String> {
    state.with_project(&project_id, |pf| {
        pf.study_protocol.clone().unwrap_or_default()
    })
}

/// Declara el protocolo del estudio. Los campos vacíos se retiran: un criterio en
/// blanco no es un criterio, y guardarlo haría creer al contrato que hay algo
/// declarado donde no lo hay.
#[tauri::command]
pub fn set_study_protocol(
    state: State<'_, AppState>,
    project_id: String,
    protocol: StudyProtocol,
) -> Result<(), String> {
    let limpio = StudyProtocol {
        inclusion: protocol.inclusion.filter(|s| !s.trim().is_empty()),
        exclusion: protocol.exclusion.filter(|s| !s.trim().is_empty()),
        modality: protocol.modality.filter(|s| !s.trim().is_empty()),
        population: protocol.population.filter(|s| !s.trim().is_empty()),
        intended_use: protocol.intended_use.filter(|s| !s.trim().is_empty()),
    };
    let vacio = limpio.inclusion.is_none()
        && limpio.exclusion.is_none()
        && limpio.modality.is_none()
        && limpio.population.is_none()
        && limpio.intended_use.is_none();

    state.with_project_mut(&project_id, |pf| {
        pf.study_protocol = (!vacio).then(|| limpio.clone());
        pf.updated = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;
    })
}
