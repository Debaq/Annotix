//! Acuerdo entre evaluadores para medidas continuas.
//!
//! Distancias entre landmarks, conteos, valores de una regresión sobre series.
//! Aquí un κ no significa nada —no hay categorías— y una correlación tampoco:
//! dos personas cuyas medidas difieren siempre en 10 unidades correlacionan
//! perfectamente y no se parecen en nada.
//!
//! Lo que responde la pregunta es Bland-Altman: cuánto se desvían una de otra en
//! promedio (sesgo) y entre qué valores cae ese desvío el 95 % de las veces
//! (límites de acuerdo). Se lee en las unidades de la medida, que es lo que
//! permite decidir si el desacuerdo importa para lo que se va a usar.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlandAltman {
    /// Diferencia media entre evaluadores: el sesgo de uno respecto del otro.
    pub sesgo: f64,
    /// Desviación típica de las diferencias.
    pub sd: f64,
    /// Límites de acuerdo: sesgo ± 1.96 · sd.
    pub limite_inferior: f64,
    pub limite_superior: f64,
    pub n: usize,
}

/// Sesgo y límites de acuerdo de dos series de medidas emparejadas.
///
/// Devuelve `None` con menos de dos pares: con uno hay diferencia pero no
/// dispersión, y unos límites calculados sobre una sola medida no dicen nada.
pub fn bland_altman(pares: &[(f64, f64)]) -> Option<BlandAltman> {
    if pares.len() < 2 {
        return None;
    }
    let n = pares.len() as f64;
    let diffs: Vec<f64> = pares.iter().map(|(a, b)| a - b).collect();
    let sesgo = diffs.iter().sum::<f64>() / n;
    // Varianza muestral (n-1): se estima la dispersión de la población a partir
    // de una muestra, no se describe la muestra.
    let var = diffs.iter().map(|d| (d - sesgo).powi(2)).sum::<f64>() / (n - 1.0);
    let sd = var.sqrt();

    Some(BlandAltman {
        sesgo,
        sd,
        limite_inferior: sesgo - 1.96 * sd,
        limite_superior: sesgo + 1.96 * sd,
        n: pares.len(),
    })
}
