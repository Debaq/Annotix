//! Acuerdo entre evaluadores.
//!
//! Responde la pregunta que justifica leer un corpus más de una vez: **¿esta
//! etiqueta es reproducible, o es la opinión de quien la puso?** Sin dos lecturas
//! independientes (etapa 6) no hay nada que comparar; con ellas, el desacuerdo se
//! puede medir, ordenar y resolver.
//!
//! Cada tipo de anotación necesita su métrica, y esa es la mayor parte del
//! trabajo:
//!
//! | Tipo | Métrica | Por qué |
//! |---|---|---|
//! | clasificación, multietiqueta, clases de series | κ de Cohen (2) / Fleiss (3+) | hay categorías; un % de coincidencias engaña cuando una clase domina |
//! | bbox, obb | IoU pareado | dos personas no dibujan la misma caja igual |
//! | máscara, polígono, segmentación de instancias | Dice e IoU pareados | lo mismo, en la convención de cada campo |
//! | landmarks, conteos, regresión | Bland-Altman | no hay categorías; lo que importa es cuánto se desvían, en sus unidades |
//!
//! Todo se informa **con intervalo de confianza**, y el intervalo sale de
//! remuestrear **ítems**, no decisiones sueltas: las decisiones de un mismo ítem
//! no son independientes y tratarlas como si lo fueran estrecha el intervalo sin
//! motivo.

pub mod continuous;
pub mod kappa;
pub mod overlap;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};

/// Qué familia de métrica le toca a un tipo de proyecto.
///
/// Espejo de `src/features/agreement/metricFamily.ts`; hay un test que falla si
/// divergen, porque una métrica elegida en el front y otra en el backend darían
/// dos números distintos para la misma pregunta.
pub fn familia_de_metrica(project_type: &str) -> &'static str {
    match project_type {
        "classification" | "multi-label-classification" => "categorica",
        "bbox" | "obb" => "solape_caja",
        "mask" | "polygon" | "instance-segmentation" => "solape_area",
        "keypoints" | "landmarks" => "continua",
        "timeseries-classification"
        | "event-detection"
        | "anomaly-detection"
        | "pattern-recognition"
        | "timeseries-segmentation" => "categorica",
        "timeseries-regression" | "timeseries-forecasting" | "imputation" => "continua",
        _ => "solape_caja",
    }
}

/// Acuerdo medido sobre un corpus.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgreementReport {
    /// `categorica` | `solape_caja` | `solape_area` | `continua`.
    pub family: String,
    /// Nombre del estadístico que se informa: `cohen_kappa`, `fleiss_kappa`,
    /// `iou`, `dice`, `bland_altman`.
    pub statistic: String,
    /// El valor, cuando está definido. `None` cuando el corpus no da para
    /// calcularlo — que no es lo mismo que un acuerdo de cero.
    pub value: Option<f64>,
    /// Intervalo de confianza al 95 % por remuestreo de ítems.
    pub ci_low: Option<f64>,
    pub ci_high: Option<f64>,
    /// Lectura orientativa del valor (Landis y Koch) para κ; vacío en las demás.
    pub reading: Option<String>,
    /// Cuántos ítems entraron en la cuenta: los que tienen al menos dos lecturas
    /// entregadas.
    pub n_items: usize,
    /// Cuántos evaluadores participaron.
    pub n_raters: usize,
    /// Por qué no se pudo calcular, cuando `value` es `None`.
    pub note: Option<String>,
    /// Bland-Altman completo, cuando la familia es continua.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bland_altman: Option<continuous::BlandAltman>,
}

impl AgreementReport {
    pub fn sin_datos(family: &str, note: &str) -> Self {
        Self {
            family: family.to_string(),
            statistic: String::new(),
            value: None,
            ci_low: None,
            ci_high: None,
            reading: None,
            n_items: 0,
            n_raters: 0,
            note: Some(note.to_string()),
            bland_altman: None,
        }
    }
}

/// Una discrepancia concreta entre dos lecturas, para poder resolverla.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Discrepancia {
    pub image_id: String,
    pub image_name: String,
    /// 0 = las lecturas coinciden del todo; 1 = no se parecen en nada. La cola se
    /// ordena por esto, con lo peor arriba: si ordenara por ruido, quien adjudica
    /// perdería el tiempo en lo fácil.
    pub disagreement: f64,
    /// Cuántas marcas vio sólo una de las dos personas.
    pub only_one: usize,
    /// Cuántas marcas emparejadas tienen clases distintas.
    pub class_conflicts: usize,
    pub raters: Vec<String>,
}
