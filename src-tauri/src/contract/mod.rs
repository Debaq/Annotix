//! Contrato de modelo: qué se puede afirmar sobre un modelo entrenado aquí.
//!
//! Se arma **sin intervención del usuario** a partir de lo que las etapas
//! anteriores dejaron en el dato: población y reparto (etapas 2 y 3), procedencia
//! del ground truth (etapa 4), registro de auditoría (etapa 5), acuerdo entre
//! evaluadores (etapa 7) y el protocolo que el proyecto declaró.
//!
//! ## Lo que este documento hace distinto
//!
//! No intenta que el modelo se vea bien. Intenta que **lo que no se puede afirmar
//! quede escrito**. Un modelo entrenado sin conjunto de test, sobre un corpus de
//! procedencia desconocida y leído una sola vez, sale con su contrato igual que
//! cualquier otro: lo que cambia es que el contrato lo dice, con el nivel de
//! evidencia y la lista de lo que faltó.
//!
//! Ningún campo se inventa. Donde no hay dato va `null` y una línea en
//! `limitations` explicando por qué — un marcador de relleno sería peor que el
//! hueco, porque se lee como un dato.

use serde::{Deserialize, Serialize};

pub mod build;
pub mod muestras;
pub mod readiness;

#[cfg(test)]
mod tests;

/// Cuánto sostiene el dato lo que el modelo afirma.
///
/// Los cuatro niveles son acumulativos y cada uno exige lo del anterior. No son
/// una nota: son una descripción de qué preguntas tienen respuesta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceLevel {
    /// Hay un modelo y poco más. Sirve para probar una idea, no para decidir nada
    /// sobre nadie.
    Declarativo,
    /// Se midió sobre un conjunto de test que el modelo no vio, y se sabe de
    /// dónde salieron las etiquetas.
    Trazable,
    /// Además, el reparto está declarado —unidad y semilla— y la población tiene
    /// sujetos: el experimento se puede repetir y no hay fuga entre particiones.
    Reproducible,
    /// Además, el corpus se leyó más de una vez y el acuerdo entre evaluadores
    /// está medido con intervalo: se sabe cuánto de la etiqueta es criterio y
    /// cuánto es la persona que lo aplicó.
    Verificable,
}

impl EvidenceLevel {
    pub fn como_texto(&self) -> &'static str {
        match self {
            EvidenceLevel::Declarativo => "declarativo",
            EvidenceLevel::Trazable => "trazable",
            EvidenceLevel::Reproducible => "reproducible",
            EvidenceLevel::Verificable => "verificable",
        }
    }
}

/// Población con la que se entrenó, por partición.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Population {
    /// Unidad por la que se agrupó el reparto: `subject`, `video` o `item`.
    pub split_unit: String,
    /// La que el proyecto declaró, si declaró alguna.
    pub declared_unit: Option<String>,
    /// Semilla del barajado, como texto: es un entero de 64 bits y JavaScript lo
    /// redondearía.
    pub seed: Option<String>,
    pub items: Option<serde_json::Value>,
    pub groups: Option<serde_json::Value>,
    pub subjects: Option<serde_json::Value>,
    pub subjects_undeclared: Option<usize>,
    pub per_class: Vec<serde_json::Value>,
    /// Avisos del reparto: clase ausente en test, corpus a medio declarar, etc.
    pub warnings: Vec<serde_json::Value>,
}

/// De dónde salió el ground truth.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub by_origin: std::collections::BTreeMap<String, usize>,
    pub by_review: std::collections::BTreeMap<String, usize>,
    pub total: usize,
    /// Etiquetas anteriores al registro de procedencia: la parte del corpus sobre
    /// la que no se puede afirmar nada.
    pub unknown: usize,
    /// Sugerencias de modelo que una persona refutó.
    pub rejected: usize,
}

/// Qué se puede comprobar desde fuera.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Integrity {
    /// SHA-256 del archivo del modelo. Es un hash de contenido de verdad.
    pub model_sha256: Option<String>,
    /// SHA-256 de la **composición** del dataset: qué ítems cayeron en cada
    /// partición. No es el contenido de las imágenes —hashear diez mil archivos
    /// en cada informe no sería viable—, y por eso se llama composición: lo que
    /// ancla es el reparto, que es lo que hay que poder repetir.
    pub dataset_composition_sha256: Option<String>,
    /// Cabeza de la cadena de auditoría en el momento de emitir el contrato: el
    /// hash de su última línea. Ancla el modelo al estado del registro.
    pub audit_head_sha256: Option<String>,
    /// Si la cadena verificaba al emitir. `false` significa que el registro fue
    /// manipulado o se perdió una escritura, y es un dato del contrato.
    pub audit_chain_valid: Option<bool>,
    pub audit_events: u64,
}

/// El contrato.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelContract {
    /// Versión del formato del propio contrato.
    pub contract_version: u32,
    pub generated_at: String,
    pub project_id: String,
    pub project_name: String,
    pub project_type: String,
    pub job_id: String,

    /// `declarativo` | `trazable` | `reproducible` | `verificable`.
    pub evidence_level: String,
    /// Qué no se pudo declarar, y por qué. Es la parte del contrato que hay que
    /// leer primero.
    pub limitations: Vec<String>,

    /// Lo que el proyecto declaró sobre sí mismo. `null` donde no declaró nada.
    pub protocol: Option<crate::store::project_file::StudyProtocol>,
    pub population: Option<Population>,
    pub provenance: Provenance,
    /// Acuerdo entre evaluadores con su intervalo, cuando el corpus se leyó más
    /// de una vez.
    pub agreement: Option<crate::agreement::AgreementReport>,

    /// Qué se le hizo al conjunto de entrenamiento antes de entrenar.
    ///
    /// Se transcribe **tal cual** del informe del reparto en vez de copiarlo a
    /// una estructura propia: el dueño del dato es
    /// `training::dataset::AugmentationReport`, y una copia aquí sería una
    /// segunda verdad que se separa a la primera vez que alguien añada un campo.
    ///
    /// `null` cuando el entrenamiento no aumentó nada, que es lo que hacían
    /// todos los proyectos hasta la etapa 11b.
    pub augmentation: Option<serde_json::Value>,

    /// Métricas tal como las informó la corrida.
    pub metrics: Option<serde_json::Value>,
    /// Métricas sobre el conjunto de test, si lo hubo.
    pub test_metrics: Option<serde_json::Value>,
    /// Métricas del conjunto de test con su intervalo de confianza, cuando el
    /// backend dejó los resultados **por muestra**.
    ///
    /// El intervalo sale de un bootstrap agrupado por sujeto: doce imágenes del
    /// mismo paciente no son doce observaciones independientes. `null` cuando el
    /// backend informó sólo el agregado, y entonces `metrics_ci_note` dice por
    /// qué no hay intervalo.
    pub test_metrics_ci: Option<std::collections::BTreeMap<String, muestras::MetricaConIC>>,

    /// Qué se puede decir de los intervalos de confianza de las métricas.
    ///
    /// Con resultados por muestra dice de dónde salen; sin ellos, por qué no
    /// están. Un intervalo calculado sobre el agregado sería inventado, y se
    /// dice en vez de omitirlo en silencio.
    pub metrics_ci_note: String,

    /// Con qué se entrenó: app, backend, modelo base, y la configuración entera.
    pub pipeline: serde_json::Value,
    pub integrity: Integrity,
}

/// Versión del formato del contrato. Sube cuando cambia el significado de un
/// campo, para que un contrato viejo no se lea con reglas nuevas.
pub const CONTRACT_VERSION: u32 = 1;
