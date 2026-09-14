//! Lectura de NIfTI con extracción de cortes.
//!
//! Un NIfTI es un volumen: la unidad de anotación de Annotix es la imagen 2D
//! (`ImageEntry` no tiene eje Z, y dárselo es la etapa 9c, la más cara del
//! roadmap). Así que aquí se **extraen cortes** y cada uno entra como una imagen
//! más, con el índice del corte y el eje anotados en sus metadatos.
//!
//! Es una simplificación con consecuencias y conviene saberlas: anotar corte a
//! corte no es lo mismo que anotar un volumen, y una máscara hecha así no tiene
//! continuidad garantizada entre cortes. Para lo que la mayoría de la gente
//! entrena —modelos 2D corte a corte— es exactamente lo que hace falta.

use serde::{Deserialize, Serialize};

use super::windowing::{self, Window};

/// Por qué eje se cortó el volumen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Eje {
    /// Cortes a lo largo de Z: axial en la orientación habitual.
    Axial,
    /// A lo largo de Y.
    Coronal,
    /// A lo largo de X.
    Sagital,
}

impl Eje {
    pub fn como_texto(&self) -> &'static str {
        match self {
            Eje::Axial => "axial",
            Eje::Coronal => "coronal",
            Eje::Sagital => "sagital",
        }
    }
}

/// Un corte extraído de un volumen.
pub struct Corte {
    pub gray: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// Qué corte es, dentro del eje elegido.
    pub index: usize,
    pub axis: Eje,
    pub window: Window,
}

/// Metadatos del volumen que acompañan a cada corte.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NiftiMeta {
    /// Dimensiones del volumen `[x, y, z]`.
    pub dims: Vec<usize>,
    /// Tamaño de vóxel en milímetros, si el archivo lo declara.
    pub voxel_size: Option<Vec<f32>>,
    pub value_range: (f64, f64),
    pub axis: String,
    pub n_slices: usize,
}

/// Índices de los cortes que vale la pena extraer.
///
/// Los cortes del principio y del final de un volumen suelen ser aire: entran al
/// corpus como imágenes negras que el entrenamiento cuenta como fondo puro y que
/// nadie va a anotar. Se descartan los que no tienen señal, y se dice cuántos.
pub fn cortes_con_senal(por_corte: &[Vec<f64>], umbral_fraccion: f64) -> Vec<usize> {
    if por_corte.is_empty() {
        return Vec::new();
    }
    // El rango global decide qué cuenta como señal: un umbral por corte haría que
    // un corte de puro aire con ruido pareciera tener contenido.
    let (min, max) = por_corte
        .iter()
        .flatten()
        .fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(*v), hi.max(*v)));
    // Sin contraste no hay señal que buscar: un volumen plano no tiene cortes
    // con contenido, y un umbral relativo sobre un rango nulo daría cualquier cosa.
    if max <= min {
        return Vec::new();
    }
    let corte_de_senal = min + (max - min) * 0.1;

    por_corte
        .iter()
        .enumerate()
        .filter(|(_, vals)| {
            let con_senal = vals.iter().filter(|v| **v > corte_de_senal).count();
            !vals.is_empty() && (con_senal as f64 / vals.len() as f64) >= umbral_fraccion
        })
        .map(|(i, _)| i)
        .collect()
}

/// Lee un NIfTI y devuelve sus cortes ya ventaneados.
///
/// La ventana se calcula **sobre el volumen entero**, no corte a corte: si cada
/// corte tuviera la suya, el mismo tejido saldría con grises distintos según el
/// corte y las anotaciones dejarían de ser comparables entre sí.
pub fn leer(
    ruta: &std::path::Path,
    eje: Eje,
    umbral_senal: f64,
) -> Result<(Vec<Corte>, NiftiMeta, usize), String> {
    use nifti::{IntoNdArray, NiftiObject, ReaderOptions};

    let objeto = ReaderOptions::new()
        .read_file(ruta)
        .map_err(|e| format!("No es un NIfTI legible: {}", e))?;

    let cabecera = objeto.header().clone();
    let voxel_size: Vec<f32> = cabecera.pixdim[1..4].to_vec();

    let volumen = objeto
        .into_volume()
        .into_ndarray::<f64>()
        .map_err(|e| format!("No se pudo leer el volumen: {}", e))?;

    let forma: Vec<usize> = volumen.shape().to_vec();
    if forma.len() < 3 {
        return Err(format!(
            "El volumen tiene {} dimensiones: se esperaban al menos 3",
            forma.len()
        ));
    }

    let (n, ancho, alto) = match eje {
        Eje::Sagital => (forma[0], forma[1], forma[2]),
        Eje::Coronal => (forma[1], forma[0], forma[2]),
        Eje::Axial => (forma[2], forma[0], forma[1]),
    };

    // Valores por corte, en el orden del eje pedido.
    let mut por_corte: Vec<Vec<f64>> = Vec::with_capacity(n);
    for i in 0..n {
        let mut vals = Vec::with_capacity(ancho * alto);
        for b in 0..alto {
            for a in 0..ancho {
                let v = match eje {
                    Eje::Sagital => volumen[[i, a, b]],
                    Eje::Coronal => volumen[[a, i, b]],
                    Eje::Axial => volumen[[a, b, i]],
                };
                vals.push(v);
            }
        }
        por_corte.push(vals);
    }

    let todos: Vec<f64> = por_corte.iter().flatten().copied().collect();
    let window = windowing::ventana_automatica(&todos);
    let rango = todos
        .iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(*v), hi.max(*v)));

    let elegidos = cortes_con_senal(&por_corte, umbral_senal);
    let descartados = n - elegidos.len();

    let cortes = elegidos
        .into_iter()
        .map(|i| Corte {
            gray: windowing::aplicar(&por_corte[i], window),
            width: ancho as u32,
            height: alto as u32,
            index: i,
            axis: eje,
            window,
        })
        .collect();

    let meta = NiftiMeta {
        dims: forma,
        voxel_size: Some(voxel_size),
        value_range: rango,
        axis: eje.como_texto().to_string(),
        n_slices: n,
    };

    Ok((cortes, meta, descartados))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Los cortes de puro aire no entran: serían imágenes negras que el
    /// entrenamiento cuenta como fondo puro y que nadie va a anotar.
    #[test]
    fn los_cortes_vacios_se_descartan() {
        let vacio = vec![0.0; 100];
        let lleno = vec![100.0; 100];
        let volumen = vec![vacio.clone(), lleno.clone(), vacio.clone(), lleno];

        let con_senal = cortes_con_senal(&volumen, 0.05);
        assert_eq!(con_senal, vec![1, 3]);
    }

    /// Un volumen sin contraste ninguno no tiene cortes con señal, y no puede
    /// devolver todos como si los tuviera.
    #[test]
    fn un_volumen_plano_no_tiene_cortes_con_senal() {
        let volumen = vec![vec![7.0; 50], vec![7.0; 50]];
        assert!(cortes_con_senal(&volumen, 0.05).is_empty());
    }

    /// Un corte con una mancha pequeña sí tiene señal: el umbral es sobre la
    /// fracción de píxeles, y una lesión pequeña no puede quedar fuera del corpus.
    #[test]
    fn una_mancha_pequena_cuenta_como_senal() {
        let mut corte = vec![0.0; 1000];
        for v in corte.iter_mut().take(60) {
            *v = 500.0;
        }
        let volumen = vec![corte, vec![0.0; 1000]];

        assert_eq!(cortes_con_senal(&volumen, 0.05), vec![0]);
    }
}
