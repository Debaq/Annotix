//! Qué nivel de evidencia alcanzaría un entrenamiento lanzado ahora.
//!
//! El contrato de modelo (etapa 8) se emite **después** de entrenar, cuando ya no
//! se puede hacer nada: si faltaba el sujeto, el modelo ya se entrenó sin él. Esto
//! hace la misma cuenta **antes**, para que el aviso llegue cuando todavía sirve.
//!
//! ## Por qué esto no bloquea nada
//!
//! Es la decisión que gobierna toda la parte biomédica: **las mejoras son
//! opcionales, no bloqueantes** (`docs/biomedico-fase3-presets.md` §1). Un flujo
//! que impide entrenar hasta tener el corpus perfecto convierte cada mejora en un
//! peaje, y quien sólo quiere probar una idea se va a otra herramienta.
//!
//! Lo que baja cuando falta algo es lo que el contrato podrá afirmar. El coste de
//! no cumplir cae en el papel, no en el trabajo — y el papel es el que viaja
//! fuera del laboratorio.
//!
//! ## Lo que no es un problema de evidencia
//!
//! Hay un caso que no baja el nivel porque no es de documentación sino de
//! **corrección**: un corpus de modalidad lateralizada —radiografía, corte axial,
//! mamografía, retina— entrenado con volteo horizontal. Ahí el modelo no está peor
//! documentado: está mal entrenado, porque no puede aprender lateralidad y la
//! lateralidad es diagnóstica. Se dice con otras palabras, y tampoco bloquea.

use serde::{Deserialize, Serialize};

use crate::store::project_file::ProjectFile;
use crate::store::state::AppState;

/// Un aviso previo al entrenamiento.
///
/// `Deserialize` porque el informe del reparto —donde viajan los avisos de la
/// augmentación— se guarda en el trabajo de entrenamiento y se vuelve a leer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aviso {
    /// Código estable; la UI lo traduce. No se manda la frase hecha porque el
    /// backend no sabe de idiomas.
    pub code: String,
    /// `evidencia` — baja lo que el contrato puede afirmar.
    /// `correccion` — el modelo probablemente saldrá mal entrenado.
    pub kind: String,
    /// Dato que acompaña al aviso, cuando lo hay (un porcentaje, una modalidad).
    pub detail: Option<String>,
}

/// Qué saldría si se entrenara ahora.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadinessReport {
    /// `declarativo` | `trazable` | `reproducible` | `verificable`.
    pub level: String,
    /// El siguiente nivel, y qué falta para llegar. `None` en el más alto.
    pub next_level: Option<String>,
    pub warnings: Vec<Aviso>,
    /// Modalidad detectada del corpus, cuando las imágenes vinieron de archivos
    /// médicos. Es lo que permite avisar de la lateralidad sin preguntar nada.
    pub detected_modality: Option<String>,
    /// Si esa modalidad tiene lateralidad que el volteo horizontal destruiría.
    pub lateralized: bool,
    pub n_subjects: usize,
    pub n_images: usize,
}

/// Modalidades donde izquierda y derecha significan algo.
///
/// Una radiografía de tórax volteada no existe en la clínica, y un modelo
/// entrenado con volteo horizontal no puede aprender de qué lado estaba el
/// hallazgo. En microscopía e histología pasa lo contrario: una célula no tiene
/// izquierda, y el volteo es una augmentación legítima.
pub const MODALIDADES_LATERALIZADAS: &[&str] = &[
    "CR",  // radiografía computarizada
    "DX",  // radiografía digital
    "MG",  // mamografía
    "CT",  // tomografía: el corte axial tiene lados
    "MR",  // resonancia: igual
    "PT",  // PET
    "NM",  // medicina nuclear
    "XA",  // angiografía
    "OP",  // fotografía oftálmica
    "OPT", // tomografía oftálmica
];

pub fn es_lateralizada(modalidad: &str) -> bool {
    MODALIDADES_LATERALIZADAS
        .iter()
        .any(|m| m.eq_ignore_ascii_case(modalidad.trim()))
}

/// La modalidad del corpus, si sus imágenes la declaran.
///
/// Se toma la más frecuente: un corpus mezclado existe —un estudio con CT y MR—
/// y avisar por la minoritaria sería ruido.
pub fn modalidad_dominante(pf: &ProjectFile) -> Option<String> {
    let mut cuenta: std::collections::BTreeMap<String, usize> = Default::default();
    for img in &pf.images {
        if let Some(m) = img.medical.as_ref().and_then(|m| m.modality.clone()) {
            *cuenta.entry(m).or_insert(0) += 1;
        }
    }
    cuenta.into_iter().max_by_key(|(_, n)| *n).map(|(m, _)| m)
}

impl AppState {
    /// Qué nivel de evidencia alcanzaría un entrenamiento lanzado ahora.
    ///
    /// `test_split` y `fliplr` vienen de la configuración que el usuario tiene
    /// delante: no están en el proyecto, y son justo lo que puede cambiar antes
    /// de lanzar.
    pub fn training_readiness(
        &self,
        project_id: &str,
        test_split: f64,
        fliplr: f64,
    ) -> Result<ReadinessReport, String> {
        let acuerdo = self
            .corpus_agreement(project_id)
            .ok()
            .filter(|a| a.value.is_some());
        let procedencia = self.provenance_summary(project_id)?;

        self.with_project(project_id, |pf| {
            evaluar(pf, test_split, fliplr, &procedencia, acuerdo.is_some())
        })
    }
}

/// La cuenta, separada del almacenamiento para poder probarla.
pub fn evaluar(
    pf: &ProjectFile,
    test_split: f64,
    fliplr: f64,
    procedencia: &crate::store::subjects::ProvenanceSummary,
    hay_acuerdo: bool,
) -> ReadinessReport {
    let mut avisos: Vec<Aviso> = Vec::new();

    let sujetos: std::collections::BTreeSet<&str> = pf
        .images
        .iter()
        .filter_map(|i| i.subject_id.as_deref().filter(|s| !s.is_empty()))
        .collect();

    // ─── Lo que decide el nivel ─────────────────────────────────────────────
    let hay_test = test_split > 0.0;
    if !hay_test {
        avisos.push(Aviso {
            code: "sin_test".into(),
            kind: "evidencia".into(),
            detail: None,
        });
    }

    let procedencia_conocida = procedencia.total > 0 && procedencia.unknown * 2 < procedencia.total;
    if !procedencia_conocida {
        avisos.push(Aviso {
            code: "procedencia_desconocida".into(),
            kind: "evidencia".into(),
            detail: Some(format!("{}/{}", procedencia.unknown, procedencia.total)),
        });
    }

    let reparto_declarado = pf
        .split_policy
        .as_ref()
        .is_some_and(|p| p.unit != "auto" || p.seed.is_some());
    if !reparto_declarado {
        avisos.push(Aviso {
            code: "reparto_sin_declarar".into(),
            kind: "evidencia".into(),
            detail: None,
        });
    }

    if sujetos.is_empty() {
        avisos.push(Aviso {
            code: "sin_sujetos".into(),
            kind: "evidencia".into(),
            detail: None,
        });
    } else {
        // Un corpus a medio declarar es peor que uno sin declarar: la mitad se
        // agrupa por sujeto y la otra por imagen, sin que se note.
        let sin_sujeto = pf
            .images
            .iter()
            .filter(|i| i.subject_id.as_deref().is_none_or(|s| s.is_empty()))
            .count();
        if sin_sujeto > 0 {
            avisos.push(Aviso {
                code: "sujeto_a_medias".into(),
                kind: "evidencia".into(),
                detail: Some(sin_sujeto.to_string()),
            });
        }
    }

    if !hay_acuerdo {
        avisos.push(Aviso {
            code: "lectura_unica".into(),
            kind: "evidencia".into(),
            detail: None,
        });
    }

    if pf.study_protocol.is_none() {
        avisos.push(Aviso {
            code: "sin_criterios".into(),
            kind: "evidencia".into(),
            detail: None,
        });
    }

    // ─── Lo que no es de evidencia sino de corrección ───────────────────────
    let modalidad = modalidad_dominante(pf);
    let lateralizada = modalidad.as_deref().is_some_and(es_lateralizada);

    if lateralizada && fliplr > 0.0 {
        avisos.push(Aviso {
            code: "volteo_en_modalidad_lateralizada".into(),
            kind: "correccion".into(),
            detail: modalidad.clone(),
        });
    }

    // Sin modalidad no se puede comprobar que el preprocesado corresponda al
    // corpus. No baja el nivel —un corpus de fotos tampoco la tiene— pero se dice
    // cuando el proyecto ya trajo imágenes médicas sin ella.
    if modalidad.is_none() && pf.images.iter().any(|i| i.medical.is_some()) {
        avisos.push(Aviso {
            code: "sin_modalidad".into(),
            kind: "evidencia".into(),
            detail: None,
        });
    }

    let nivel = if hay_test && procedencia_conocida {
        if reparto_declarado && !sujetos.is_empty() {
            if hay_acuerdo {
                "verificable"
            } else {
                "reproducible"
            }
        } else {
            "trazable"
        }
    } else {
        "declarativo"
    };

    let siguiente = match nivel {
        "declarativo" => Some("trazable"),
        "trazable" => Some("reproducible"),
        "reproducible" => Some("verificable"),
        _ => None,
    };

    ReadinessReport {
        level: nivel.to_string(),
        next_level: siguiente.map(|s| s.to_string()),
        warnings: avisos,
        detected_modality: modalidad,
        lateralized: lateralizada,
        n_subjects: sujetos.len(),
        n_images: pf.images.len(),
    }
}
