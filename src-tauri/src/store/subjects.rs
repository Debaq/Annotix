//! Carga y consulta del identificador de sujeto.
//!
//! El sujeto —paciente, animal, cultivo, lámina— es lo que agrupa las muestras
//! para que el reparto train/val/test no parta a la misma persona entre
//! particiones. Cargarlo a mano en miles de imágenes no es viable, así que hay
//! tres vías: asignación por selección, extracción desde el nombre de archivo, y
//! un mapeo externo.
//!
//! Sobre la privacidad: este campo se exporta y viaja con el proyecto. Si lo que
//! se carga es un identificador clínico real, seudonimizarlo es responsabilidad
//! de quien lo carga; el sistema no lo hace por su cuenta porque no puede saber
//! qué transformación conserva el vínculo que el estudio necesita.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::store::state::AppState;

/// Cuántas muestras hay por sujeto, y cuántas quedaron sin asignar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubjectSummary {
    /// Sujeto → número de muestras, ordenado por nombre de sujeto.
    pub counts: BTreeMap<String, usize>,
    /// Muestras sin sujeto declarado.
    #[serde(rename = "unassigned")]
    pub unassigned: usize,
    /// Total de muestras consideradas.
    pub total: usize,
}

/// Resultado de una extracción por patrón, antes de aplicarla.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternPreview {
    /// Pares (nombre de archivo, sujeto extraído) para las que coincidieron.
    pub matched: Vec<(String, String)>,
    /// Nombres que el patrón no supo leer.
    pub unmatched: Vec<String>,
}

/// Extrae el sujeto de un nombre según un patrón con `{subject}` y `*`.
///
/// No usa expresiones regulares a propósito: el proyecto no depende de `regex`, y
/// un patrón como `{subject}_ax_*.jpg` es legible para quien nombra sus archivos,
/// mientras que `^([^_]+)_ax_.*\.jpg$` no lo es.
///
/// `{subject}` captura hasta el siguiente trozo literal; `*` descarta hasta el
/// siguiente trozo literal. Devuelve `None` si el patrón no encaja o si lo
/// capturado queda vacío.
pub fn extract_subject(nombre: &str, patron: &str) -> Option<String> {
    const MARCA: &str = "{subject}";
    if !patron.contains(MARCA) {
        return None;
    }

    // El patrón se parte en literales separados por comodines; `captura` marca
    // cuál de los huecos es el sujeto.
    let mut literales: Vec<String> = Vec::new();
    let mut es_sujeto: Vec<bool> = Vec::new();
    let mut actual = String::new();
    let mut resto = patron;

    while !resto.is_empty() {
        if let Some(p) = resto.find(MARCA) {
            if resto[..p].contains('*') {
                // hay un `*` antes del sujeto: cortar ahí primero
                let q = resto.find('*').unwrap();
                actual.push_str(&resto[..q]);
                literales.push(std::mem::take(&mut actual));
                es_sujeto.push(false);
                resto = &resto[q + 1..];
                continue;
            }
            actual.push_str(&resto[..p]);
            literales.push(std::mem::take(&mut actual));
            es_sujeto.push(true);
            resto = &resto[p + MARCA.len()..];
        } else if let Some(q) = resto.find('*') {
            actual.push_str(&resto[..q]);
            literales.push(std::mem::take(&mut actual));
            es_sujeto.push(false);
            resto = &resto[q + 1..];
        } else {
            actual.push_str(resto);
            resto = "";
        }
    }
    let cola = actual;

    // Recorrer el nombre consumiendo literal, hueco, literal…
    let mut pos = 0usize;
    let mut sujeto: Option<String> = None;

    for (i, literal) in literales.iter().enumerate() {
        if !nombre[pos..].starts_with(literal.as_str()) {
            return None;
        }
        pos += literal.len();

        // Hasta dónde llega el hueco: el siguiente literal no vacío, o la cola.
        let siguiente = literales
            .get(i + 1)
            .filter(|l| !l.is_empty())
            .cloned()
            .unwrap_or_else(|| cola.clone());

        let fin = if siguiente.is_empty() {
            nombre.len()
        } else {
            match nombre[pos..].find(siguiente.as_str()) {
                Some(d) => pos + d,
                None => return None,
            }
        };

        let trozo = &nombre[pos..fin];
        if es_sujeto[i] {
            if trozo.is_empty() {
                return None;
            }
            sujeto = Some(trozo.to_string());
        }
        pos = fin;
    }

    if !cola.is_empty() && !nombre[pos..].ends_with(cola.as_str()) {
        return None;
    }
    sujeto
}

impl AppState {
    /// Reparto de muestras por sujeto en un proyecto.
    pub fn subject_summary(&self, project_id: &str) -> Result<SubjectSummary, String> {
        self.with_project(project_id, |pf| {
            let mut counts: BTreeMap<String, usize> = BTreeMap::new();
            let mut unassigned = 0usize;
            let mut total = 0usize;

            let mut contar = |sujeto: &Option<String>| {
                total += 1;
                match sujeto.as_deref().filter(|s| !s.is_empty()) {
                    Some(s) => *counts.entry(s.to_string()).or_insert(0) += 1,
                    None => unassigned += 1,
                }
            };

            for img in &pf.images {
                contar(&img.subject_id);
            }
            for ts in &pf.timeseries {
                contar(&ts.subject_id);
            }
            for v in &pf.videos {
                contar(&v.subject_id);
            }

            SubjectSummary {
                counts,
                unassigned,
                total,
            }
        })
    }

    /// Asigna un sujeto a las imágenes indicadas. `None` lo borra.
    ///
    /// Devuelve cuántas cambiaron de verdad, no cuántas se pidieron: asignar lo
    /// que ya estaba no es un cambio y no debería contar como tal en el informe.
    pub fn set_image_subjects(
        &self,
        project_id: &str,
        image_ids: &[String],
        subject_id: Option<&str>,
    ) -> Result<usize, String> {
        let nuevo = subject_id.filter(|s| !s.is_empty()).map(|s| s.to_string());
        self.with_project_mut_ret(project_id, |pf| {
            let mut cambiadas = 0usize;
            for img in pf.images.iter_mut() {
                if image_ids.iter().any(|id| id == &img.id) && img.subject_id != nuevo {
                    img.subject_id = nuevo.clone();
                    cambiadas += 1;
                }
            }
            cambiadas
        })
    }

    /// Asigna un sujeto a un video **y a sus fotogramas ya extraídos**.
    ///
    /// Sin lo segundo, marcar el video llegaría tarde para todo lo extraído antes
    /// y el reparto seguiría agrupando esos fotogramas sólo por video.
    pub fn set_video_subject(
        &self,
        project_id: &str,
        video_id: &str,
        subject_id: Option<&str>,
    ) -> Result<usize, String> {
        let nuevo = subject_id.filter(|s| !s.is_empty()).map(|s| s.to_string());
        self.with_project_mut_ret(project_id, |pf| {
            let mut cambiadas = 0usize;
            for v in pf.videos.iter_mut() {
                if v.id == video_id && v.subject_id != nuevo {
                    v.subject_id = nuevo.clone();
                    cambiadas += 1;
                }
            }
            for img in pf.images.iter_mut() {
                if img.video_id.as_deref() == Some(video_id) && img.subject_id != nuevo {
                    img.subject_id = nuevo.clone();
                    cambiadas += 1;
                }
            }
            cambiadas
        })
    }

    /// Qué sujeto saldría de aplicar el patrón, sin aplicarlo.
    ///
    /// Es una vista previa a propósito: un patrón que acierta en el 60 % de los
    /// archivos y falla en el resto en silencio produce un corpus con sujetos
    /// inventados, y eso no se detecta después.
    pub fn preview_subject_pattern(
        &self,
        project_id: &str,
        pattern: &str,
    ) -> Result<PatternPreview, String> {
        self.with_project(project_id, |pf| {
            let mut matched = Vec::new();
            let mut unmatched = Vec::new();
            for img in &pf.images {
                match extract_subject(&img.name, pattern) {
                    Some(s) => matched.push((img.name.clone(), s)),
                    None => unmatched.push(img.name.clone()),
                }
            }
            PatternPreview { matched, unmatched }
        })
    }

    /// Aplica el patrón a las imágenes que coinciden. Las que no, quedan intactas.
    pub fn apply_subject_pattern(&self, project_id: &str, pattern: &str) -> Result<usize, String> {
        self.with_project_mut_ret(project_id, |pf| {
            let mut cambiadas = 0usize;
            for img in pf.images.iter_mut() {
                if let Some(s) = extract_subject(&img.name, pattern) {
                    let nuevo = Some(s);
                    if img.subject_id != nuevo {
                        img.subject_id = nuevo;
                        cambiadas += 1;
                    }
                }
            }
            cambiadas
        })
    }

    /// Asigna sujetos desde un mapeo `nombre de archivo → sujeto`.
    ///
    /// Devuelve (cambiadas, sin correspondencia en el proyecto).
    pub fn apply_subject_map(
        &self,
        project_id: &str,
        mapping: &BTreeMap<String, String>,
    ) -> Result<(usize, Vec<String>), String> {
        self.with_project_mut_ret(project_id, |pf| {
            let mut cambiadas = 0usize;
            let mut sin_uso: Vec<String> = Vec::new();

            for (nombre, sujeto) in mapping {
                let mut usado = false;
                for img in pf.images.iter_mut() {
                    if &img.name == nombre {
                        usado = true;
                        let nuevo = Some(sujeto.clone()).filter(|s| !s.is_empty());
                        if img.subject_id != nuevo {
                            img.subject_id = nuevo;
                            cambiadas += 1;
                        }
                    }
                }
                if !usado {
                    sin_uso.push(nombre.clone());
                }
            }
            (cambiadas, sin_uso)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::extract_subject;

    #[test]
    fn extrae_el_sujeto_del_prefijo() {
        assert_eq!(
            extract_subject("P0031_ax_012.jpg", "{subject}_ax_*.jpg"),
            Some("P0031".into())
        );
        assert_eq!(
            extract_subject("P0031_ax_012.jpg", "{subject}_*"),
            Some("P0031".into())
        );
    }

    #[test]
    fn extrae_el_sujeto_del_medio_y_del_final() {
        assert_eq!(
            extract_subject("estudio_P7_corte12.png", "estudio_{subject}_corte*.png"),
            Some("P7".into())
        );
        assert_eq!(
            extract_subject("corte_012_P7", "corte_*_{subject}"),
            Some("P7".into())
        );
    }

    #[test]
    fn no_inventa_cuando_el_patron_no_encaja() {
        // Sin el separador que el patrón exige.
        assert_eq!(extract_subject("P0031.jpg", "{subject}_ax_*.jpg"), None);
        // Extensión distinta.
        assert_eq!(
            extract_subject("P0031_ax_1.png", "{subject}_ax_*.jpg"),
            None
        );
        // Patrón sin marca de sujeto: no hay nada que extraer.
        assert_eq!(extract_subject("P0031_ax_1.jpg", "*_ax_*.jpg"), None);
    }

    #[test]
    fn rechaza_un_sujeto_vacio() {
        // El hueco existe pero no captura nada: preferible fallar a asignar "".
        assert_eq!(extract_subject("_ax_012.jpg", "{subject}_ax_*.jpg"), None);
    }

    #[test]
    fn el_sujeto_puede_contener_puntos_y_guiones() {
        assert_eq!(
            extract_subject("sub-01_ses-2_T1.nii.png", "{subject}_ses-*.png"),
            Some("sub-01".into())
        );
    }

    /// Un patrón que acierta a medias es el caso peligroso: el resto tiene que
    /// quedar sin asignar, nunca con un sujeto adivinado.
    #[test]
    fn los_que_no_encajan_quedan_fuera_en_vez_de_recibir_basura() {
        let nombres = ["P1_ax_1.jpg", "P2_ax_2.jpg", "suelta.jpg"];
        let extraidos: Vec<_> = nombres
            .iter()
            .map(|n| extract_subject(n, "{subject}_ax_*.jpg"))
            .collect();
        assert_eq!(
            extraidos,
            vec![Some("P1".into()), Some("P2".into()), None::<String>]
        );
    }
}

// ─── Procedencia del corpus ─────────────────────────────────────────────────

/// Cuántas etiquetas hay de cada procedencia, y qué pasó con las del modelo.
///
/// Es el insumo del contrato de modelo: un corpus con el 80 % de las etiquetas
/// autogeneradas y aceptadas sin tocar es una cosa distinta de uno trazado a
/// mano, y hasta ahora no había forma de distinguirlos.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceSummary {
    /// Procedencia → número de etiquetas: `manual`, `model`, `track`, `import`,
    /// `adjudicated`, `unknown`.
    pub by_origin: BTreeMap<String, usize>,
    /// Estado de revisión → número de etiquetas.
    pub by_review: BTreeMap<String, usize>,
    /// Modelo que la sugirió → número de etiquetas.
    pub by_model: BTreeMap<String, usize>,
    pub total: usize,
    /// Etiquetas anteriores al registro de procedencia. Se cuentan aparte porque
    /// no son un origen más: son la parte del corpus sobre la que no se puede
    /// afirmar nada.
    pub unknown: usize,
    /// Sugerencias de modelo que una persona refutó: etiquetas borradas tras
    /// verlas, más predicciones rechazadas en la cola. No entran en `total`
    /// porque no son corpus —no están etiquetando nada—, pero sin ellas la tasa
    /// de aceptación del modelo se calcula sólo sobre lo que sobrevivió y sale
    /// siempre buena.
    pub rejected: usize,
}

impl AppState {
    /// Resumen de procedencia de las anotaciones de imagen del proyecto.
    pub fn provenance_summary(&self, project_id: &str) -> Result<ProvenanceSummary, String> {
        self.with_project(project_id, |pf| {
            let mut r = ProvenanceSummary::default();
            for img in &pf.images {
                r.rejected += img.rejected.len()
                    + img
                        .predictions
                        .iter()
                        .filter(|p| p.status == "rejected")
                        .count();
                for ann in &img.annotations {
                    r.total += 1;
                    let origen = ann.origen().to_string();
                    if origen == "unknown" {
                        r.unknown += 1;
                    }
                    *r.by_origin.entry(origen).or_insert(0) += 1;
                    if let Some(rev) = ann.review.as_deref().filter(|s| !s.is_empty()) {
                        *r.by_review.entry(rev.to_string()).or_insert(0) += 1;
                    }
                    if let Some(m) = ann.model_id.as_deref().filter(|s| !s.is_empty()) {
                        *r.by_model.entry(m.to_string()).or_insert(0) += 1;
                    }
                }
            }
            if r.rejected > 0 {
                *r.by_review.entry("rejected".to_string()).or_insert(0) += r.rejected;
            }
            r
        })
    }
}
