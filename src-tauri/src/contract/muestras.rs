//! Resultados **por muestra** del conjunto de test, y los intervalos que
//! desbloquean.
//!
//! ## Por qué hacía falta
//!
//! Hasta ahora los backends informaban sólo el agregado —un mAP, una exactitud—
//! y con un número suelto no se puede decir cuánto de él es el modelo y cuánto
//! es qué doce imágenes cayeron en test. El contrato lo decía en vez de
//! omitirlo; esto es lo que permite dejar de decirlo.
//!
//! ## El formato
//!
//! Un CSV ancho, una fila por muestra de test, escrito por el script de
//! entrenamiento junto al modelo:
//!
//! ```csv
//! sample,subject,correct,iou,dice,tp,fp,fn,abs_error
//! img1.png,PAC-1,1,0.82,0.90,3,1,0,
//! ```
//!
//! `sample` y `subject` son los únicos obligatorios —y `subject` puede ir
//! vacío—; cada backend rellena las columnas que sabe calcular por muestra y
//! deja el resto en blanco. Una métrica sin columna no se estima: no hay
//! relleno, igual que en el resto del contrato.
//!
//! ## Por qué se remuestrea por sujeto y no por imagen
//!
//! Doce imágenes de un mismo paciente no son doce observaciones independientes.
//! Remuestrearlas como si lo fueran estrecha el intervalo hasta que deja de
//! decir la verdad, que es el mismo error que la etapa 7 evita al remuestrear
//! ítems en vez de decisiones. Las muestras sin sujeto declarado se tratan como
//! un grupo cada una — es lo que el corpus permite afirmar.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Una muestra del conjunto de test con lo que el backend supo medir de ella.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Muestra {
    pub sample: String,
    pub subject: Option<String>,
    /// 1 o 0: la predicción de clase fue la correcta.
    pub correct: Option<f64>,
    pub iou: Option<f64>,
    pub dice: Option<f64>,
    pub tp: Option<f64>,
    pub fp: Option<f64>,
    pub fn_: Option<f64>,
    /// Error absoluto, para regresión y series.
    pub abs_error: Option<f64>,
    /// Fracción de keypoints dentro de la tolerancia (PCK). No es `correct`
    /// porque no es un acierto sino una proporción: llamarlo igual haría que una
    /// pose con la mitad de los puntos bien contara como media persona
    /// detectada.
    pub pck: Option<f64>,
}

/// Una métrica con su intervalo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricaConIC {
    pub value: f64,
    /// Extremos del intervalo del 95 %. `None` cuando el remuestreo no dio un
    /// número estable —pocos grupos, estadístico indefinido—, y entonces el
    /// valor va solo en vez de con un intervalo inventado.
    pub ci_low: Option<f64>,
    pub ci_high: Option<f64>,
    /// Muestras sobre las que se calculó.
    pub n: usize,
    /// Grupos independientes que se remuestrearon. Si es mucho menor que `n`,
    /// el intervalo es ancho por una razón: hay menos sujetos que imágenes.
    pub groups: usize,
}

/// Nombre del archivo que los scripts escriben junto al modelo.
pub const FILE_NAME: &str = "test_predictions.csv";

/// Semilla del remuestreo. Fija: el mismo corpus tiene que dar el mismo
/// intervalo dos veces, o el contrato no se puede comparar consigo mismo.
const SEMILLA: u64 = 0x5eed_0000_1234_5678;
const REPETICIONES: usize = 2000;

/// Lee el CSV por muestra. `None` si no existe: no todos los backends lo
/// escriben todavía, y eso no es un error del contrato.
pub fn leer(dir_resultados: &Path) -> Option<Vec<Muestra>> {
    let ruta = dir_resultados.join(FILE_NAME);
    let texto = std::fs::read_to_string(&ruta).ok()?;
    let muestras = parsear(&texto);
    (!muestras.is_empty()).then_some(muestras)
}

/// Parsea el CSV. Tolerante por diseño: una columna que no se reconoce se
/// ignora y una celda vacía es «no medido», no un cero — un cero contaría como
/// un acierto fallido y torcería la media.
pub fn parsear(texto: &str) -> Vec<Muestra> {
    let mut lineas = texto.lines().filter(|l| !l.trim().is_empty());
    let Some(cabecera) = lineas.next() else {
        return Vec::new();
    };
    let columnas: Vec<String> = cabecera
        .split(',')
        .map(|c| c.trim().trim_matches('"').to_lowercase())
        .collect();

    let mut salida = Vec::new();
    for linea in lineas {
        let celdas: Vec<&str> = linea.split(',').map(|c| c.trim().trim_matches('"')).collect();
        let mut m = Muestra::default();
        for (i, col) in columnas.iter().enumerate() {
            let Some(celda) = celdas.get(i) else { continue };
            if celda.is_empty() {
                continue;
            }
            let numero = || celda.parse::<f64>().ok();
            match col.as_str() {
                "sample" | "image" | "file" => m.sample = celda.to_string(),
                "subject" | "subject_id" => m.subject = Some(celda.to_string()),
                "correct" => m.correct = numero(),
                "iou" => m.iou = numero(),
                "dice" => m.dice = numero(),
                "tp" => m.tp = numero(),
                "fp" => m.fp = numero(),
                "fn" => m.fn_ = numero(),
                "abs_error" | "error" => m.abs_error = numero(),
                "pck" => m.pck = numero(),
                _ => {}
            }
        }
        if !m.sample.is_empty() {
            salida.push(m);
        }
    }
    salida
}

/// Rellena el sujeto de cada muestra desde el corpus.
///
/// El script de entrenamiento no sabe de sujetos —el dataset que recibe son
/// carpetas de imágenes— así que el CSV llega sin esa columna y el cruce lo hace
/// aquí quien sí lo sabe. Se busca por nombre de archivo, que es con el que el
/// preparador copió cada imagen al dataset.
pub fn con_sujetos(muestras: Vec<Muestra>, pf: &crate::store::project_file::ProjectFile) -> Vec<Muestra> {
    let por_nombre: BTreeMap<&str, Option<&str>> = pf
        .images
        .iter()
        .map(|i| {
            (
                i.name.as_str(),
                i.subject_id.as_deref().filter(|s| !s.is_empty()),
            )
        })
        .collect();
    muestras
        .into_iter()
        .map(|mut m| {
            if m.subject.is_none() {
                // Una muestra puede ser una **instancia** dentro de una imagen
                // («radiografia.png#2»): el sujeto es el de su imagen.
                let clave = m.sample.split('#').next().unwrap_or(&m.sample);
                if let Some(Some(s)) = por_nombre.get(clave) {
                    m.subject = Some(s.to_string());
                }
            }
            m
        })
        .collect()
}

/// Agrupa por sujeto. Lo que no lo declara va como grupo propio: es lo que el
/// corpus permite afirmar, y meterlas todas en un mismo grupo «sin sujeto» las
/// trataría como si vinieran del mismo paciente.
fn grupos(muestras: &[Muestra]) -> Vec<Vec<Muestra>> {
    let mut por_sujeto: BTreeMap<String, Vec<Muestra>> = BTreeMap::new();
    let mut sueltas: Vec<Vec<Muestra>> = Vec::new();
    for m in muestras {
        match m.subject.as_deref().filter(|s| !s.is_empty()) {
            Some(s) => por_sujeto.entry(s.to_string()).or_default().push(m.clone()),
            None => sueltas.push(vec![m.clone()]),
        }
    }
    por_sujeto.into_values().chain(sueltas).collect()
}

fn media(valores: impl Iterator<Item = f64>) -> Option<f64> {
    let (suma, n) = valores.fold((0.0, 0usize), |(s, n), v| (s + v, n + 1));
    (n > 0).then(|| suma / n as f64)
}

/// Estimadores sobre un conjunto de grupos ya remuestreado.
fn estimar(nombre: &str, grupos: &[Vec<Muestra>]) -> Option<f64> {
    let planas = || grupos.iter().flat_map(|g| g.iter());
    match nombre {
        "accuracy" => media(planas().filter_map(|m| m.correct)),
        "meanIoU" => media(planas().filter_map(|m| m.iou)),
        "dice" => media(planas().filter_map(|m| m.dice)),
        "mae" => media(planas().filter_map(|m| m.abs_error)),
        "pck" => media(planas().filter_map(|m| m.pck)),
        // Precisión y recall son **razones de sumas**, no medias de razones: la
        // media de las precisiones por imagen le da el mismo peso a una imagen
        // con un objeto que a una con cuarenta.
        "precision" | "recall" | "f1" => {
            let tp: f64 = planas().filter_map(|m| m.tp).sum();
            let fp: f64 = planas().filter_map(|m| m.fp).sum();
            let fneg: f64 = planas().filter_map(|m| m.fn_).sum();
            let p = (tp + fp > 0.0).then(|| tp / (tp + fp));
            let r = (tp + fneg > 0.0).then(|| tp / (tp + fneg));
            match nombre {
                "precision" => p,
                "recall" => r,
                _ => match (p, r) {
                    (Some(p), Some(r)) if p + r > 0.0 => Some(2.0 * p * r / (p + r)),
                    _ => None,
                },
            }
        }
        _ => None,
    }
}

/// Cuántas muestras aportan dato a cada métrica.
fn cuenta(nombre: &str, muestras: &[Muestra]) -> usize {
    muestras
        .iter()
        .filter(|m| match nombre {
            "accuracy" => m.correct.is_some(),
            "meanIoU" => m.iou.is_some(),
            "dice" => m.dice.is_some(),
            "mae" => m.abs_error.is_some(),
            "pck" => m.pck.is_some(),
            "precision" | "recall" | "f1" => {
                m.tp.is_some() || m.fp.is_some() || m.fn_.is_some()
            }
            _ => false,
        })
        .count()
}

/// Las métricas que el CSV permite estimar, con su intervalo.
///
/// Sólo salen las que tienen dato: una métrica sin columna no aparece, en vez de
/// aparecer con un cero que se leería como un resultado.
pub fn estimaciones(muestras: &[Muestra]) -> BTreeMap<String, MetricaConIC> {
    let gr = grupos(muestras);
    let mut salida = BTreeMap::new();
    for nombre in [
        "accuracy", "meanIoU", "dice", "precision", "recall", "f1", "mae", "pck",
    ] {
        let n = cuenta(nombre, muestras);
        if n == 0 {
            continue;
        }
        let Some(valor) = estimar(nombre, &gr) else {
            continue;
        };
        let (bajo, alto) = crate::agreement::kappa::ic_bootstrap(
            &gr,
            |remuestra| estimar(nombre, remuestra),
            REPETICIONES,
            SEMILLA,
        )
        .map(|(b, a)| (Some(b), Some(a)))
        .unwrap_or((None, None));

        salida.insert(
            nombre.to_string(),
            MetricaConIC {
                value: valor,
                ci_low: bajo,
                ci_high: alto,
                n,
                groups: gr.len(),
            },
        );
    }
    salida
}

#[cfg(test)]
mod tests;
