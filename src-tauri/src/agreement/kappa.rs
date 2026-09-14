//! Acuerdo entre evaluadores para etiquetas categóricas.
//!
//! κ de Cohen con dos evaluadores y κ de Fleiss con tres o más. Las dos responden
//! lo mismo: cuánto del acuerdo observado sobrevive a descontar el que habría
//! salido por azar. Un porcentaje de coincidencias sin ese descuento engaña —con
//! una clase que aparece en el 95 % de los casos, dos personas que digan siempre
//! esa clase coinciden el 95 % de las veces sin haber mirado—.

/// Cuánto vale un κ. Los cortes son los de Landis y Koch (1977), que son
/// convención y no ley: se dan como orientación, no como veredicto.
pub fn interpretacion(k: f64) -> &'static str {
    if k < 0.0 {
        "peor_que_azar"
    } else if k < 0.21 {
        "pobre"
    } else if k < 0.41 {
        "aceptable"
    } else if k < 0.61 {
        "moderado"
    } else if k < 0.81 {
        "sustancial"
    } else {
        "casi_perfecto"
    }
}

/// κ de Cohen entre dos evaluadores.
///
/// `pares` son las decisiones emparejadas: una por ítem, `(lo que dijo A, lo que
/// dijo B)`. Devuelve `None` cuando no hay nada que medir (sin ítems) o cuando el
/// acuerdo esperado por azar es 1 —los dos dijeron siempre la misma clase—: ahí κ
/// es 0/0 y darlo como 0 o como 1 serían las dos cosas falsas.
pub fn cohen(pares: &[(i64, i64)]) -> Option<f64> {
    if pares.is_empty() {
        return None;
    }
    let n = pares.len() as f64;

    let acuerdos = pares.iter().filter(|(a, b)| a == b).count() as f64;
    let po = acuerdos / n;

    let mut clases: std::collections::BTreeSet<i64> = Default::default();
    for (a, b) in pares {
        clases.insert(*a);
        clases.insert(*b);
    }

    let pe: f64 = clases
        .iter()
        .map(|c| {
            let pa = pares.iter().filter(|(a, _)| a == c).count() as f64 / n;
            let pb = pares.iter().filter(|(_, b)| b == c).count() as f64 / n;
            pa * pb
        })
        .sum();

    if (1.0 - pe).abs() < f64::EPSILON {
        return None;
    }
    Some((po - pe) / (1.0 - pe))
}

/// κ de Fleiss para tres o más evaluadores.
///
/// `conteos[i][j]` es cuántos evaluadores asignaron la categoría `j` al ítem `i`.
/// Todos los ítems tienen que tener el mismo número de evaluadores: con un número
/// distinto por ítem, el estadístico deja de estar definido y devolver algo sería
/// inventarlo.
pub fn fleiss(conteos: &[Vec<usize>]) -> Option<f64> {
    if conteos.len() < 2 {
        return None;
    }
    let n_categorias = conteos[0].len();
    if n_categorias == 0 {
        return None;
    }

    let n_evaluadores: usize = conteos[0].iter().sum();
    if n_evaluadores < 2
        || conteos
            .iter()
            .any(|fila| fila.iter().sum::<usize>() != n_evaluadores)
    {
        return None;
    }

    let n_items = conteos.len() as f64;
    let n = n_evaluadores as f64;

    // Acuerdo dentro de cada ítem: cuántos pares de evaluadores coinciden.
    let p_i: Vec<f64> = conteos
        .iter()
        .map(|fila| {
            let suma_cuadrados: f64 = fila.iter().map(|&c| (c * c) as f64).sum();
            (suma_cuadrados - n) / (n * (n - 1.0))
        })
        .collect();
    let p_barra: f64 = p_i.iter().sum::<f64>() / n_items;

    // Reparto global de cada categoría.
    let p_j: Vec<f64> = (0..n_categorias)
        .map(|j| conteos.iter().map(|f| f[j] as f64).sum::<f64>() / (n_items * n))
        .collect();
    let pe_barra: f64 = p_j.iter().map(|p| p * p).sum();

    if (1.0 - pe_barra).abs() < f64::EPSILON {
        return None;
    }
    Some((p_barra - pe_barra) / (1.0 - pe_barra))
}

/// Intervalo de confianza por remuestreo **de ítems**, con semilla fija.
///
/// Remuestrear ítems y no decisiones sueltas es lo que mantiene honesta la
/// anchura del intervalo: las decisiones de un mismo ítem no son independientes
/// entre sí, y tratarlas como si lo fueran produce intervalos artificialmente
/// estrechos. Es el mismo error que remuestrear imágenes de los mismos doce
/// pacientes (ver `docs/biomedico-fase2-roadmap.md`, etapa 8).
///
/// La semilla es fija a propósito: el mismo corpus tiene que dar el mismo
/// intervalo dos veces, o el informe no se puede comparar consigo mismo.
pub fn ic_bootstrap<T: Clone>(
    items: &[T],
    estimador: impl Fn(&[T]) -> Option<f64>,
    repeticiones: usize,
    semilla: u64,
) -> Option<(f64, f64)> {
    if items.len() < 2 {
        return None;
    }

    let mut estado = semilla | 1;
    let mut siguiente = || {
        // xorshift64*: determinista, sin dependencias y de sobra para remuestrear.
        estado ^= estado >> 12;
        estado ^= estado << 25;
        estado ^= estado >> 27;
        estado.wrapping_mul(0x2545_F491_4F6C_DD1D)
    };

    let mut valores: Vec<f64> = Vec::with_capacity(repeticiones);
    for _ in 0..repeticiones {
        let muestra: Vec<T> = (0..items.len())
            .map(|_| items[(siguiente() % items.len() as u64) as usize].clone())
            .collect();
        if let Some(v) = estimador(&muestra) {
            valores.push(v);
        }
    }

    // Menos de la mitad de las réplicas dieron un número: el estadístico no está
    // definido sobre este corpus y un intervalo sería decorado.
    if valores.len() * 2 < repeticiones {
        return None;
    }

    valores.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let bajo = valores[(valores.len() as f64 * 0.025) as usize];
    let alto = valores[((valores.len() as f64 * 0.975) as usize).min(valores.len() - 1)];
    Some((bajo, alto))
}
