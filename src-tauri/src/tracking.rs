//! Seguimiento de una caja entre fotogramas por correlación cruzada.
//!
//! Sirve para no poner a mano un keyframe cada pocos fotogramas: se marca el
//! objeto una vez y el seguidor propone dónde está en los siguientes. No
//! sustituye al anotador —se pierde con oclusiones, deformaciones fuertes o
//! fondos repetitivos— así que devuelve el score de cada encaje y se detiene en
//! cuanto baja del umbral, en vez de seguir escribiendo cajas equivocadas.
//!
//! El método es NCC con media cero (ZNCC) sobre luminancia, con una pasada
//! gruesa y otra fina, y tres escalas en la fina para objetos que se acercan o
//! se alejan. ZNCC y no SSD porque es invariante a cambios de brillo y
//! contraste, que en video son constantes.

use image::GrayImage;
use rayon::prelude::*;

/// Caja en píxeles del fotograma.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PxBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Lado mayor de la plantilla una vez submuestreada. Acota el coste: una caja
/// de 600 px cuesta lo mismo que una de 60.
const MAX_TEMPLATE_SIDE: f64 = 64.0;

/// Radio de búsqueda como fracción del lado mayor de la caja, acotado en
/// píxeles: sin cota, una caja grande buscaría media imagen en cada fotograma.
const SEARCH_FRACTION: f64 = 0.5;
const SEARCH_MIN_PX: f64 = 8.0;
const SEARCH_MAX_PX: f64 = 96.0;

/// Escalas probadas en la pasada fina.
const SCALES: [f64; 3] = [0.94, 1.0, 1.06];

/// Cuántos máximos de la pasada gruesa se refinan.
const COARSE_CANDIDATES: usize = 5;

/// Varianza mínima de la plantilla. Por debajo, la región es plana (cielo,
/// pared) y el mejor encaje es ruido: mejor no proponer nada.
const MIN_VARIANCE: f64 = 4.0;

/// Muestra un píxel con las coordenadas pegadas al borde. Recortar en vez de
/// clampar dejaría sin seguir a los objetos que tocan el borde del fotograma,
/// que es justo cuando entran y salen de escena.
#[inline]
fn sample(img: &GrayImage, x: f64, y: f64) -> f64 {
    let xi = (x.round() as i64).clamp(0, img.width() as i64 - 1) as u32;
    let yi = (y.round() as i64).clamp(0, img.height() as i64 - 1) as u32;
    img.get_pixel(xi, yi)[0] as f64
}

/// Plantilla submuestreada de una caja: valores, media y desviación.
struct Template {
    values: Vec<f64>,
    cols: usize,
    rows: usize,
    step: f64,
    mean: f64,
    dev: f64,
}

fn build_template(img: &GrayImage, b: PxBox) -> Option<Template> {
    let step = (b.w.max(b.h) / MAX_TEMPLATE_SIDE).max(1.0);
    let cols = (b.w / step).floor() as usize;
    let rows = (b.h / step).floor() as usize;
    if cols < 3 || rows < 3 {
        return None;
    }

    let mut values = Vec::with_capacity(cols * rows);
    for j in 0..rows {
        for i in 0..cols {
            values.push(sample(
                img,
                b.x + (i as f64 + 0.5) * step,
                b.y + (j as f64 + 0.5) * step,
            ));
        }
    }

    let n = values.len() as f64;
    let mean = values.iter().sum::<f64>() / n;
    let var = values.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / n;
    if var < MIN_VARIANCE {
        return None;
    }

    Some(Template {
        values,
        cols,
        rows,
        step,
        mean,
        dev: (var * n).sqrt(),
    })
}

/// ZNCC entre la plantilla y la región de `img` que empieza en (x, y) con la
/// plantilla escalada por `scale`. Fuera de [-1, 1] no hay nada: 1 es encaje
/// perfecto.
fn zncc(t: &Template, img: &GrayImage, x: f64, y: f64, scale: f64) -> f64 {
    let step = t.step * scale;
    let mut cand = Vec::with_capacity(t.values.len());
    for j in 0..t.rows {
        for i in 0..t.cols {
            cand.push(sample(
                img,
                x + (i as f64 + 0.5) * step,
                y + (j as f64 + 0.5) * step,
            ));
        }
    }

    let n = cand.len() as f64;
    let mean = cand.iter().sum::<f64>() / n;
    let mut num = 0.0;
    let mut den = 0.0;
    for (a, b) in t.values.iter().zip(&cand) {
        let da = a - t.mean;
        let db = b - mean;
        num += da * db;
        den += db * db;
    }
    let den = den.sqrt() * t.dev;
    if den <= f64::EPSILON {
        return 0.0;
    }
    num / den
}

/// Busca `b` (tomada de `prev`) dentro de `next`.
///
/// Devuelve la caja nueva y el score del encaje, o `None` si la región no tiene
/// textura suficiente para buscarla.
pub fn track_step(prev: &GrayImage, next: &GrayImage, b: PxBox) -> Option<(PxBox, f64)> {
    let t = build_template(prev, b)?;

    let radius = (b.w.max(b.h) * SEARCH_FRACTION).clamp(SEARCH_MIN_PX, SEARCH_MAX_PX);
    // Pasada gruesa: solo desplazamiento, a saltos del tamaño de un píxel de la
    // plantilla. Buscar píxel a píxel aquí sería dos órdenes de magnitud más
    // caro para el mismo resultado.
    let coarse_step = t.step.max(2.0);
    let span = (radius / coarse_step).round() as i64;

    let offsets: Vec<(i64, i64)> = (-span..=span)
        .flat_map(|dy| (-span..=span).map(move |dx| (dx, dy)))
        .collect();

    let mut coarse: Vec<(f64, f64, f64)> = offsets
        .par_iter()
        .map(|&(dx, dy)| {
            let x = b.x + dx as f64 * coarse_step;
            let y = b.y + dy as f64 * coarse_step;
            (zncc(&t, next, x, y, 1.0), x, y)
        })
        .collect();
    coarse.sort_by(|a, c| c.0.total_cmp(&a.0));

    // Pasada fina alrededor de los mejores candidatos gruesos, píxel a píxel y
    // con tres escalas. Se refina más de uno porque la pasada gruesa se salta
    // píxeles: en una textura fina el máximo verdadero puede caer entre dos
    // muestras y quedar por debajo de un vecino cualquiera.
    let fine = (coarse_step.round() as i64).max(1);
    let candidates: Vec<(f64, f64)> = coarse
        .iter()
        .take(COARSE_CANDIDATES)
        .map(|&(_, x, y)| (x, y))
        .collect();
    if candidates.is_empty() {
        return None;
    }

    let fine_offsets: Vec<(usize, i64, i64, usize)> = (0..candidates.len())
        .flat_map(|c| {
            (-fine..=fine).flat_map(move |dy| {
                (-fine..=fine).flat_map(move |dx| (0..SCALES.len()).map(move |s| (c, dx, dy, s)))
            })
        })
        .collect();

    let best = fine_offsets
        .par_iter()
        .map(|&(c, dx, dy, s)| {
            let scale = SCALES[s];
            let x = candidates[c].0 + dx as f64;
            let y = candidates[c].1 + dy as f64;
            (zncc(&t, next, x, y, scale), x, y, scale)
        })
        .max_by(|a, c| a.0.total_cmp(&c.0))?;

    let (score, x, y, scale) = best;
    Some((
        PxBox {
            x,
            y,
            w: b.w * scale,
            h: b.h * scale,
        },
        score,
    ))
}

// ─── Simplificación de la trayectoria ────────────────────────────────────────

/// Caja en porcentaje 0-100 del fotograma, que es como viven los keyframes.
#[derive(Debug, Clone, Copy)]
pub struct PctBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Una caja seguida en un fotograma concreto.
#[derive(Debug, Clone, Copy)]
pub struct TrackedBox {
    pub frame_index: i64,
    pub bbox: PctBox,
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Mayor desviación, en puntos porcentuales, entre las cajas de `samples` y la
/// recta que une sus extremos.
fn max_deviation(samples: &[TrackedBox]) -> (usize, f64) {
    let first = samples[0];
    let last = samples[samples.len() - 1];
    let span = (last.frame_index - first.frame_index) as f64;
    if span <= 0.0 {
        return (0, 0.0);
    }

    let mut worst = (0usize, 0.0f64);
    for (i, s) in samples.iter().enumerate().skip(1).take(samples.len() - 2) {
        let t = (s.frame_index - first.frame_index) as f64 / span;
        let d = [
            (s.bbox.x - lerp(first.bbox.x, last.bbox.x, t)).abs(),
            (s.bbox.y - lerp(first.bbox.y, last.bbox.y, t)).abs(),
            (s.bbox.w - lerp(first.bbox.w, last.bbox.w, t)).abs(),
            (s.bbox.h - lerp(first.bbox.h, last.bbox.h, t)).abs(),
        ]
        .into_iter()
        .fold(0.0f64, f64::max);
        if d > worst.1 {
            worst = (i, d);
        }
    }
    worst
}

/// Reduce la trayectoria a los keyframes que hacen falta para reproducirla.
///
/// El seguidor da una caja por fotograma; guardarlas todas convierte el track
/// en una lista ilegible que además no se puede corregir a mano —mover un
/// keyframe no arregla nada si los cien vecinos siguen donde estaban—. Esto es
/// Ramer-Douglas-Peucker sobre las cuatro componentes: conserva los fotogramas
/// donde la trayectoria se aparta más de `tolerance` de la recta y tira el
/// resto, que es justo lo que la interpolación lineal ya reconstruye.
///
/// `tolerance` va en puntos porcentuales del fotograma.
pub fn simplify_trajectory(samples: &[TrackedBox], tolerance: f64) -> Vec<TrackedBox> {
    if samples.len() <= 2 {
        return samples.to_vec();
    }

    let mut keep = vec![false; samples.len()];
    keep[0] = true;
    keep[samples.len() - 1] = true;

    let mut stack = vec![(0usize, samples.len() - 1)];
    while let Some((from, to)) = stack.pop() {
        if to <= from + 1 {
            continue;
        }
        let (offset, dev) = max_deviation(&samples[from..=to]);
        if dev > tolerance && offset > 0 {
            let split = from + offset;
            keep[split] = true;
            stack.push((from, split));
            stack.push((split, to));
        }
    }

    samples
        .iter()
        .zip(&keep)
        .filter(|(_, k)| **k)
        .map(|(s, _)| *s)
        .collect()
}
