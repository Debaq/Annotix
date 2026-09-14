//! Acuerdo entre evaluadores para etiquetas con geometría.
//!
//! Dos personas que dibujan la misma caja no la dibujan igual: el acuerdo aquí no
//! es «coinciden o no», es cuánto se solapa lo que trazaron. IoU para cajas, Dice
//! para máscaras y polígonos —las dos miden lo mismo y son monótonas entre sí,
//! pero se informan las dos porque cada campo está acostumbrado a una—.
//!
//! El emparejamiento entre capas es el paso delicado: antes de comparar hay que
//! decidir qué caja de una persona corresponde a cuál de la otra, y eso no viene
//! dado. Se empareja por mayor solape, de forma **codiciosa y determinista**.

use serde::{Deserialize, Serialize};

use crate::store::project_file::AnnotationEntry;

/// Caja eje-alineada en píxeles.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Caja {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Caja {
    pub fn area(&self) -> f64 {
        (self.w.max(0.0)) * (self.h.max(0.0))
    }
}

/// Solape de dos cajas sobre su unión. 0 si no se tocan.
pub fn iou(a: &Caja, b: &Caja) -> f64 {
    let x1 = a.x.max(b.x);
    let y1 = a.y.max(b.y);
    let x2 = (a.x + a.w).min(b.x + b.w);
    let y2 = (a.y + a.h).min(b.y + b.h);

    let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let union = a.area() + b.area() - inter;
    if union <= 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// Dice de dos cajas: `2·intersección / (área A + área B)`.
pub fn dice(a: &Caja, b: &Caja) -> f64 {
    let x1 = a.x.max(b.x);
    let y1 = a.y.max(b.y);
    let x2 = (a.x + a.w).min(b.x + b.w);
    let y2 = (a.y + a.h).min(b.y + b.h);

    let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let suma = a.area() + b.area();
    if suma <= 0.0 {
        0.0
    } else {
        2.0 * inter / suma
    }
}

/// Caja envolvente de una anotación, sea del tipo que sea.
///
/// Comparar una caja con un polígono por su envolvente es una aproximación, y hay
/// que decirlo: dos polígonos muy distintos pueden tener la misma envolvente. Sirve
/// para emparejar y para dar una primera medida; el acuerdo fino de máscaras
/// necesita comparar píxeles, que no se hace aquí.
pub fn envolvente(ann: &AnnotationEntry) -> Option<Caja> {
    let d = &ann.data;

    if let (Some(x), Some(y), Some(w), Some(h)) = (
        d.get("x").and_then(|v| v.as_f64()),
        d.get("y").and_then(|v| v.as_f64()),
        d.get("width").and_then(|v| v.as_f64()),
        d.get("height").and_then(|v| v.as_f64()),
    ) {
        // Una OBB guarda el centro, no la esquina: su envolvente se calcula aparte.
        if let Some(rot) = d.get("rotation").and_then(|v| v.as_f64()) {
            let (sin, cos) = rot.to_radians().sin_cos();
            let ancho = (w * cos).abs() + (h * sin).abs();
            let alto = (w * sin).abs() + (h * cos).abs();
            return Some(Caja {
                x: x - ancho / 2.0,
                y: y - alto / 2.0,
                w: ancho,
                h: alto,
            });
        }
        return Some(Caja { x, y, w, h });
    }

    // Polígonos, keypoints y landmarks: la envolvente de sus puntos.
    let puntos = d.get("points")?.as_array()?;
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for p in puntos {
        let (Some(x), Some(y)) = (
            p.get("x").and_then(|v| v.as_f64()),
            p.get("y").and_then(|v| v.as_f64()),
        ) else {
            continue;
        };
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }
    if min_x > max_x {
        return None;
    }
    Some(Caja {
        x: min_x,
        y: min_y,
        w: max_x - min_x,
        h: max_y - min_y,
    })
}

/// Una correspondencia entre la anotación de un evaluador y la de otro.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pareja {
    pub id_a: String,
    pub id_b: String,
    pub iou: f64,
    pub dice: f64,
    /// Los dos la llamaron igual. Un solape perfecto con clases distintas es
    /// desacuerdo, no acuerdo, y contarlo como acuerdo escondería el problema.
    pub misma_clase: bool,
}

/// Resultado de emparejar dos capas sobre la misma imagen.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Emparejamiento {
    pub parejas: Vec<Pareja>,
    /// Marcas que sólo vio el primero.
    pub solo_a: Vec<String>,
    /// Marcas que sólo vio el segundo.
    pub solo_b: Vec<String>,
}

impl Emparejamiento {
    /// IoU medio de lo emparejado, contando como 0 lo que sólo vio uno.
    ///
    /// Promediar sólo las parejas daría un acuerdo altísimo en cuanto las dos
    /// personas marquen cosas distintas: lo que una vio y la otra no es el
    /// desacuerdo más grande que hay.
    pub fn iou_medio(&self) -> f64 {
        let total = self.parejas.len() + self.solo_a.len() + self.solo_b.len();
        if total == 0 {
            return 1.0; // Las dos dijeron «aquí no hay nada»: es acuerdo.
        }
        let suma: f64 = self
            .parejas
            .iter()
            .map(|p| if p.misma_clase { p.iou } else { 0.0 })
            .sum();
        suma / total as f64
    }

    pub fn dice_medio(&self) -> f64 {
        let total = self.parejas.len() + self.solo_a.len() + self.solo_b.len();
        if total == 0 {
            return 1.0;
        }
        let suma: f64 = self
            .parejas
            .iter()
            .map(|p| if p.misma_clase { p.dice } else { 0.0 })
            .sum();
        suma / total as f64
    }
}

/// Empareja las marcas de dos capas por mayor solape.
///
/// Codicioso: se toma la pareja de mayor IoU, se apartan las dos, y se repite. No
/// es el emparejamiento óptimo global (eso sería el húngaro), pero es
/// determinista, se explica en una frase y en marcas que no se solapan entre sí
/// —el caso normal— da el mismo resultado.
///
/// `umbral` es el solape mínimo para considerar que dos marcas hablan del mismo
/// objeto. Por debajo, son dos objetos distintos: uno que vio A y otro que vio B.
pub fn emparejar(a: &[AnnotationEntry], b: &[AnnotationEntry], umbral: f64) -> Emparejamiento {
    let cajas_a: Vec<(usize, Caja)> = a
        .iter()
        .enumerate()
        .filter_map(|(i, ann)| envolvente(ann).map(|c| (i, c)))
        .collect();
    let cajas_b: Vec<(usize, Caja)> = b
        .iter()
        .enumerate()
        .filter_map(|(i, ann)| envolvente(ann).map(|c| (i, c)))
        .collect();

    let mut candidatas: Vec<(f64, usize, usize)> = Vec::new();
    for (i, ca) in &cajas_a {
        for (j, cb) in &cajas_b {
            let v = iou(ca, cb);
            if v >= umbral && v > 0.0 {
                candidatas.push((v, *i, *j));
            }
        }
    }
    // Orden estable: por solape y, a igualdad, por índice. Sin el desempate, dos
    // ejecuciones podrían emparejar distinto y el informe dejaría de ser repetible.
    candidatas.sort_by(|x, y| {
        y.0.partial_cmp(&x.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(x.1.cmp(&y.1))
            .then(x.2.cmp(&y.2))
    });

    let mut usadas_a = vec![false; a.len()];
    let mut usadas_b = vec![false; b.len()];
    let mut parejas = Vec::new();

    for (_, i, j) in candidatas {
        if usadas_a[i] || usadas_b[j] {
            continue;
        }
        usadas_a[i] = true;
        usadas_b[j] = true;
        let (ca, cb) = (envolvente(&a[i]).unwrap(), envolvente(&b[j]).unwrap());
        parejas.push(Pareja {
            id_a: a[i].id.clone(),
            id_b: b[j].id.clone(),
            iou: iou(&ca, &cb),
            dice: dice(&ca, &cb),
            misma_clase: a[i].class_id == b[j].class_id,
        });
    }

    Emparejamiento {
        parejas,
        solo_a: a
            .iter()
            .enumerate()
            .filter(|(i, _)| !usadas_a[*i])
            .map(|(_, ann)| ann.id.clone())
            .collect(),
        solo_b: b
            .iter()
            .enumerate()
            .filter(|(i, _)| !usadas_b[*i])
            .map(|(_, ann)| ann.id.clone())
            .collect(),
    }
}
