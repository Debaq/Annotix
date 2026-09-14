//! El plan de augmentación del proyecto, y su vista previa.
//!
//! La vista previa **no dibuja una aproximación**: llama al mismo
//! `augment::plan::materializar` que corre al preparar el dataset, con la misma
//! semilla, y devuelve lo que salió. Una previsualización escrita aparte acaba
//! divergiendo del ejecutor —es lo que pasó con las plantillas de script de la
//! pantalla de Configuración—, y una vista previa que miente es peor que no
//! tener vista previa: se usa justamente para decidir si `shear 15°` es mucho o
//! poco.

use serde::Serialize;
use tauri::State;

use crate::augment::plan::{materializar, AugmentationPlan, EntradaPlan};
use crate::augment::tiling;
use crate::contract::readiness::Aviso;
use crate::store::project_file::AnnotationEntry;
use crate::store::AppState;

/// El plan declarado, o el de por defecto —apagado— si no hay ninguno.
#[tauri::command]
pub fn get_augmentation_plan(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<AugmentationPlan, String> {
    state.get_augmentation_plan(&project_id)
}

/// Declara el plan. `null` lo retira.
#[tauri::command]
pub fn set_augmentation_plan(
    state: State<'_, AppState>,
    project_id: String,
    plan: Option<AugmentationPlan>,
) -> Result<(), String> {
    state.set_augmentation_plan(&project_id, plan)
}

/// Una variante generada, tal como entraría al dataset.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AugmentationPreview {
    /// PNG en base64, sin prefijo `data:`.
    pub image: String,
    pub width: u32,
    pub height: u32,
    /// Las anotaciones ya movidas, en coordenadas de la imagen devuelta. La UI
    /// las dibuja encima: sin verlas, la vista previa sólo enseña una foto rara.
    pub annotations: Vec<AnnotationEntry>,
    /// Qué transformaciones cayeron en esta variante, en orden.
    pub transforms: Vec<String>,
    /// Nombre del archivo de la imagen original.
    pub source: String,
    /// Cuántas teselas saldrían de esta imagen, cuando hay teselado.
    pub tiles: usize,
    /// Anotaciones que se perdieron por salirse del marco o quedar por debajo
    /// de la visibilidad mínima. Es el número que decide si el plan es
    /// demasiado agresivo.
    pub dropped_annotations: usize,
    pub warnings: Vec<Aviso>,
}

/// Genera una variante de una imagen del proyecto con el plan que se está
/// editando —que no tiene por qué ser el guardado—.
#[tauri::command]
pub fn preview_augmentation(
    state: State<'_, AppState>,
    project_id: String,
    image_id: Option<String>,
    plan: AugmentationPlan,
    variant: Option<u32>,
) -> Result<AugmentationPreview, String> {
    let (imagen, modalidad, project_id_real) = state.with_project(&project_id, |pf| {
        let elegida = match &image_id {
            Some(id) => pf.images.iter().find(|i| &i.id == id).cloned(),
            // Sin imagen elegida, la primera anotada: una imagen sin etiquetas
            // no enseña lo único que importa mirar, que es si las anotaciones
            // siguen encima de lo que marcan.
            None => pf
                .images
                .iter()
                .find(|i| !i.annotations.is_empty())
                .or_else(|| pf.images.first())
                .cloned(),
        };
        (
            elegida,
            crate::contract::readiness::modalidad_dominante(pf),
            pf.id.clone(),
        )
    })?;
    let imagen = imagen.ok_or("El proyecto no tiene imágenes")?;

    let images_dir = state.project_dir(&project_id)?.join("images");
    let destino = tempfile::tempdir()
        .map_err(|e| format!("No se pudo crear el temporal de la vista previa: {e}"))?;

    // La vista previa siempre genera algo, aunque el plan esté apagado o pida
    // cero variantes: para eso se está mirando.
    let variante = variant.unwrap_or(1).max(1);
    let plan_previa = AugmentationPlan {
        enabled: true,
        factor: variante,
        // El equilibrado por clase decide cuántas variantes toca a cada imagen;
        // en una vista previa de una sola imagen eso sólo confundiría el número.
        balance: crate::augment::plan::BalanceMode::Uniform,
        ..plan.clone()
    };

    let anotaciones_antes = imagen.annotations.len();
    let materializado = materializar(
        &plan_previa,
        &EntradaPlan {
            project_id: &project_id_real,
            images_dir: &images_dir,
            destino: destino.path(),
            modalidad: modalidad.as_deref(),
        },
        std::slice::from_ref(&imagen),
    )?;

    let teselas = plan
        .tiling
        .as_ref()
        .map(|t| tiling::rejilla(imagen.width as f64, imagen.height as f64, t).len())
        .unwrap_or(0);

    // La última variante de la primera base: `materializar` las emite en orden y
    // deja la base al final.
    let registro = materializado
        .manifiesto
        .iter()
        .rev()
        .find(|r| r.variant > 0)
        .ok_or("El plan no generó ninguna variante: ninguna transformación llegó a aplicarse")?;
    let generada = materializado
        .imagenes
        .iter()
        .find(|i| i.name == registro.file)
        .ok_or("La variante generada no aparece en el resultado")?;

    let bytes = std::fs::read(destino.path().join(&registro.file))
        .map_err(|e| format!("No se pudo leer la vista previa: {e}"))?;
    use base64::Engine;

    Ok(AugmentationPreview {
        image: base64::engine::general_purpose::STANDARD.encode(&bytes),
        width: generada.width,
        height: generada.height,
        annotations: generada.annotations.clone(),
        transforms: registro.transforms.clone(),
        source: imagen.name.clone(),
        tiles: teselas,
        dropped_annotations: anotaciones_antes.saturating_sub(generada.annotations.len()),
        warnings: materializado.avisos.clone(),
    })
}
