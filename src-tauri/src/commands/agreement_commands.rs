use tauri::{AppHandle, Emitter, State};

use crate::agreement::{AgreementReport, Discrepancia};
use crate::p2p::node::P2pState;
use crate::store::project_file::AnnotationEntry;
use crate::store::state::AppState;

/// Acuerdo entre evaluadores sobre el corpus del proyecto.
///
/// El número sale con intervalo de confianza y con la razón por la que no se
/// pudo calcular, cuando no se pudo: un acuerdo ausente y un acuerdo de cero
/// dicen cosas muy distintas y el informe no puede confundirlos.
#[tauri::command]
pub fn get_corpus_agreement(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<AgreementReport, String> {
    state.corpus_agreement(&project_id)
}

/// Discrepancias entre lecturas, la peor arriba.
#[tauri::command]
pub fn get_discrepancy_queue(
    state: State<'_, AppState>,
    project_id: String,
    limit: Option<usize>,
) -> Result<Vec<Discrepancia>, String> {
    state.discrepancy_queue(&project_id, limit.unwrap_or(50))
}

/// Resuelve una discrepancia: lo que se manda pasa a ser la capa consolidada.
///
/// Sólo quien puede adjudicar. Fuera de una sesión P2P no hay rol y decide quien
/// tiene el proyecto abierto: es su corpus.
#[tauri::command]
pub async fn adjudicate_image(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    image_id: String,
    annotations: Vec<AnnotationEntry>,
) -> Result<(), String> {
    let decidido_por = match p2p.get_session_info(&project_id).await {
        Some(info) => {
            if !info.role.can_adjudicate() {
                return Err(
                    "Sólo quien adjudica puede resolver discrepancias en esta sesión".to_string(),
                );
            }
            info.my_display_name
        }
        None => "local".to_string(),
    };

    state.adjudicate_image(&project_id, &image_id, annotations, &decidido_por)?;

    let _ = app.emit(
        "db:images-changed",
        serde_json::json!({
            "projectId": &project_id,
            "action": "updated",
            "imageIds": [&image_id],
        }),
    );
    Ok(())
}
