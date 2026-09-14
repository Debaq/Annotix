//! Pruebas del contrato de modelo.
//!
//! Lo que hay que proteger no es que el contrato se genere, sino que **no afirme
//! de más**: que un corpus flojo produzca un contrato que lo diga, y que ningún
//! campo salga con un valor inventado donde no hay dato.

use super::build::{armar, nivel_de_evidencia};
use super::{EvidenceLevel, Provenance};
use crate::store::project_file::{
    ClassDef, ImageEntry, ProjectFile, SplitPolicy, StudyProtocol, TrainingJobEntry,
};

fn proyecto() -> ProjectFile {
    ProjectFile {
        version: crate::store::project_file::CURRENT_VERSION,
        id: "proj-1".into(),
        name: "Estudio".into(),
        project_type: "bbox".into(),
        classes: vec![ClassDef {
            id: 0,
            name: "lesion".into(),
            color: "#f00".into(),
            description: None,
        }],
        created: 0.0,
        updated: 0.0,
        images: vec![],
        timeseries: vec![],
        videos: vec![],
        training_jobs: vec![],
        tabular_data: vec![],
        audio: vec![],
        p2p: None,
        p2p_download: None,
        inference_models: vec![],
        folder: None,
        tts_sentences: vec![],
        image_format: "jpg".into(),
        webp_quality_preset: "high".into(),
        split_policy: None,
        study_protocol: None,
    }
}

fn imagen(id: &str, sujeto: Option<&str>) -> ImageEntry {
    ImageEntry {
        id: id.into(),
        name: format!("{id}.png"),
        file: format!("{id}.png"),
        width: 100,
        height: 100,
        uploaded: 0.0,
        annotated: None,
        status: "annotated".into(),
        annotations: vec![],
        subject_id: sujeto.map(|s| s.to_string()),
        video_id: None,
        frame_index: None,
        is_background: false,
        locked_by: None,
        lock_expires: None,
        download_status: None,
        predictions: vec![],
        rejected: vec![],
        readings: vec![],
    }
}

fn trabajo(con_test: bool) -> TrainingJobEntry {
    TrainingJobEntry {
        id: "job-1".into(),
        status: "completed".into(),
        config: serde_json::json!({ "backend": "yolo" }),
        progress: 100.0,
        logs: vec![],
        metrics: Some(serde_json::json!({ "map50": 0.8 })),
        test_metrics: con_test.then(|| serde_json::json!({ "map50": 0.7 })),
        metrics_history: vec![],
        created_at: 0.0,
        updated_at: 0.0,
        result_dir: None,
        best_model_path: None,
        dataset_dir: None,
        split_report: Some(serde_json::json!({
            "unit": "subject",
            "seed": "13884088283711083410",
            "items": { "train": 8, "val": 2, "test": 2 },
            "groups": { "train": 4, "val": 1, "test": 1 },
            "perClass": [],
            "warnings": [],
        })),
        cloud_provider: None,
        cloud_job_id: None,
        cloud_job_url: None,
        model_download_url: None,
    }
}

fn procedencia_limpia() -> Provenance {
    Provenance {
        total: 100,
        unknown: 0,
        ..Default::default()
    }
}

/// Un proyecto sin nada declarado produce un contrato **declarativo**, y con la
/// lista de lo que faltó. Lo importante no es la nota: es que esté escrito.
#[test]
fn un_corpus_sin_nada_declarado_sale_declarativo_y_lo_dice() {
    let pf = proyecto();
    let job = trabajo(false);
    let prov = Provenance {
        total: 100,
        unknown: 100,
        ..Default::default()
    };

    let (nivel, faltas) = nivel_de_evidencia(&pf, &job, &prov, None);
    assert_eq!(nivel, EvidenceLevel::Declarativo);
    assert!(faltas.iter().any(|f| f.contains("conjunto de test")));
    assert!(faltas.iter().any(|f| f.contains("procedencia")));
    assert!(faltas.iter().any(|f| f.contains("sujeto")));
    assert!(faltas.iter().any(|f| f.contains("inclusión")));
}

/// Con test y procedencia conocida se llega a trazable, y ni un escalón más
/// mientras el reparto no esté declarado.
#[test]
fn con_test_y_procedencia_es_trazable_pero_no_reproducible() {
    let mut pf = proyecto();
    pf.images.push(imagen("i1", Some("PAC-1")));
    let job = trabajo(true);

    let (nivel, faltas) = nivel_de_evidencia(&pf, &job, &procedencia_limpia(), None);
    assert_eq!(nivel, EvidenceLevel::Trazable);
    assert!(
        faltas
            .iter()
            .any(|f| f.contains("reparto no está declarado")),
        "no dijo que falta declarar el reparto: {faltas:?}"
    );
}

/// Reparto declarado y sujetos cargados: reproducible. Sin acuerdo entre
/// evaluadores no pasa de ahí, y la razón queda escrita.
#[test]
fn con_reparto_declarado_y_sujetos_es_reproducible() {
    let mut pf = proyecto();
    pf.images.push(imagen("i1", Some("PAC-1")));
    pf.split_policy = Some(SplitPolicy {
        unit: "subject".into(),
        seed: Some(4242),
        ..SplitPolicy::default()
    });
    let job = trabajo(true);

    let (nivel, faltas) = nivel_de_evidencia(&pf, &job, &procedencia_limpia(), None);
    assert_eq!(nivel, EvidenceLevel::Reproducible);
    assert!(faltas.iter().any(|f| f.contains("una sola vez")));
}

/// Con acuerdo medido se llega a verificable.
#[test]
fn con_acuerdo_medido_es_verificable() {
    let mut pf = proyecto();
    pf.images.push(imagen("i1", Some("PAC-1")));
    pf.split_policy = Some(SplitPolicy {
        unit: "subject".into(),
        seed: Some(4242),
        ..SplitPolicy::default()
    });
    pf.study_protocol = Some(StudyProtocol {
        inclusion: Some("Adultos derivados por sospecha".into()),
        ..Default::default()
    });
    let job = trabajo(true);

    let acuerdo = crate::agreement::AgreementReport {
        family: "solape_caja".into(),
        statistic: "iou".into(),
        value: Some(0.82),
        ci_low: Some(0.78),
        ci_high: Some(0.86),
        reading: None,
        n_items: 40,
        n_raters: 2,
        note: None,
        bland_altman: None,
    };

    let (nivel, faltas) = nivel_de_evidencia(&pf, &job, &procedencia_limpia(), Some(&acuerdo));
    assert_eq!(nivel, EvidenceLevel::Verificable);
    assert!(faltas.is_empty(), "no debería faltar nada: {faltas:?}");
}

/// Un acuerdo que no se pudo calcular no cuenta como acuerdo: un `value` nulo con
/// su nota es la ausencia del dato, no el dato.
#[test]
fn un_acuerdo_sin_valor_no_sube_el_nivel() {
    let mut pf = proyecto();
    pf.images.push(imagen("i1", Some("PAC-1")));
    pf.split_policy = Some(SplitPolicy {
        unit: "subject".into(),
        seed: Some(1),
        ..SplitPolicy::default()
    });
    let job = trabajo(true);

    let vacio = crate::agreement::AgreementReport::sin_datos("solape_caja", "sin lecturas");
    let (nivel, _) = nivel_de_evidencia(&pf, &job, &procedencia_limpia(), Some(&vacio));
    assert_eq!(nivel, EvidenceLevel::Reproducible);
}

/// Ningún campo se inventa: donde no hay dato va `null`, y las métricas dicen por
/// qué no llevan intervalo en vez de omitirlo en silencio.
#[test]
fn el_contrato_no_rellena_lo_que_no_sabe() {
    let tmp = tempfile::tempdir().unwrap();
    let pf = proyecto();
    let job = trabajo(false);

    let c = armar(&pf, &job, tmp.path(), procedencia_limpia(), None);

    assert!(c.protocol.is_none(), "inventó un protocolo");
    assert!(c.agreement.is_none(), "inventó un acuerdo");
    assert!(c.test_metrics.is_none(), "inventó métricas de test");
    assert!(
        c.integrity.model_sha256.is_none(),
        "inventó el hash del modelo"
    );
    assert!(
        c.metrics_ci_note.contains("por muestra"),
        "no explicó por qué no hay intervalo"
    );
    assert_eq!(c.evidence_level, "declarativo");
}

/// El mismo proyecto entrenado dos veces da el mismo contrato salvo métricas y
/// fecha: si la composición del dataset cambiara de hash sin cambiar el dataset,
/// el ancla no serviría para nada.
#[test]
fn la_composicion_del_dataset_ancla_igual_dos_veces() {
    let tmp = tempfile::tempdir().unwrap();
    let mut pf = proyecto();
    pf.images
        .extend([imagen("i1", Some("P1")), imagen("i2", Some("P2"))]);
    let job = trabajo(true);

    let a = armar(&pf, &job, tmp.path(), procedencia_limpia(), None);
    let b = armar(&pf, &job, tmp.path(), procedencia_limpia(), None);
    assert_eq!(
        a.integrity.dataset_composition_sha256,
        b.integrity.dataset_composition_sha256
    );
    assert!(a.integrity.dataset_composition_sha256.is_some());

    // Y cambia cuando el corpus cambia: si no, no estaría anclando nada.
    pf.images.push(imagen("i3", Some("P3")));
    let c = armar(&pf, &job, tmp.path(), procedencia_limpia(), None);
    assert_ne!(
        a.integrity.dataset_composition_sha256,
        c.integrity.dataset_composition_sha256
    );
}

/// El contrato transcribe el reparto con su semilla: sin ella describe un sorteo
/// irrepetible.
#[test]
fn el_contrato_transcribe_la_semilla_del_reparto() {
    let tmp = tempfile::tempdir().unwrap();
    let pf = proyecto();
    let job = trabajo(true);

    let c = armar(&pf, &job, tmp.path(), procedencia_limpia(), None);
    let p = c.population.expect("población");
    assert_eq!(p.seed.as_deref(), Some("13884088283711083410"));
    assert_eq!(p.split_unit, "subject");
}
