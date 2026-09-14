//! Acuerdo entre evaluadores sobre el corpus de un proyecto, y adjudicación.
//!
//! Las capas de la etapa 6 guardan lo que vio cada persona; aquí se comparan.
//! El cálculo vive en `crate::agreement` —es estadística y se prueba contra
//! valores publicados—, y esto es lo que lo aplica a un `ProjectFile`: qué ítems
//! tienen lecturas suficientes, cómo se emparejan, y qué se hace con el
//! resultado.
//!
//! Sólo cuentan las lecturas **entregadas**. Comparar contra un borrador a medias
//! mide prisa, no desacuerdo.

use crate::agreement::continuous::bland_altman;
use crate::agreement::kappa::{cohen, fleiss, ic_bootstrap, interpretacion};
use crate::agreement::overlap::{emparejar, envolvente, Emparejamiento};
use crate::agreement::{familia_de_metrica, AgreementReport, Discrepancia};
use crate::store::project_file::{AnnotationEntry, ImageEntry, ProjectFile, ReadingLayer};
use crate::store::state::AppState;

/// Solape mínimo para dar por hecho que dos marcas hablan del mismo objeto.
///
/// 0.3 y no 0.5: el umbral no está midiendo calidad de detección sino decidiendo
/// si dos personas apuntaban a la misma cosa. Con 0.5, dos cajas sobre el mismo
/// objeto trazadas con criterios distintos —una ceñida y otra holgada— contarían
/// como dos objetos y el desacuerdo saldría por partida doble.
const UMBRAL_EMPAREJADO: f64 = 0.3;

/// Réplicas del remuestreo. 400 da un intervalo estable al segundo decimal sin
/// que el informe tarde en salir.
const REPETICIONES_BOOTSTRAP: usize = 400;

/// Semilla fija: el mismo corpus tiene que dar el mismo intervalo dos veces.
const SEMILLA_BOOTSTRAP: u64 = 20_260_913;

/// Las lecturas entregadas de una imagen.
fn entregadas(img: &ImageEntry) -> Vec<&ReadingLayer> {
    img.readings
        .iter()
        .filter(|r| r.status == "submitted")
        .collect()
}

/// Nombre legible de un evaluador.
fn nombre(capa: &ReadingLayer) -> String {
    capa.author_name
        .clone()
        .unwrap_or_else(|| capa.author_id.clone())
}

/// Clase que un evaluador le puso a una imagen, para las familias categóricas.
///
/// Con varias marcas se toma la menor por id: una decisión arbitraria pero
/// **determinista**, y en clasificación —donde esto se usa— hay una sola.
/// `None` significa «no dijo nada», que es una respuesta y no un hueco: se
/// codifica como -1 para que «ninguno» pueda estar de acuerdo con «ninguno».
fn clase_de(capa: &ReadingLayer) -> i64 {
    capa.annotations
        .iter()
        .map(|a| a.class_id)
        .min()
        .unwrap_or(-1)
}

/// Centro de una anotación, para las familias continuas.
fn centro(ann: &AnnotationEntry) -> Option<(f64, f64)> {
    let c = envolvente(ann)?;
    Some((c.x + c.w / 2.0, c.y + c.h / 2.0))
}

impl AppState {
    /// Acuerdo entre evaluadores sobre todo el corpus.
    pub fn corpus_agreement(&self, project_id: &str) -> Result<AgreementReport, String> {
        self.with_project(project_id, calcular_acuerdo)
    }

    /// Discrepancias ordenadas, la peor arriba.
    pub fn discrepancy_queue(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<Discrepancia>, String> {
        self.with_project(project_id, |pf| cola_de_discrepancias(pf, limit))
    }

    /// Resuelve una imagen: lo que se pasa pasa a ser la capa consolidada.
    ///
    /// Las marcas resultantes quedan con `origin: "adjudicated"`, que es lo que
    /// permitirá al contrato de modelo declarar qué parte del corpus se decidió
    /// entre varias lecturas en vez de salir de una sola.
    pub fn adjudicate_image(
        &self,
        project_id: &str,
        image_id: &str,
        annotations: Vec<AnnotationEntry>,
        decided_by: &str,
    ) -> Result<(), String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;

        let capas: Vec<String> = self.with_project(project_id, |pf| {
            pf.images
                .iter()
                .find(|i| i.id == image_id)
                .map(|i| i.readings.iter().map(nombre).collect())
                .unwrap_or_default()
        })?;

        let n = annotations.len();
        self.with_project_mut(project_id, |pf| {
            if let Some(img) = pf.images.iter_mut().find(|i| i.id == image_id) {
                img.annotations = annotations
                    .iter()
                    .map(|a| {
                        let mut resuelta = a.clone();
                        resuelta.origin = Some("adjudicated".to_string());
                        resuelta.review = Some("reviewed".to_string());
                        resuelta.reviewed_by = Some(decided_by.to_string());
                        resuelta.reviewed_at = Some(now);
                        resuelta.updated_at = Some(now);
                        resuelta
                    })
                    .collect();
                img.status = if n == 0 { "pending" } else { "reviewed" }.to_string();
                img.annotated = if n == 0 { None } else { Some(now) };
            }
            pf.updated = now;
        })?;

        // Quién decidió y sobre qué capas: sin eso, la etiqueta adjudicada es una
        // etiqueta más y no se puede reconstruir de dónde salió.
        self.audit(
            project_id,
            crate::audit::events::ADJUDICATED,
            serde_json::json!({
                "image_id": image_id,
                "decided_by": decided_by,
                "n_annotations": n,
                "over_readings": capas,
            }),
        );
        Ok(())
    }
}

/// Acuerdo del corpus, según la familia de métrica del tipo de proyecto.
pub fn calcular_acuerdo(pf: &ProjectFile) -> AgreementReport {
    let familia = familia_de_metrica(&pf.project_type);

    // Ítems con al menos dos lecturas entregadas: con una no hay con qué comparar.
    let comparables: Vec<&ImageEntry> = pf
        .images
        .iter()
        .filter(|i| entregadas(i).len() >= 2)
        .collect();

    if comparables.is_empty() {
        return AgreementReport::sin_datos(
            familia,
            "Ninguna muestra tiene dos lecturas entregadas todavía",
        );
    }

    let evaluadores: std::collections::BTreeSet<String> = comparables
        .iter()
        .flat_map(|i| entregadas(i).into_iter().map(|c| c.author_id.clone()))
        .collect();

    let mut informe = match familia {
        "categorica" => acuerdo_categorico(&comparables),
        "continua" => acuerdo_continuo(&comparables),
        _ => acuerdo_por_solape(&comparables, familia),
    };

    informe.family = familia.to_string();
    informe.n_items = comparables.len();
    informe.n_raters = evaluadores.len();
    if let Some(v) = informe.value {
        if informe.statistic.contains("kappa") {
            informe.reading = Some(interpretacion(v).to_string());
        }
    }
    informe
}

/// κ de Cohen con dos evaluadores, de Fleiss con tres o más.
fn acuerdo_categorico(items: &[&ImageEntry]) -> AgreementReport {
    let dos_evaluadores = items.iter().all(|i| entregadas(i).len() == 2);

    if dos_evaluadores {
        let pares: Vec<(i64, i64)> = items
            .iter()
            .map(|i| {
                let capas = entregadas(i);
                (clase_de(capas[0]), clase_de(capas[1]))
            })
            .collect();

        let valor = cohen(&pares);
        let (lo, hi) = ic_bootstrap(&pares, cohen, REPETICIONES_BOOTSTRAP, SEMILLA_BOOTSTRAP)
            .map(|(a, b)| (Some(a), Some(b)))
            .unwrap_or((None, None));

        return AgreementReport {
            family: String::new(),
            statistic: "cohen_kappa".into(),
            value: valor,
            ci_low: lo,
            ci_high: hi,
            reading: None,
            n_items: 0,
            n_raters: 0,
            note: valor.is_none().then(|| {
                "Todas las lecturas dijeron lo mismo: κ no está definida (el azar \
                 también habría acertado siempre)"
                    .to_string()
            }),
            bland_altman: None,
        };
    }

    // Fleiss necesita el mismo número de evaluadores por ítem.
    let n_evaluadores = entregadas(items[0]).len();
    if items.iter().any(|i| entregadas(i).len() != n_evaluadores) {
        return AgreementReport::sin_datos(
            "categorica",
            "Las muestras no tienen el mismo número de lecturas entregadas: κ de \
             Fleiss no está definida y forzarla sería inventar el número",
        );
    }

    let mut clases: std::collections::BTreeSet<i64> = Default::default();
    for i in items {
        for c in entregadas(i) {
            clases.insert(clase_de(c));
        }
    }
    let indice: std::collections::BTreeMap<i64, usize> = clases
        .iter()
        .enumerate()
        .map(|(idx, c)| (*c, idx))
        .collect();

    let conteos: Vec<Vec<usize>> = items
        .iter()
        .map(|i| {
            let mut fila = vec![0usize; clases.len()];
            for c in entregadas(i) {
                fila[indice[&clase_de(c)]] += 1;
            }
            fila
        })
        .collect();

    let valor = fleiss(&conteos);
    let (lo, hi) = ic_bootstrap(&conteos, fleiss, REPETICIONES_BOOTSTRAP, SEMILLA_BOOTSTRAP)
        .map(|(a, b)| (Some(a), Some(b)))
        .unwrap_or((None, None));

    AgreementReport {
        family: String::new(),
        statistic: "fleiss_kappa".into(),
        value: valor,
        ci_low: lo,
        ci_high: hi,
        reading: None,
        n_items: 0,
        n_raters: 0,
        note: valor
            .is_none()
            .then(|| "Todas las lecturas dijeron lo mismo: κ no está definida".to_string()),
        bland_altman: None,
    }
}

/// Solape medio entre pares de lecturas: IoU para cajas, Dice para áreas.
fn acuerdo_por_solape(items: &[&ImageEntry], familia: &str) -> AgreementReport {
    let usa_dice = familia == "solape_area";

    // Un valor por ítem: la media de todos los pares de lecturas de esa imagen.
    // Promediar por ítem y no por pareja evita que una imagen con cuatro lecturas
    // pese seis veces más que una con dos.
    let por_item: Vec<f64> = items
        .iter()
        .map(|i| {
            let capas = entregadas(i);
            let mut valores = Vec::new();
            for a in 0..capas.len() {
                for b in (a + 1)..capas.len() {
                    let m = emparejar(
                        &capas[a].annotations,
                        &capas[b].annotations,
                        UMBRAL_EMPAREJADO,
                    );
                    valores.push(if usa_dice {
                        m.dice_medio()
                    } else {
                        m.iou_medio()
                    });
                }
            }
            if valores.is_empty() {
                1.0
            } else {
                valores.iter().sum::<f64>() / valores.len() as f64
            }
        })
        .collect();

    let media = |v: &[f64]| -> Option<f64> {
        if v.is_empty() {
            None
        } else {
            Some(v.iter().sum::<f64>() / v.len() as f64)
        }
    };

    let valor = media(&por_item);
    let (lo, hi) = ic_bootstrap(&por_item, media, REPETICIONES_BOOTSTRAP, SEMILLA_BOOTSTRAP)
        .map(|(a, b)| (Some(a), Some(b)))
        .unwrap_or((None, None));

    AgreementReport {
        family: String::new(),
        statistic: if usa_dice { "dice" } else { "iou" }.into(),
        value: valor,
        ci_low: lo,
        ci_high: hi,
        reading: None,
        n_items: 0,
        n_raters: 0,
        note: None,
        bland_altman: None,
    }
}

/// Bland-Altman sobre las coordenadas de lo que las dos personas emparejaron.
///
/// La medida es la posición: para cada marca que las dos vieron, se comparan su x
/// y su y. Un κ aquí no diría nada —no hay categorías— y una correlación tampoco:
/// dos personas cuyas marcas están siempre 10 px a la derecha correlacionan
/// perfectamente y no coinciden en nada.
fn acuerdo_continuo(items: &[&ImageEntry]) -> AgreementReport {
    let mut pares: Vec<(f64, f64)> = Vec::new();

    for i in items {
        let capas = entregadas(i);
        for a in 0..capas.len() {
            for b in (a + 1)..capas.len() {
                let m: Emparejamiento = emparejar(
                    &capas[a].annotations,
                    &capas[b].annotations,
                    UMBRAL_EMPAREJADO,
                );
                for p in &m.parejas {
                    let ann_a = capas[a].annotations.iter().find(|x| x.id == p.id_a);
                    let ann_b = capas[b].annotations.iter().find(|x| x.id == p.id_b);
                    if let (Some(x), Some(y)) = (ann_a.and_then(centro), ann_b.and_then(centro)) {
                        pares.push((x.0, y.0));
                        pares.push((x.1, y.1));
                    }
                }
            }
        }
    }

    let Some(ba) = bland_altman(&pares) else {
        return AgreementReport::sin_datos(
            "continua",
            "No hay marcas emparejadas entre lecturas: no hay dos medidas de lo \
             mismo que comparar",
        );
    };

    AgreementReport {
        family: String::new(),
        statistic: "bland_altman".into(),
        value: Some(ba.sesgo),
        ci_low: Some(ba.limite_inferior),
        ci_high: Some(ba.limite_superior),
        reading: None,
        n_items: 0,
        n_raters: 0,
        note: None,
        bland_altman: Some(ba),
    }
}

/// Las discrepancias, la peor arriba.
///
/// El orden es lo que decide si la cola sirve: quien adjudica mira las primeras y
/// se fía de que lo de abajo no importa. Se ordena por desacuerdo —1 menos el
/// solape—, y a igualdad, por cuántas marcas vio sólo una persona: ver algo que
/// el otro no vio es más grave que dibujarlo distinto.
pub fn cola_de_discrepancias(pf: &ProjectFile, limit: usize) -> Vec<Discrepancia> {
    let mut out: Vec<Discrepancia> = Vec::new();

    for img in &pf.images {
        let capas = entregadas(img);
        if capas.len() < 2 {
            continue;
        }

        let mut desacuerdos = Vec::new();
        let mut solo_uno = 0usize;
        let mut conflictos = 0usize;

        for a in 0..capas.len() {
            for b in (a + 1)..capas.len() {
                let m = emparejar(
                    &capas[a].annotations,
                    &capas[b].annotations,
                    UMBRAL_EMPAREJADO,
                );
                desacuerdos.push(1.0 - m.iou_medio());
                solo_uno += m.solo_a.len() + m.solo_b.len();
                conflictos += m.parejas.iter().filter(|p| !p.misma_clase).count();
            }
        }

        let disagreement = desacuerdos.iter().cloned().fold(0.0_f64, f64::max);
        if disagreement <= f64::EPSILON && solo_uno == 0 && conflictos == 0 {
            continue; // Coinciden del todo: no hay nada que resolver.
        }

        out.push(Discrepancia {
            image_id: img.id.clone(),
            image_name: img.name.clone(),
            disagreement,
            only_one: solo_uno,
            class_conflicts: conflictos,
            raters: capas.iter().map(|c| nombre(c)).collect(),
        });
    }

    out.sort_by(|x, y| {
        y.disagreement
            .partial_cmp(&x.disagreement)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(y.only_one.cmp(&x.only_one))
            .then(x.image_id.cmp(&y.image_id))
    });
    out.truncate(limit.clamp(1, 500));
    out
}
