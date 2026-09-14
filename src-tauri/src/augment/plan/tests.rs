//! Lo que hay que probar del plan es que sea reproducible, que no aumente lo que
//! no debe, y que lo generado lleve sus anotaciones encima.

use std::collections::BTreeMap;
use std::path::Path;

use image::{Rgba, RgbaImage};
use serde_json::json;
use tempfile::TempDir;

use super::*;
use crate::augment::transforms::Rango;
use crate::store::project_file::AnnotationEntry;

fn caja(class_id: i64, x: f64, y: f64, w: f64, h: f64) -> AnnotationEntry {
    AnnotationEntry {
        id: uuid::Uuid::new_v4().to_string(),
        annotation_type: "bbox".into(),
        class_id,
        data: json!({"x": x, "y": y, "width": w, "height": h}),
        source: "user".into(),
        confidence: None,
        model_class_name: None,
        created_by: None,
        track_id: None,
        origin: None,
        model_id: None,
        review: None,
        reviewed_by: None,
        reviewed_at: None,
        created_at: None,
        updated_at: None,
    }
}

/// Escribe una imagen de verdad: el plan abre archivos, así que un fixture en
/// memoria no probaría nada.
fn imagen_en_disco(dir: &Path, nombre: &str, anns: Vec<AnnotationEntry>) -> ImageEntry {
    let mut img = RgbaImage::from_pixel(64, 64, Rgba([30, 30, 30, 255]));
    for y in 10..30 {
        for x in 5..20 {
            img.put_pixel(x, y, Rgba([240, 40, 40, 255]));
        }
    }
    img.save(dir.join(nombre)).expect("se escribe la imagen");
    ImageEntry {
        id: format!("id-{nombre}"),
        name: nombre.to_string(),
        file: nombre.to_string(),
        width: 64,
        height: 64,
        uploaded: 1.0,
        annotated: None,
        status: "annotated".into(),
        annotations: anns,
        subject_id: Some("SUJ-1".into()),
        video_id: None,
        frame_index: None,
        is_background: false,
        locked_by: None,
        lock_expires: None,
        download_status: None,
        predictions: Vec::new(),
        medical: None,
        readings: Vec::new(),
        rejected: Vec::new(),
    }
}

fn entrada<'a>(images: &'a Path, destino: &'a Path) -> EntradaPlan<'a> {
    EntradaPlan {
        project_id: "proyecto-1",
        images_dir: images,
        destino,
        modalidad: None,
    }
}

fn plan_con_volteo(factor: u32) -> AugmentationPlan {
    AugmentationPlan {
        enabled: true,
        factor,
        transforms: vec![TransformSpec::FlipH { p: 1.0 }],
        ..AugmentationPlan::default()
    }
}

// ─── Sin plan ───────────────────────────────────────────────────────────────

#[test]
fn sin_augmentacion_las_imagenes_pasan_con_ruta_absoluta() {
    let tmp = TempDir::new().unwrap();
    let destino = tmp.path().join("aug");
    let img = imagen_en_disco(tmp.path(), "a.png", vec![caja(1, 5.0, 10.0, 15.0, 20.0)]);

    let r = materializar(
        &AugmentationPlan::default(),
        &entrada(tmp.path(), &destino),
        std::slice::from_ref(&img),
    )
    .unwrap();

    assert_eq!(r.imagenes.len(), 1);
    assert_eq!(r.generadas, 0);
    // Los preparadores resuelven con images_dir.join(file), y una ruta absoluta
    // gana: es lo que deja mezclar corpus y dataset generado sin tocarlos.
    assert_eq!(r.imagenes[0].file, tmp.path().join("a.png").to_string_lossy());
    assert!(!destino.exists(), "un plan apagado no crea directorios");
}

#[test]
fn un_factor_sin_transformaciones_no_escribe_nada() {
    // Veinte copias idénticas de la misma imagen no son augmentación.
    let tmp = TempDir::new().unwrap();
    let destino = tmp.path().join("aug");
    let img = imagen_en_disco(tmp.path(), "a.png", vec![caja(1, 5.0, 10.0, 15.0, 20.0)]);
    let plan = AugmentationPlan {
        enabled: true,
        factor: 20,
        ..AugmentationPlan::default()
    };
    assert!(!plan.hace_algo());
    let r = materializar(&plan, &entrada(tmp.path(), &destino), std::slice::from_ref(&img)).unwrap();
    assert_eq!(r.generadas, 0);
    assert_eq!(r.imagenes.len(), 1);
}

// ─── Determinismo ───────────────────────────────────────────────────────────

fn huella(r: &Materializado, destino: &Path) -> Vec<(String, u32, Vec<String>, String, u64)> {
    r.manifiesto
        .iter()
        .map(|reg| {
            let bytes = std::fs::read(destino.join(&reg.file)).unwrap_or_default();
            let suma = bytes.iter().fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(*b as u64));
            (
                reg.file.clone(),
                reg.variant,
                reg.transforms.clone(),
                reg.seed.clone(),
                suma,
            )
        })
        .collect()
}

#[test]
fn el_mismo_plan_y_la_misma_semilla_dan_el_mismo_dataset() {
    let tmp = TempDir::new().unwrap();
    let imgs = vec![
        imagen_en_disco(tmp.path(), "a.png", vec![caja(1, 5.0, 10.0, 15.0, 20.0)]),
        imagen_en_disco(tmp.path(), "b.png", vec![caja(2, 30.0, 30.0, 10.0, 10.0)]),
    ];
    let plan = AugmentationPlan {
        enabled: true,
        factor: 3,
        seed: Some(12345),
        transforms: vec![
            TransformSpec::FlipH { p: 0.5 },
            TransformSpec::Rotate { p: 0.7, degrees: Rango::simetrico(10.0) },
            TransformSpec::BrightnessContrast {
                p: 0.5,
                brightness: Rango::simetrico(0.2),
                contrast: Rango::simetrico(0.2),
            },
        ],
        ..AugmentationPlan::default()
    };

    let d1 = tmp.path().join("aug1");
    let d2 = tmp.path().join("aug2");
    let r1 = materializar(&plan, &entrada(tmp.path(), &d1), &imgs).unwrap();
    let r2 = materializar(&plan, &entrada(tmp.path(), &d2), &imgs).unwrap();
    assert!(r1.generadas > 0);
    assert_eq!(huella(&r1, &d1), huella(&r2, &d2));

    // Y otra semilla da otro dataset, o la semilla no serviría de nada.
    let otro = AugmentationPlan { seed: Some(999), ..plan.clone() };
    let d3 = tmp.path().join("aug3");
    let r3 = materializar(&otro, &entrada(tmp.path(), &d3), &imgs).unwrap();
    assert_ne!(huella(&r1, &d1), huella(&r3, &d3));
}

#[test]
fn las_variantes_de_una_imagen_no_dependen_de_las_demas() {
    // La semilla de cada variante se mezcla con el id de su imagen: añadir una
    // imagen al corpus no puede cambiar lo que salía de las otras.
    let tmp = TempDir::new().unwrap();
    let a = imagen_en_disco(tmp.path(), "a.png", vec![caja(1, 5.0, 10.0, 15.0, 20.0)]);
    let b = imagen_en_disco(tmp.path(), "b.png", vec![caja(1, 6.0, 11.0, 15.0, 20.0)]);
    let plan = AugmentationPlan {
        enabled: true,
        factor: 2,
        seed: Some(7),
        transforms: vec![TransformSpec::Rotate { p: 0.6, degrees: Rango::simetrico(15.0) }],
        ..AugmentationPlan::default()
    };

    let d1 = tmp.path().join("solo");
    let d2 = tmp.path().join("con_b");
    let solo = materializar(&plan, &entrada(tmp.path(), &d1), std::slice::from_ref(&a)).unwrap();
    let con_b = materializar(&plan, &entrada(tmp.path(), &d2), &[a.clone(), b]).unwrap();

    let de_a = |r: &Materializado| -> Vec<(String, String)> {
        r.manifiesto
            .iter()
            .filter(|reg| reg.source_image_id == a.id)
            .map(|reg| (reg.file.clone(), reg.seed.clone()))
            .collect()
    };
    assert_eq!(de_a(&solo), de_a(&con_b));
}

// ─── Las anotaciones ────────────────────────────────────────────────────────

#[test]
fn la_anotacion_se_mueve_con_la_variante() {
    let tmp = TempDir::new().unwrap();
    let destino = tmp.path().join("aug");
    let img = imagen_en_disco(tmp.path(), "a.png", vec![caja(1, 5.0, 10.0, 15.0, 20.0)]);
    let r = materializar(&plan_con_volteo(1), &entrada(tmp.path(), &destino), std::slice::from_ref(&img)).unwrap();

    let generada = r
        .imagenes
        .iter()
        .find(|i| i.name.contains("__aug"))
        .expect("se generó una variante");
    let data = &generada.annotations[0].data;
    // 64 − (5 + 15) = 44.
    assert_eq!(data["x"], json!(44.0));
    assert_eq!(data["width"], json!(15.0));
    assert!(destino.join(&generada.name).exists());
    assert_eq!(generada.file, destino.join(&generada.name).to_string_lossy());
    // El sujeto viaja con la variante: si alguien vuelve a repartir, no se
    // separa de su original.
    assert_eq!(generada.subject_id.as_deref(), Some("SUJ-1"));
    assert_ne!(generada.id, img.id);
}

#[test]
fn una_variante_que_pierde_todas_sus_anotaciones_no_entra() {
    let tmp = TempDir::new().unwrap();
    let destino = tmp.path().join("aug");
    let img = imagen_en_disco(tmp.path(), "a.png", vec![caja(1, 2.0, 2.0, 10.0, 10.0)]);
    let plan = AugmentationPlan {
        enabled: true,
        factor: 3,
        seed: Some(1),
        // Un desplazamiento que se lleva la caja fuera del marco.
        transforms: vec![TransformSpec::Translate {
            p: 1.0,
            x: Rango::fijo(0.9),
            y: Rango::fijo(0.9),
        }],
        ..AugmentationPlan::default()
    };
    let r = materializar(&plan, &entrada(tmp.path(), &destino), std::slice::from_ref(&img)).unwrap();
    assert_eq!(r.generadas, 0, "una imagen sin etiquetas entraría como fondo");
    assert_eq!(r.imagenes.len(), 1);
}

#[test]
fn un_tipo_que_no_se_sabe_mover_deja_la_imagen_sin_tocar() {
    let tmp = TempDir::new().unwrap();
    let destino = tmp.path().join("aug");
    let mut rara = caja(1, 5.0, 5.0, 10.0, 10.0);
    rara.annotation_type = "cubo-3d".into();
    let img = imagen_en_disco(tmp.path(), "a.png", vec![rara]);

    let r = materializar(&plan_con_volteo(2), &entrada(tmp.path(), &destino), std::slice::from_ref(&img)).unwrap();
    assert_eq!(r.generadas, 0);
    assert_eq!(r.imagenes.len(), 1);
    assert!(r
        .avisos
        .iter()
        .any(|a| a.code == "tipo_de_anotacion_sin_augmentacion" && a.detail.as_deref() == Some("cubo-3d")));
}

// ─── Teselado ───────────────────────────────────────────────────────────────

#[test]
fn el_teselado_parte_la_imagen_y_las_variantes_salen_de_las_teselas() {
    let tmp = TempDir::new().unwrap();
    let destino = tmp.path().join("aug");
    // Cuatro cajas, una por cuadrante, para que ninguna tesela quede vacía.
    let img = imagen_en_disco(
        tmp.path(),
        "a.png",
        vec![
            caja(1, 4.0, 4.0, 8.0, 8.0),
            caja(1, 44.0, 4.0, 8.0, 8.0),
            caja(1, 4.0, 44.0, 8.0, 8.0),
            caja(1, 44.0, 44.0, 8.0, 8.0),
        ],
    );
    let plan = AugmentationPlan {
        enabled: true,
        factor: 1,
        seed: Some(3),
        transforms: vec![TransformSpec::FlipH { p: 1.0 }],
        tiling: Some(TilingSpec {
            rows: 2,
            cols: 2,
            overlap: 0.1,
            ..TilingSpec::default()
        }),
        ..AugmentationPlan::default()
    };
    let r = materializar(&plan, &entrada(tmp.path(), &destino), std::slice::from_ref(&img)).unwrap();

    // Cuatro teselas + una variante de cada una. La imagen original ya no entra:
    // la sustituyen sus teselas.
    assert_eq!(r.generadas, 8);
    assert_eq!(r.imagenes.len(), 8);
    assert!(r.imagenes.iter().all(|i| i.subject_id.as_deref() == Some("SUJ-1")));
    assert!(r.imagenes.iter().all(|i| i.width < 64 && i.height < 64));

    let teselas = r.manifiesto.iter().filter(|reg| reg.variant == 0).count();
    assert_eq!(teselas, 4);
    let con_tesela = r.manifiesto.iter().filter(|reg| reg.tile.is_some()).count();
    assert_eq!(con_tesela, 8, "las variantes registran de qué tesela salieron");
    for reg in &r.manifiesto {
        assert_eq!(reg.source_image_id, img.id);
        assert!(destino.join(&reg.file).exists());
    }
}

// ─── Factores ───────────────────────────────────────────────────────────────

fn imagenes_con(conteos: &[(i64, usize)]) -> Vec<ImageEntry> {
    let mut anns = Vec::new();
    for &(clase, n) in conteos {
        for _ in 0..n {
            anns.push(caja(clase, 1.0, 1.0, 2.0, 2.0));
        }
    }
    vec![ImageEntry {
        id: "x".into(),
        name: "x.png".into(),
        file: "x.png".into(),
        width: 10,
        height: 10,
        uploaded: 0.0,
        annotated: None,
        status: "annotated".into(),
        annotations: anns,
        subject_id: None,
        video_id: None,
        frame_index: None,
        is_background: false,
        locked_by: None,
        lock_expires: None,
        download_status: None,
        predictions: Vec::new(),
        medical: None,
        readings: Vec::new(),
        rejected: Vec::new(),
    }]
}

#[test]
fn el_modo_uniforme_da_el_mismo_factor_a_todas() {
    let imgs = imagenes_con(&[(1, 400), (2, 12)]);
    let plan = AugmentationPlan { factor: 3, ..AugmentationPlan::default() };
    let f = factores_por_clase(&plan, &imgs);
    assert_eq!(f.get(&1), Some(&3));
    assert_eq!(f.get(&2), Some(&3));
}

#[test]
fn el_modo_equilibrar_acerca_la_clase_rara_a_la_mayoritaria() {
    // 400 «normal» y 12 «lesión rara»: sin equilibrar, el modelo dice normal
    // siempre y acierta el 97 %.
    let imgs = imagenes_con(&[(1, 400), (2, 12)]);
    let plan = AugmentationPlan {
        balance: BalanceMode::Balance,
        max_factor: 50,
        ..AugmentationPlan::default()
    };
    let f = factores_por_clase(&plan, &imgs);
    assert_eq!(f.get(&1), Some(&0), "la mayoritaria no se multiplica");
    // 400 / 12 = 34 (redondeando hacia arriba), menos el original.
    assert_eq!(f.get(&2), Some(&33));
}

#[test]
fn el_tope_impide_que_dos_ejemplos_generen_doscientas_variantes() {
    let imgs = imagenes_con(&[(1, 400), (2, 2)]);
    let plan = AugmentationPlan {
        balance: BalanceMode::Balance,
        max_factor: 10,
        ..AugmentationPlan::default()
    };
    assert_eq!(factores_por_clase(&plan, &imgs).get(&2), Some(&10));
}

#[test]
fn el_modo_manual_respeta_lo_que_puso_el_usuario() {
    let imgs = imagenes_con(&[(1, 10), (2, 10)]);
    let plan = AugmentationPlan {
        balance: BalanceMode::Manual,
        factor: 1,
        per_class_factor: BTreeMap::from([(2, 7)]),
        ..AugmentationPlan::default()
    };
    let f = factores_por_clase(&plan, &imgs);
    assert_eq!(f.get(&1), Some(&1), "lo que no se declaró usa el factor general");
    assert_eq!(f.get(&2), Some(&7));
}

#[test]
fn una_imagen_con_dos_clases_se_multiplica_por_la_mas_rara() {
    // Tomar la menor dejaría la clase rara sin multiplicar cada vez que comparte
    // imagen con una común, que es casi siempre.
    let mut img = imagenes_con(&[(1, 1), (2, 1)]).remove(0);
    img.annotations.truncate(2);
    let factores = BTreeMap::from([(1, 0u32), (2, 9u32)]);
    assert_eq!(factor_de_imagen(&img, &factores, 1), 9);
}

// ─── Avisos ─────────────────────────────────────────────────────────────────

#[test]
fn multiplicar_una_clase_con_dos_ejemplos_se_avisa() {
    // Multiplicar por 20 una clase con 2 ejemplos no crea 22 casos: crea 2
    // casos vistos 20 veces.
    let imgs = imagenes_con(&[(1, 400), (2, 2)]);
    let plan = AugmentationPlan {
        enabled: true,
        balance: BalanceMode::Balance,
        max_factor: 20,
        ..AugmentationPlan::default()
    };
    let avisos = avisos_de_balance(&plan, &imgs);
    assert!(avisos
        .iter()
        .any(|a| a.code == "clase_con_pocos_ejemplos_multiplicada" && a.kind == "evidencia"));
    assert_eq!(avisos.len(), 1, "la clase de 400 no tiene por qué avisar");
}

#[test]
fn el_volteo_en_una_modalidad_lateralizada_es_aviso_de_correccion() {
    let plan = plan_con_volteo(1);
    let avisos = plan.avisos_de_modalidad(Some("CR"));
    assert!(avisos
        .iter()
        .any(|a| a.code == "volteo_en_modalidad_lateralizada" && a.kind == "correccion"));
    // En microscopía el campo es arbitrario y el volteo no dice nada malo.
    assert!(plan.avisos_de_modalidad(Some("SM")).is_empty());
    assert!(plan.avisos_de_modalidad(None).is_empty());
}

#[test]
fn activar_el_teselado_avisa_de_que_la_inferencia_tambien_va_por_teselas() {
    // Sin esto, alguien entrena un modelo que no sabrá usar.
    let plan = AugmentationPlan {
        enabled: true,
        tiling: Some(TilingSpec::default()),
        ..AugmentationPlan::default()
    };
    assert!(plan
        .avisos_de_modalidad(None)
        .iter()
        .any(|a| a.code == "teselado_exige_inferencia_por_teselas"));
}

// ─── Persistencia ───────────────────────────────────────────────────────────

#[test]
fn el_plan_viaja_por_json_con_la_semilla_como_texto() {
    let plan = AugmentationPlan {
        enabled: true,
        seed: Some(11_400_714_819_323_198_485),
        transforms: vec![TransformSpec::FlipH { p: 0.5 }],
        tiling: Some(TilingSpec::default()),
        ..AugmentationPlan::default()
    };
    let texto = serde_json::to_string(&plan).unwrap();
    assert!(
        texto.contains("\"seed\":\"11400714819323198485\""),
        "la semilla pasa de 2^53 y como número JSON.parse la redondearía: {texto}"
    );
    assert!(texto.contains("\"minVisibility\""), "{texto}");
    assert_eq!(serde_json::from_str::<AugmentationPlan>(&texto).unwrap(), plan);
}

#[test]
fn una_configuracion_imposible_se_rechaza() {
    let plan = AugmentationPlan {
        min_visibility: 1.5,
        ..AugmentationPlan::default()
    };
    assert!(plan.validar().is_err());
    let tmp = TempDir::new().unwrap();
    assert!(materializar(&plan, &entrada(tmp.path(), tmp.path()), &[]).is_err());
}

// ─── Qué queda ya aplicado ──────────────────────────────────────────────────

#[test]
fn los_ejes_materializados_se_traducen_a_los_de_ultralytics() {
    // La traducción vive en un solo sitio: la leen el generador de YOLO y el de
    // smp. Dos tablas equivalentes en dos archivos se separan.
    let ids: Vec<String> = ["flip_h", "rotate", "brightness_contrast", "grayscale"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let ejes = ejes_materializados(&ids);
    assert!(ejes.contains("fliplr"));
    assert!(ejes.contains("degrees"));
    assert!(ejes.contains("hsv_v"));
    // La escala de grises no tiene equivalente en ultralytics: no hay nada que
    // apagar, y apagar algo «parecido» sería inventar.
    assert_eq!(ejes.len(), 3, "{ejes:?}");
    assert!(ejes_materializados(&[]).is_empty());
}
