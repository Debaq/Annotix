use tauri::{AppHandle, Emitter, State};

use crate::medical::import::MedicalImportReport;
use crate::medical::nifti::Eje;
use crate::medical::windowing::PRESETS;
use crate::store::state::AppState;

/// Importa archivos DICOM y NIfTI a un proyecto.
///
/// Devuelve el informe de qué se leyó y **qué identificadores se quitaron**. Ese
/// informe hay que enseñarlo: una deidentificación que nadie mira es una promesa
/// sin comprobar.
///
/// `axis` y `signal_threshold` sólo afectan a los NIfTI: por qué eje cortar el
/// volumen y cuánta señal necesita un corte para entrar.
#[tauri::command]
pub async fn import_medical_files(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    paths: Vec<String>,
    axis: Option<String>,
    signal_threshold: Option<f64>,
) -> Result<MedicalImportReport, String> {
    let eje = match axis.as_deref() {
        Some("sagital") => Eje::Sagital,
        Some("coronal") => Eje::Coronal,
        _ => Eje::Axial,
    };

    let informe =
        state.import_medical_files(&project_id, &paths, eje, signal_threshold.unwrap_or(0.02))?;

    let _ = app.emit(
        "db:images-changed",
        serde_json::json!({ "projectId": &project_id, "action": "added" }),
    );
    Ok(informe)
}

/// Vuelve a renderizar una imagen médica con otra ventana.
///
/// Las anotaciones no se tocan: las coordenadas son las mismas, lo que cambia es
/// qué se ve. Aun así, cambiar la ventana **cambia la imagen que se anotó**, y
/// una marca puesta con ventana de pulmón puede no tener sentido con ventana de
/// hueso: es una decisión del usuario, no un ajuste de pantalla.
#[tauri::command]
pub fn rewindow_image(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    image_id: String,
    center: f64,
    width: f64,
) -> Result<(), String> {
    state.rewindow_image(&project_id, &image_id, center, width)?;
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

/// Ventanas de uso corriente: `(nombre, centro, anchura)`.
///
/// Se sirven desde aquí y no desde el front para que no haya dos listas: son
/// valores radiológicos y una copia desincronizada daría dos imágenes distintas
/// bajo el mismo nombre.
#[tauri::command]
pub fn get_window_presets() -> Vec<(String, f64, f64)> {
    PRESETS
        .iter()
        .map(|(n, c, w)| (n.to_string(), *c, *w))
        .collect()
}
