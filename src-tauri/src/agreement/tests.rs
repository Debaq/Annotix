//! Pruebas del acuerdo entre evaluadores.
//!
//! Las de los estadísticos se comprueban contra valores publicados, no contra lo
//! que devuelva la implementación: un test que compara el código consigo mismo
//! sólo demuestra que no cambió, no que esté bien. Si estos números no coinciden
//! con los de R o scipy al tercer decimal, hay un error de implementación — es el
//! criterio que pide `docs/biomedico-fase2-roadmap.md`, etapa 7.

use super::continuous::bland_altman;
use super::kappa::{cohen, fleiss, ic_bootstrap, interpretacion};
use super::overlap::{dice, emparejar, envolvente, iou, Caja};
use crate::store::project_file::AnnotationEntry;

fn cerca(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() < tol
}

// ─── κ de Cohen ─────────────────────────────────────────────────────────────

/// Tabla 2×2 clásica: a=20, b=5, c=10, d=15 sobre 50 casos.
/// po = 35/50 = 0.7; pe = (25·30 + 25·20)/2500 = 0.5; κ = 0.4.
#[test]
fn cohen_da_el_valor_conocido_de_la_tabla_2x2() {
    let mut pares: Vec<(i64, i64)> = Vec::new();
    for _ in 0..20 {
        pares.push((1, 1));
    }
    for _ in 0..5 {
        pares.push((1, 0));
    }
    for _ in 0..10 {
        pares.push((0, 1));
    }
    for _ in 0..15 {
        pares.push((0, 0));
    }

    let k = cohen(&pares).expect("κ definida");
    assert!(cerca(k, 0.4, 1e-9), "κ = {k}, se esperaba 0.4");
}

/// Acuerdo perfecto sobre dos clases: κ = 1.
#[test]
fn cohen_es_uno_con_acuerdo_perfecto() {
    let pares = vec![(0, 0), (1, 1), (0, 0), (1, 1)];
    assert!(cerca(cohen(&pares).unwrap(), 1.0, 1e-12));
}

/// Coincidir siempre en la misma clase no es acuerdo medible: el azar también
/// daba el 100 %. κ es 0/0 y devolver 0 o 1 serían las dos cosas falsas.
#[test]
fn cohen_no_esta_definida_si_todos_dijeron_lo_mismo() {
    let pares = vec![(1, 1), (1, 1), (1, 1)];
    assert!(cohen(&pares).is_none());
}

/// Desacuerdo sistemático: peor que el azar, κ negativa.
#[test]
fn cohen_es_negativa_cuando_se_contradicen() {
    let pares = vec![(0, 1), (1, 0), (0, 1), (1, 0)];
    let k = cohen(&pares).unwrap();
    assert!(k < 0.0, "κ = {k}, se esperaba negativa");
    assert_eq!(interpretacion(k), "peor_que_azar");
}

// ─── κ de Fleiss ────────────────────────────────────────────────────────────

/// Ejemplo canónico de Fleiss (1971): 10 sujetos, 14 evaluadores, 5 categorías.
/// El valor publicado es κ = 0.2099.
#[test]
fn fleiss_da_el_valor_publicado_del_ejemplo_canonico() {
    let conteos: Vec<Vec<usize>> = vec![
        vec![0, 0, 0, 0, 14],
        vec![0, 2, 6, 4, 2],
        vec![0, 0, 3, 5, 6],
        vec![0, 3, 9, 2, 0],
        vec![2, 2, 8, 1, 1],
        vec![7, 7, 0, 0, 0],
        vec![3, 2, 6, 3, 0],
        vec![2, 5, 3, 2, 2],
        vec![6, 5, 2, 1, 0],
        vec![0, 2, 2, 3, 7],
    ];

    let k = fleiss(&conteos).expect("κ definida");
    assert!(cerca(k, 0.2099, 5e-4), "κ = {k}, se esperaba 0.2099");
}

/// Con un número distinto de evaluadores por ítem el estadístico no está
/// definido. Devolver algo sería inventarlo.
#[test]
fn fleiss_rechaza_filas_con_distinto_numero_de_evaluadores() {
    let conteos = vec![vec![2, 1], vec![1, 1]];
    assert!(fleiss(&conteos).is_none());
}

#[test]
fn fleiss_es_uno_con_acuerdo_perfecto() {
    let conteos = vec![vec![3, 0], vec![0, 3], vec![3, 0]];
    assert!(cerca(fleiss(&conteos).unwrap(), 1.0, 1e-12));
}

// ─── Intervalo de confianza ─────────────────────────────────────────────────

/// El intervalo tiene que contener al valor y repetirse: el mismo corpus dos
/// veces da el mismo intervalo, o el informe no se puede comparar consigo mismo.
#[test]
fn el_intervalo_contiene_el_valor_y_es_reproducible() {
    let pares: Vec<(i64, i64)> = (0..60)
        .map(|i| if i % 5 == 0 { (0, 1) } else { (i % 2, i % 2) })
        .collect();

    let k = cohen(&pares).unwrap();
    let (lo1, hi1) = ic_bootstrap(&pares, cohen, 400, 42).expect("IC");
    let (lo2, hi2) = ic_bootstrap(&pares, cohen, 400, 42).expect("IC");

    assert_eq!((lo1, hi1), (lo2, hi2), "el IC cambió entre ejecuciones");
    assert!(lo1 <= k && k <= hi1, "κ={k} fuera de [{lo1}, {hi1}]");
    assert!(hi1 - lo1 > 0.0, "intervalo de anchura cero");
}

/// Semillas distintas dan intervalos parecidos pero no idénticos: si fueran
/// idénticos, el remuestreo no estaría remuestreando.
#[test]
fn otra_semilla_da_otro_intervalo() {
    let pares: Vec<(i64, i64)> = (0..60)
        .map(|i| if i % 5 == 0 { (0, 1) } else { (i % 2, i % 2) })
        .collect();

    let a = ic_bootstrap(&pares, cohen, 300, 7).unwrap();
    let b = ic_bootstrap(&pares, cohen, 300, 99).unwrap();
    assert_ne!(a, b);
}

// ─── Solape ─────────────────────────────────────────────────────────────────

#[test]
fn iou_y_dice_sobre_cajas_conocidas() {
    let a = Caja {
        x: 0.0,
        y: 0.0,
        w: 10.0,
        h: 10.0,
    };
    let b = Caja {
        x: 5.0,
        y: 0.0,
        w: 10.0,
        h: 10.0,
    };

    // Intersección 50, unión 150.
    assert!(cerca(iou(&a, &b), 50.0 / 150.0, 1e-12));
    // Dice: 2·50 / (100 + 100).
    assert!(cerca(dice(&a, &b), 0.5, 1e-12));

    let lejos = Caja {
        x: 100.0,
        y: 100.0,
        w: 5.0,
        h: 5.0,
    };
    assert_eq!(iou(&a, &lejos), 0.0);
    assert_eq!(dice(&a, &lejos), 0.0);

    assert!(cerca(iou(&a, &a), 1.0, 1e-12));
}

fn bbox(id: &str, clase: i64, x: f64, y: f64, w: f64, h: f64) -> AnnotationEntry {
    AnnotationEntry {
        id: id.to_string(),
        annotation_type: "bbox".into(),
        class_id: clase,
        data: serde_json::json!({ "x": x, "y": y, "width": w, "height": h }),
        source: "user".into(),
        confidence: None,
        model_class_name: None,
        created_by: None,
        track_id: None,
        origin: Some("manual".into()),
        model_id: None,
        review: None,
        reviewed_by: None,
        reviewed_at: None,
        created_at: None,
        updated_at: None,
    }
}

/// Antes de comparar hay que decidir qué caja de una persona corresponde a cuál
/// de la otra. Se empareja por mayor solape.
#[test]
fn empareja_por_mayor_solape() {
    let a = vec![
        bbox("a1", 0, 0.0, 0.0, 10.0, 10.0),
        bbox("a2", 0, 100.0, 100.0, 10.0, 10.0),
    ];
    let b = vec![
        bbox("b1", 0, 98.0, 98.0, 10.0, 10.0),
        bbox("b2", 0, 1.0, 1.0, 10.0, 10.0),
    ];

    let m = emparejar(&a, &b, 0.1);
    assert_eq!(m.parejas.len(), 2);
    let p1 = m.parejas.iter().find(|p| p.id_a == "a1").unwrap();
    assert_eq!(p1.id_b, "b2", "emparejó con la caja lejana");
    assert!(m.solo_a.is_empty() && m.solo_b.is_empty());
}

/// Lo que una persona vio y la otra no es el desacuerdo más grande que hay:
/// tiene que bajar el acuerdo, no quedarse fuera de la cuenta.
#[test]
fn lo_que_vio_solo_uno_baja_el_acuerdo() {
    let a = vec![
        bbox("a1", 0, 0.0, 0.0, 10.0, 10.0),
        bbox("a2", 0, 50.0, 50.0, 10.0, 10.0),
    ];
    let b = vec![bbox("b1", 0, 0.0, 0.0, 10.0, 10.0)];

    let m = emparejar(&a, &b, 0.1);
    assert_eq!(m.parejas.len(), 1);
    assert_eq!(m.solo_a, vec!["a2".to_string()]);
    // Una pareja perfecta y una marca huérfana: 1/2.
    assert!(cerca(m.iou_medio(), 0.5, 1e-12));
}

/// Un solape perfecto con clases distintas es desacuerdo. Contarlo como acuerdo
/// escondería justo el problema que se quiere ver.
#[test]
fn el_mismo_objeto_con_clases_distintas_no_es_acuerdo() {
    let a = vec![bbox("a1", 0, 0.0, 0.0, 10.0, 10.0)];
    let b = vec![bbox("b1", 1, 0.0, 0.0, 10.0, 10.0)];

    let m = emparejar(&a, &b, 0.1);
    assert_eq!(m.parejas.len(), 1);
    assert!(!m.parejas[0].misma_clase);
    assert_eq!(m.iou_medio(), 0.0);
}

/// Dos personas que dicen «aquí no hay nada» están de acuerdo.
#[test]
fn dos_imagenes_vacias_estan_de_acuerdo() {
    let m = emparejar(&[], &[], 0.1);
    assert_eq!(m.iou_medio(), 1.0);
    assert_eq!(m.dice_medio(), 1.0);
}

/// La envolvente de una caja rotada no es su ancho y alto: si lo fuera, dos OBB
/// giradas se compararían mal sin que nada avisara.
#[test]
fn la_envolvente_de_una_obb_tiene_en_cuenta_el_giro() {
    let mut obb = bbox("o1", 0, 50.0, 50.0, 10.0, 10.0);
    obb.annotation_type = "obb".into();
    obb.data = serde_json::json!({
        "x": 50.0, "y": 50.0, "width": 10.0, "height": 10.0, "rotation": 45.0
    });

    let c = envolvente(&obb).expect("envolvente");
    // Un cuadrado de lado 10 girado 45° ocupa 10·√2 ≈ 14.14.
    assert!(cerca(c.w, 10.0 * 2f64.sqrt(), 1e-9), "ancho = {}", c.w);
    assert!(cerca(c.h, 10.0 * 2f64.sqrt(), 1e-9));
    // Y sigue centrada donde estaba.
    assert!(cerca(c.x + c.w / 2.0, 50.0, 1e-9));
}

/// Un polígono se compara por la envolvente de sus puntos.
#[test]
fn la_envolvente_de_un_poligono_cubre_sus_puntos() {
    let mut poly = bbox("p1", 0, 0.0, 0.0, 0.0, 0.0);
    poly.annotation_type = "polygon".into();
    poly.data = serde_json::json!({
        "points": [{"x": 10.0, "y": 20.0}, {"x": 30.0, "y": 25.0}, {"x": 20.0, "y": 40.0}]
    });

    let c = envolvente(&poly).expect("envolvente");
    assert!(cerca(c.x, 10.0, 1e-12) && cerca(c.y, 20.0, 1e-12));
    assert!(cerca(c.w, 20.0, 1e-12) && cerca(c.h, 20.0, 1e-12));
}

// ─── Bland-Altman ───────────────────────────────────────────────────────────

/// Un sesgo constante: las dos personas correlacionan perfectamente y no se
/// parecen en nada. Es el caso que una correlación escondería.
#[test]
fn bland_altman_detecta_el_sesgo_constante() {
    let pares: Vec<(f64, f64)> = (0..10).map(|i| (i as f64 + 10.0, i as f64)).collect();
    let r = bland_altman(&pares).expect("definido");

    assert!(cerca(r.sesgo, 10.0, 1e-12), "sesgo = {}", r.sesgo);
    assert!(cerca(r.sd, 0.0, 1e-12), "sd = {}", r.sd);
    assert!(cerca(r.limite_inferior, 10.0, 1e-9));
    assert!(cerca(r.limite_superior, 10.0, 1e-9));
}

/// Los límites son sesgo ± 1.96·sd, en las unidades de la medida.
#[test]
fn los_limites_de_acuerdo_son_sesgo_mas_menos_196_sd() {
    let pares = vec![(10.0, 8.0), (12.0, 12.0), (14.0, 10.0), (9.0, 11.0)];
    let r = bland_altman(&pares).unwrap();

    // Diferencias: 2, 0, 4, -2 → media 1, sd muestral = 2.582…
    assert!(cerca(r.sesgo, 1.0, 1e-12));
    assert!(cerca(r.sd, 2.581_988_897_471_611, 1e-9), "sd = {}", r.sd);
    assert!(cerca(r.limite_superior, 1.0 + 1.96 * r.sd, 1e-12));
    assert!(cerca(r.limite_inferior, 1.0 - 1.96 * r.sd, 1e-12));
}

/// Con una sola medida hay diferencia pero no dispersión: unos límites calculados
/// sobre un punto no dicen nada.
#[test]
fn bland_altman_no_se_calcula_con_una_sola_medida() {
    assert!(bland_altman(&[(1.0, 2.0)]).is_none());
}

// ─── Elección de métrica ────────────────────────────────────────────────────

/// Cada familia de proyecto tiene su métrica, y la elección no puede ser
/// distinta en el front y en el backend: darían dos números para la misma
/// pregunta.
#[test]
fn el_espejo_typescript_elige_la_misma_metrica() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("src/features/agreement/metricFamily.ts");
    let src =
        std::fs::read_to_string(&root).unwrap_or_else(|e| panic!("{}: {}", root.display(), e));

    for tipo in [
        "classification",
        "multi-label-classification",
        "bbox",
        "obb",
        "mask",
        "polygon",
        "instance-segmentation",
        "keypoints",
        "landmarks",
        "timeseries-classification",
        "event-detection",
        "anomaly-detection",
        "pattern-recognition",
        "timeseries-segmentation",
        "timeseries-regression",
        "timeseries-forecasting",
        "imputation",
    ] {
        let esperado = super::familia_de_metrica(tipo);
        let linea = format!("'{}': '{}'", tipo, esperado);
        assert!(
            src.contains(&linea),
            "el espejo TS no mapea {tipo} → {esperado}"
        );
    }
}
