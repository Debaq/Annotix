//! Lo que decide si el teselado sirve no es que parta la imagen: es que un
//! objeto de la frontera siga estando entero en alguna parte.

use image::{Rgba, RgbaImage};
use rand::rngs::StdRng;
use rand::SeedableRng;
use serde_json::json;

use super::*;
use crate::store::project_file::AnnotationEntry;

fn rng(semilla: u64) -> StdRng {
    StdRng::seed_from_u64(semilla)
}

fn spec(rows: u32, cols: u32, overlap: f64) -> TilingSpec {
    TilingSpec {
        rows,
        cols,
        overlap,
        ..TilingSpec::default()
    }
}

fn caja(id: &str, x: f64, y: f64, w: f64, h: f64) -> AnnotationEntry {
    AnnotationEntry {
        id: id.into(),
        annotation_type: "bbox".into(),
        class_id: 1,
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

fn imagen_entry(anns: Vec<AnnotationEntry>) -> ImageEntry {
    ImageEntry {
        id: "img-1".into(),
        name: "lámina".into(),
        file: "lamina.jpg".into(),
        width: 4000,
        height: 3000,
        uploaded: 1.0,
        annotated: Some(2.0),
        status: "annotated".into(),
        annotations: anns,
        subject_id: Some("SUJ-007".into()),
        video_id: None,
        frame_index: None,
        is_background: false,
        locked_by: Some("alguien".into()),
        lock_expires: Some(99.0),
        download_status: None,
        predictions: Vec::new(),
        medical: None,
        readings: Vec::new(),
        rejected: Vec::new(),
    }
}

// ─── La rejilla ─────────────────────────────────────────────────────────────

#[test]
fn una_sola_tesela_es_la_imagen_entera() {
    let t = rejilla(4000.0, 3000.0, &spec(1, 1, 0.15));
    assert_eq!(t.len(), 1);
    assert_eq!(t[0].rect, Rect::nuevo(0.0, 0.0, 4000.0, 3000.0));
}

#[test]
fn la_rejilla_cubre_la_imagen_de_borde_a_borde() {
    let s = spec(3, 4, 0.15);
    let t = rejilla(4000.0, 3000.0, &s);
    assert_eq!(t.len(), 12);
    let primera = t.first().unwrap().rect;
    let ultima = t.last().unwrap().rect;
    assert_eq!((primera.x, primera.y), (0.0, 0.0));
    assert!((ultima.x + ultima.ancho - 4000.0).abs() < 1e-9);
    assert!((ultima.y + ultima.alto - 3000.0).abs() < 1e-9);
    // Doce teselas de ~1127×1111: 4000 / (1 + 3·0.85) y 3000 / (1 + 2·0.85).
    assert!((primera.ancho - 1126.76).abs() < 0.5, "{}", primera.ancho);
    assert!((primera.alto - 1111.11).abs() < 0.5, "{}", primera.alto);
}

#[test]
fn el_solape_es_la_fraccion_pedida_del_lado() {
    let s = spec(1, 4, 0.2);
    let t = rejilla(1000.0, 100.0, &s);
    let a = t[0].rect;
    let b = t[1].rect;
    let solape = (a.x + a.ancho) - b.x;
    assert!((solape / a.ancho - 0.2).abs() < 1e-9, "solape {solape} de {}", a.ancho);
}

#[test]
fn sin_solape_las_teselas_no_se_pisan() {
    let t = rejilla(400.0, 100.0, &spec(1, 4, 0.0));
    for par in t.windows(2) {
        assert!((par[0].rect.x + par[0].rect.ancho - par[1].rect.x).abs() < 1e-9);
    }
    assert!((t[0].rect.ancho - 100.0).abs() < 1e-9);
}

#[test]
fn una_configuracion_imposible_se_rechaza_en_vez_de_producir_basura() {
    assert!(spec(0, 3, 0.1).validar().is_err());
    assert!(spec(2, 2, 0.6).validar().is_err());
    assert!(spec(2, 2, -0.1).validar().is_err());
    assert!(TilingSpec {
        empty_keep_ratio: 1.5,
        ..TilingSpec::default()
    }
    .validar()
    .is_err());
    assert!(rejilla(100.0, 100.0, &spec(2, 2, 0.9)).is_empty());
    assert!(rejilla(0.0, 100.0, &spec(2, 2, 0.1)).is_empty());
}

// ─── Las anotaciones ────────────────────────────────────────────────────────

#[test]
fn un_objeto_en_la_frontera_aparece_entero_en_alguna_tesela() {
    // Dos columnas con 20 % de solape sobre 1000 px: la frontera de la primera
    // cae en 555 y la segunda empieza en 444. Un objeto de 60 px a caballo de
    // los 540 queda partido en la rejilla sin solape y entero en la segunda.
    let s = spec(1, 2, 0.2);
    let t = rejilla(1000.0, 200.0, &s);
    let objeto = caja("o", 540.0, 50.0, 60.0, 60.0);

    let enteras = t
        .iter()
        .filter_map(|tes| {
            let r = anotaciones_de_tesela(std::slice::from_ref(&objeto), tes, 0.3);
            r.anotaciones.first().map(|a| {
                (
                    a.data["width"].as_f64().unwrap(),
                    a.data["height"].as_f64().unwrap(),
                )
            })
        })
        .filter(|&(w, h)| (w - 60.0).abs() < 1e-6 && (h - 60.0).abs() < 1e-6)
        .count();
    assert!(enteras >= 1, "el objeto de la frontera no quedó entero en ninguna tesela");
}

#[test]
fn lo_que_queda_por_debajo_del_minimo_se_descarta_en_esa_tesela() {
    let s = spec(1, 2, 0.2);
    let t = rejilla(1000.0, 200.0, &s);
    // Un objeto que asoma un 10 % en la primera tesela y está entero en la
    // segunda: el fragmento se descarta, el objeto no se pierde.
    let objeto = caja("o", 500.0, 50.0, 600.0, 60.0);
    let primera = anotaciones_de_tesela(std::slice::from_ref(&objeto), &t[0], 0.3);
    assert_eq!(primera.anotaciones.len(), 0);
    assert_eq!(primera.descartadas, 1);

    let generoso = anotaciones_de_tesela(std::slice::from_ref(&objeto), &t[0], 0.05);
    assert_eq!(generoso.anotaciones.len(), 1);
}

#[test]
fn las_coordenadas_quedan_relativas_a_la_tesela() {
    let t = rejilla(400.0, 400.0, &spec(2, 2, 0.0));
    let ultima = t.last().unwrap();
    assert_eq!(ultima.rect, Rect::nuevo(200.0, 200.0, 200.0, 200.0));
    let objeto = caja("o", 250.0, 260.0, 40.0, 30.0);
    let r = anotaciones_de_tesela(std::slice::from_ref(&objeto), ultima, 0.3);
    let a = &r.anotaciones[0];
    assert_eq!(a.data["x"], json!(50.0));
    assert_eq!(a.data["y"], json!(60.0));
    assert_eq!(a.data["width"], json!(40.0));
}

#[test]
fn un_tipo_que_la_geometria_no_sabe_mover_se_cuenta_aparte() {
    // No se descarta en silencio: con uno solo, la imagen no se debería
    // teselar, y quien llama necesita poder verlo.
    let mut raro = caja("o", 10.0, 10.0, 10.0, 10.0);
    raro.annotation_type = "cubo-3d".into();
    let t = rejilla(100.0, 100.0, &spec(1, 1, 0.0));
    let r = anotaciones_de_tesela(std::slice::from_ref(&raro), &t[0], 0.3);
    assert_eq!(r.no_soportadas, 1);
    assert_eq!(r.descartadas, 0);
    assert!(r.anotaciones.is_empty());
}

// ─── Teselas vacías ─────────────────────────────────────────────────────────

#[test]
fn la_politica_de_vacias_se_respeta() {
    let mut g = rng(3);
    let descartar = TilingSpec {
        empty_tiles: EmptyTilePolicy::Discard,
        ..TilingSpec::default()
    };
    let todas = TilingSpec {
        empty_tiles: EmptyTilePolicy::KeepAll,
        ..TilingSpec::default()
    };
    assert!((0..50).all(|_| !conservar_vacia(&descartar, &mut g)));
    assert!((0..50).all(|_| conservar_vacia(&todas, &mut g)));

    // Con fracción, la proporción se acerca a lo pedido. Es lo que impide que
    // el dataset se inunde de fondo: en una lámina el 95 % es tejido sano.
    let fraccion = TilingSpec {
        empty_tiles: EmptyTilePolicy::KeepFraction,
        empty_keep_ratio: 0.1,
        ..TilingSpec::default()
    };
    let conservadas = (0..2000).filter(|_| conservar_vacia(&fraccion, &mut g)).count();
    assert!(
        (150..=250).contains(&conservadas),
        "salieron {conservadas} de 2000, y se pedía ~200"
    );
}

// ─── La entrada derivada ────────────────────────────────────────────────────

#[test]
fn la_tesela_hereda_el_sujeto_y_registra_de_donde_salio() {
    let origen = imagen_entry(vec![caja("a", 10.0, 10.0, 5.0, 5.0)]);
    let t = rejilla(4000.0, 3000.0, &spec(3, 4, 0.15));
    let tesela = t[5];
    let (entrada, proc) = derivar_entrada(&origen, &tesela, vec![caja("a", 1.0, 1.0, 5.0, 5.0)]);

    // Sin el sujeto, doce teselas del mismo paciente se reparten entre train y
    // test y la métrica mide memoria.
    assert_eq!(entrada.subject_id.as_deref(), Some("SUJ-007"));
    assert_eq!(proc.subject_id.as_deref(), Some("SUJ-007"));
    assert_eq!(proc.source_image_id, "img-1");
    assert_eq!(proc.source_file, "lamina.jpg");
    assert_eq!((proc.row, proc.col), (1, 1));
    assert_eq!(entrada.file, "lamina__r1c1.png");
    // `name` es el nombre del archivo porque es lo que los preparadores usan
    // como destino dentro del dataset.
    assert_eq!(entrada.name, entrada.file);
    assert_eq!(proc.tile_file, entrada.file);
    assert_eq!(entrada.width, tesela.rect.ancho.round() as u32);

    // Lo que describe el trabajo sobre el corpus no se arrastra al artefacto.
    assert!(entrada.readings.is_empty() && entrada.rejected.is_empty());
    assert!(entrada.locked_by.is_none() && entrada.lock_expires.is_none());
    assert_ne!(entrada.id, origen.id);
}

#[test]
fn una_tesela_sin_anotaciones_es_un_fondo_de_verdad() {
    // El recorte se miró entero: no es una imagen que nadie anotó todavía, y
    // esa diferencia decide si el preparador la deja entrar como negativo.
    let origen = imagen_entry(vec![]);
    let t = rejilla(100.0, 100.0, &spec(1, 1, 0.0));
    let (entrada, _) = derivar_entrada(&origen, &t[0], vec![]);
    assert!(entrada.is_background);
}

// ─── El recorte ─────────────────────────────────────────────────────────────

#[test]
fn el_recorte_se_lleva_los_pixeles_de_su_sitio() {
    let mut img = RgbaImage::from_pixel(100, 100, Rgba([0, 0, 0, 255]));
    img.put_pixel(55, 65, Rgba([255, 0, 0, 255]));
    let recorte = recortar_imagen(&img, &Rect::nuevo(50.0, 60.0, 20.0, 20.0));
    assert_eq!(recorte.dimensions(), (20, 20));
    assert_eq!(recorte.get_pixel(5, 5).0, [255, 0, 0, 255]);
    assert_eq!(recorte.get_pixel(0, 0).0, [0, 0, 0, 255]);
}

#[test]
fn un_recorte_que_se_sale_no_revienta() {
    let img = RgbaImage::from_pixel(10, 10, Rgba([1, 2, 3, 255]));
    let recorte = recortar_imagen(&img, &Rect::nuevo(8.0, 8.0, 5.0, 5.0));
    assert_eq!(recorte.dimensions(), (5, 5));
    assert_eq!(recorte.get_pixel(0, 0).0, [1, 2, 3, 255]);
    assert_eq!(recorte.get_pixel(4, 4).0, [0, 0, 0, 0]);
}
