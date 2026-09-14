//! Armado del contrato de modelo a partir del proyecto y de un entrenamiento.
//!
//! Todo sale del dato que ya existe. La regla que gobierna este archivo: **si no
//! hay dato, va `null` y una línea en `limitations`**. Nunca un valor por defecto
//! que se lea como un hallazgo.

use std::path::Path;

use crate::agreement::AgreementReport;
use crate::contract::{
    EvidenceLevel, Integrity, ModelContract, Population, Provenance, CONTRACT_VERSION,
};
use crate::hashchain::sha256_hex;
use crate::store::project_file::{ProjectFile, TrainingJobEntry};

/// Qué le falta a un contrato para subir de nivel, y el nivel que alcanza.
///
/// Se calcula sobre hechos del dato, no sobre intenciones: da igual lo que el
/// usuario quisiera declarar, lo que cuenta es lo que quedó escrito.
pub fn nivel_de_evidencia(
    pf: &ProjectFile,
    job: &TrainingJobEntry,
    prov: &Provenance,
    acuerdo: Option<&AgreementReport>,
) -> (EvidenceLevel, Vec<String>) {
    let mut faltas: Vec<String> = Vec::new();

    // ─ Trazable ─
    let hay_test = job.test_metrics.is_some();
    if !hay_test {
        faltas.push(
            "No hay conjunto de test: las métricas son de validación y están sesgadas \
             por la selección del mejor epoch. El modelo no se midió sobre datos que no \
             hubiera visto."
                .into(),
        );
    }
    let procedencia_conocida = prov.total > 0 && prov.unknown * 2 < prov.total;
    if !procedencia_conocida {
        faltas.push(format!(
            "La procedencia es desconocida en {} de {} etiquetas: no se puede afirmar qué \
             parte del corpus se trazó a mano y qué parte la propuso un modelo.",
            prov.unknown, prov.total
        ));
    }

    // ─ Reproducible ─
    let politica = pf.split_policy.as_ref();
    let reparto_declarado = politica.is_some_and(|p| p.unit != "auto" || p.seed.is_some());
    if !reparto_declarado {
        faltas.push(
            "El reparto no está declarado: la unidad de agrupación y la semilla se \
             decidieron solas. El experimento se puede repetir en esta app, pero no fuera \
             de ella."
                .into(),
        );
    }
    let hay_sujetos = pf
        .images
        .iter()
        .any(|i| i.subject_id.as_deref().is_some_and(|s| !s.is_empty()));
    if !hay_sujetos {
        faltas.push(
            "Ninguna muestra declara sujeto: no se puede descartar que el mismo paciente, \
             animal o lámina esté en entrenamiento y en test a la vez."
                .into(),
        );
    }

    // ─ Verificable ─
    let acuerdo_medido = acuerdo.is_some_and(|a| a.value.is_some());
    if !acuerdo_medido {
        faltas.push(
            "El corpus se leyó una sola vez: no hay acuerdo entre evaluadores, así que no \
             se sabe cuánto de cada etiqueta es criterio reproducible y cuánto es la \
             persona que lo aplicó."
                .into(),
        );
    }

    if pf.study_protocol.is_none() {
        faltas.push(
            "El proyecto no declara criterios de inclusión y exclusión: el contrato no \
             puede decir a quién representa este modelo."
                .into(),
        );
    }

    let nivel = if hay_test && procedencia_conocida {
        if reparto_declarado && hay_sujetos {
            if acuerdo_medido {
                EvidenceLevel::Verificable
            } else {
                EvidenceLevel::Reproducible
            }
        } else {
            EvidenceLevel::Trazable
        }
    } else {
        EvidenceLevel::Declarativo
    };

    (nivel, faltas)
}

/// Población, tal como la dejó el informe de reparto del entrenamiento.
fn poblacion(job: &TrainingJobEntry, pf: &ProjectFile) -> Option<Population> {
    let r = job.split_report.as_ref()?;
    Some(Population {
        split_unit: r["unit"].as_str().unwrap_or("item").to_string(),
        declared_unit: pf
            .split_policy
            .as_ref()
            .and_then(|p| (p.unit != "auto").then(|| p.unit.clone())),
        seed: r["seed"].as_str().map(|s| s.to_string()),
        items: r.get("items").cloned(),
        groups: r.get("groups").cloned(),
        subjects: r.get("subjects").cloned(),
        subjects_undeclared: r["subjectsUndeclared"].as_u64().map(|v| v as usize),
        per_class: r["perClass"].as_array().cloned().unwrap_or_default(),
        warnings: r["warnings"].as_array().cloned().unwrap_or_default(),
    })
}

/// Hash de la composición del dataset: qué ítem cayó en qué partición.
///
/// Se calcula sobre el informe del reparto y los ids del proyecto en orden
/// estable. No hashea las imágenes: hacerlo en cada informe sobre diez mil
/// archivos no sería viable, y lo que hay que poder repetir es el reparto.
fn hash_composicion(pf: &ProjectFile, job: &TrainingJobEntry) -> Option<String> {
    let reparto = job.split_report.as_ref()?;
    let mut ids: Vec<&str> = pf.images.iter().map(|i| i.id.as_str()).collect();
    ids.sort_unstable();
    Some(sha256_hex(&format!(
        "{}|{}",
        crate::hashchain::canonical(reparto),
        ids.join(",")
    )))
}

/// SHA-256 del archivo del modelo, si está donde dice el trabajo.
fn hash_modelo(job: &TrainingJobEntry) -> Option<String> {
    let ruta = job.best_model_path.as_ref()?;
    let bytes = std::fs::read(Path::new(ruta)).ok()?;
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(&bytes);
    Some(hex::encode(h.finalize()))
}

/// Estado del registro de auditoría al emitir el contrato.
fn integridad_auditoria(project_dir: &Path, integ: &mut Integrity) {
    let Ok(r) = crate::audit::verify_project(project_dir) else {
        return;
    };
    if !r.exists {
        return;
    }
    integ.audit_chain_valid = Some(r.valid);
    integ.audit_events = r.n_events;

    // La cabeza de la cadena: el hash de la última línea entera.
    if let Ok(contenido) = std::fs::read_to_string(project_dir.join(crate::audit::log::FILE_NAME)) {
        let cont = crate::hashchain::continuacion(&contenido);
        if !cont.prev_hash.is_empty() {
            integ.audit_head_sha256 = Some(cont.prev_hash);
        }
    }
}

/// Arma el contrato de un entrenamiento.
pub fn armar(
    pf: &ProjectFile,
    job: &TrainingJobEntry,
    project_dir: &Path,
    provenance: Provenance,
    agreement: Option<AgreementReport>,
) -> ModelContract {
    let (nivel, limitaciones) = nivel_de_evidencia(pf, job, &provenance, agreement.as_ref());

    let mut integrity = Integrity {
        model_sha256: hash_modelo(job),
        dataset_composition_sha256: hash_composicion(pf, job),
        ..Default::default()
    };
    integridad_auditoria(project_dir, &mut integrity);

    ModelContract {
        contract_version: CONTRACT_VERSION,
        generated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        project_id: pf.id.clone(),
        project_name: pf.name.clone(),
        project_type: pf.project_type.clone(),
        job_id: job.id.clone(),

        evidence_level: nivel.como_texto().to_string(),
        limitations: limitaciones,

        protocol: pf.study_protocol.clone(),
        population: poblacion(job, pf),
        provenance,
        agreement,

        metrics: job.metrics.clone(),
        test_metrics: job.test_metrics.clone(),
        metrics_ci_note:
            "Las métricas van sin intervalo de confianza: calcularlo exige los resultados \
             por muestra del conjunto de test, y los backends informan sólo el agregado. \
             Un intervalo calculado sobre el agregado sería inventado. Cuando se recojan \
             los resultados por muestra, el intervalo debe salir de un bootstrap agrupado \
             por sujeto: remuestrear imágenes de los mismos pacientes produce intervalos \
             artificialmente estrechos."
                .to_string(),

        pipeline: serde_json::json!({
            "app_version": crate::study::log::app_version(),
            "config": job.config.clone(),
            "cloud_provider": job.cloud_provider.clone(),
            "result_dir": job.result_dir.clone(),
            "dataset_dir": job.dataset_dir.clone(),
        }),
        integrity,
    }
}

// ─── Desde el estado de la app ──────────────────────────────────────────────

use crate::store::state::AppState;

impl AppState {
    /// Arma el contrato de un entrenamiento y lo devuelve sin escribirlo.
    pub fn build_model_contract(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<ModelContract, String> {
        let resumen = self.provenance_summary(project_id)?;
        let provenance = Provenance {
            by_origin: resumen.by_origin,
            by_review: resumen.by_review,
            total: resumen.total,
            unknown: resumen.unknown,
            rejected: resumen.rejected,
        };

        // El acuerdo sólo entra si de verdad se midió: un informe sin valor es la
        // ausencia del dato, y colarlo haría subir el nivel de evidencia sin que
        // nadie haya leído nada dos veces.
        let acuerdo = self
            .corpus_agreement(project_id)
            .ok()
            .filter(|a| a.value.is_some());

        let dir = self.project_dir(project_id)?;
        self.with_project(project_id, |pf| {
            pf.training_jobs
                .iter()
                .find(|j| j.id == job_id)
                .map(|job| armar(pf, job, &dir, provenance.clone(), acuerdo.clone()))
                .ok_or_else(|| format!("Entrenamiento no encontrado: {}", job_id))
        })?
    }

    /// Escribe `model_contract.json` junto al modelo y devuelve la ruta.
    ///
    /// Junto al modelo y no en la carpeta del proyecto: el contrato describe **ese**
    /// modelo, y si el archivo del modelo se copia a otro sitio sin su contrato,
    /// lo que viaja es un binario del que nadie puede responder.
    pub fn write_model_contract(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<(ModelContract, String), String> {
        let contrato = self.build_model_contract(project_id, job_id)?;

        let destino = self.with_project(project_id, |pf| {
            pf.training_jobs
                .iter()
                .find(|j| j.id == job_id)
                .and_then(|j| {
                    j.best_model_path
                        .as_ref()
                        .and_then(|m| Path::new(m).parent().map(|d| d.to_path_buf()))
                        .or_else(|| j.result_dir.as_ref().map(std::path::PathBuf::from))
                })
        })?;

        let dir = match destino {
            Some(d) if d.exists() => d,
            // Sin modelo en disco todavía —una corrida en la nube sin descargar—
            // el contrato va a la carpeta del proyecto: mejor ahí que en ningún
            // sitio.
            _ => self.project_dir(project_id)?,
        };

        let ruta = dir.join("model_contract.json");
        let json = serde_json::to_string_pretty(&contrato)
            .map_err(|e| format!("Error serializando el contrato: {}", e))?;
        std::fs::write(&ruta, json)
            .map_err(|e| format!("No se pudo escribir el contrato: {}", e))?;

        Ok((contrato, ruta.to_string_lossy().to_string()))
    }
}
