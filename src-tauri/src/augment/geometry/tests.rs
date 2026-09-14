//! Lo que estos tests deciden no es que la transformación genere imágenes: es
//! que las anotaciones sigan encima de lo que marcan.

use image::{Rgba, RgbaImage};
use serde_json::json;

use super::*;
use crate::store::project_file::AnnotationEntry;

const TOL: f64 = 1e-6;

fn ann(tipo: &str, data: serde_json::Value) -> AnnotationEntry {
    AnnotationEntry {
        id: "a1".into(),
        annotation_type: tipo.into(),
        class_id: 1,
        data,
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

fn conservada(r: ResultadoAnotacion) -> AnnotationEntry {
    match r {
        ResultadoAnotacion::Conservada(a) => *a,
        otro => panic!("se esperaba conservada, salió {:?}", otro),
    }
}

fn cerca(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol
}

// ─── Matriz ─────────────────────────────────────────────────────────────────

#[test]
fn identidad_no_mueve_nada() {
    let p = Afin::identidad().aplicar((3.0, 7.0));
    assert_eq!(p, (3.0, 7.0));
}

#[test]
fn luego_aplica_en_el_orden_de_lectura() {
    // Escalar ×2 y después desplazar +10 no es lo mismo que desplazar y escalar.
    let t = Afin::escala(2.0, 2.0).luego(&Afin::traslacion(10.0, 0.0));
    assert_eq!(t.aplicar((1.0, 0.0)), (12.0, 0.0));

    let otro = Afin::traslacion(10.0, 0.0).luego(&Afin::escala(2.0, 2.0));
    assert_eq!(otro.aplicar((1.0, 0.0)), (22.0, 0.0));
}

#[test]
fn inversa_deshace() {
    let t = Afin::rotacion_en(37.0, 50.0, 40.0)
        .luego(&Afin::escala(1.5, 0.8))
        .luego(&Afin::traslacion(-12.0, 4.0));
    let inv = t.inversa().expect("la transformación es invertible");
    let (x, y) = inv.aplicar(t.aplicar((11.0, 23.0)));
    assert!(cerca(x, 11.0, 1e-9) && cerca(y, 23.0, 1e-9));
}

#[test]
fn el_espejo_se_detecta_por_el_determinante() {
    assert!(Afin::espejo_h(100.0).es_espejo());
    assert!(Afin::espejo_v(100.0).es_espejo());
    assert!(!Afin::rotacion_grados(90.0).es_espejo());
    // Dos espejos vuelven a conservar la orientación.
    assert!(!Afin::espejo_h(100.0).luego(&Afin::espejo_v(100.0)).es_espejo());
}

#[test]
fn solo_la_cizalla_rompe_los_angulos_rectos() {
    assert!(Afin::rotacion_grados(33.0).conserva_rectangulos());
    assert!(Afin::espejo_h(50.0).conserva_rectangulos());
    assert!(Afin::escala(2.0, 0.5).conserva_rectangulos());
    assert!(!Afin::cizalla_grados(15.0, 0.0).conserva_rectangulos());
}

// ─── Ida y vuelta ───────────────────────────────────────────────────────────

#[test]
fn rotar_90_cuatro_veces_devuelve_la_anotacion_a_su_sitio() {
    let a = ann(
        "bbox",
        json!({"x": 12.0, "y": 30.0, "width": 20.0, "height": 8.0}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let giro = Afin::rotacion_en(90.0, 50.0, 50.0);

    let mut actual = a.clone();
    for _ in 0..4 {
        actual = conservada(transformar_anotacion(&actual, &giro, &marco, 0.3));
    }
    for clave in ["x", "y", "width", "height"] {
        let antes = a.data[clave].as_f64().unwrap();
        let despues = actual.data[clave].as_f64().unwrap();
        assert!(
            cerca(antes, despues, 1.0),
            "{clave}: {antes} → {despues} tras cuatro giros de 90°"
        );
    }
}

#[test]
fn voltear_dos_veces_devuelve_la_anotacion_a_su_sitio() {
    let a = ann(
        "polygon",
        json!({"points": [{"x": 10.0, "y": 10.0}, {"x": 40.0, "y": 12.0}, {"x": 30.0, "y": 50.0}]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let flip = Afin::espejo_h(100.0);
    let una = conservada(transformar_anotacion(&a, &flip, &marco, 0.3));
    let dos = conservada(transformar_anotacion(&una, &flip, &marco, 0.3));

    let antes = puntos_de(&a.data, "points").unwrap();
    let despues = puntos_de(&dos.data, "points").unwrap();
    assert_eq!(antes.len(), despues.len());
    for (p, q) in antes.iter().zip(despues.iter()) {
        assert!(cerca(p.0, q.0, TOL) && cerca(p.1, q.1, TOL), "{p:?} vs {q:?}");
    }
}

// ─── La anotación sigue al píxel ────────────────────────────────────────────

/// Cuadrado opaco sobre fondo transparente, en la posición pedida.
fn imagen_con_cuadrado(w: u32, h: u32, r: &Rect) -> RgbaImage {
    let mut img = RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 0]));
    for y in (r.y as u32)..((r.y + r.alto) as u32) {
        for x in (r.x as u32)..((r.x + r.ancho) as u32) {
            img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
        }
    }
    img
}

fn envolvente_opaca(img: &RgbaImage) -> Rect {
    let mut puntos = Vec::new();
    for (x, y, p) in img.enumerate_pixels() {
        if p[3] > 128 {
            puntos.push((x as f64, y as f64));
            puntos.push((x as f64 + 1.0, y as f64 + 1.0));
        }
    }
    Rect::envolvente(&puntos).expect("la imagen tiene píxeles opacos")
}

#[test]
fn la_caja_sigue_al_cuadrado_bajo_giro_y_espejo() {
    // Rectángulo asimétrico: uno cuadrado y centrado no distingue un eje del otro.
    let caja = Rect::nuevo(20.0, 60.0, 20.0, 12.0);
    let img = imagen_con_cuadrado(100.0 as u32, 100, &caja);

    for t in [
        Afin::rotacion_en(90.0, 50.0, 50.0),
        Afin::espejo_h(100.0),
        Afin::espejo_v(100.0),
        Afin::rotacion_en(180.0, 50.0, 50.0),
    ] {
        let movida = warp_mascara(&img, &t, 100, 100).expect("invertible");
        let real = envolvente_opaca(&movida);
        let predicha = transformar_rect(&caja, &t);
        for (nombre, a, b) in [
            ("x", real.x, predicha.x),
            ("y", real.y, predicha.y),
            ("ancho", real.ancho, predicha.ancho),
            ("alto", real.alto, predicha.alto),
        ] {
            assert!(
                cerca(a, b, 1.0),
                "{nombre}: los píxeles dicen {a}, la caja dice {b}"
            );
        }
    }
}

// ─── bbox ───────────────────────────────────────────────────────────────────

#[test]
fn el_giro_engorda_la_caja_eje_alineada() {
    // Es la pérdida conocida de rotar una bbox: la envolvente de un rectángulo
    // girado 45° es mayor que él. El test la fija para que nadie la "arregle"
    // en silencio recortando la caja al objeto, que sería peor.
    let r = Rect::nuevo(40.0, 40.0, 20.0, 10.0);
    let girada = transformar_rect(&r, &Afin::rotacion_en(45.0, 50.0, 45.0));
    assert!(girada.ancho > r.ancho && girada.alto > r.alto);
    assert!(cerca(girada.ancho, girada.alto, TOL));
}

#[test]
fn una_caja_medio_fuera_se_recorta_y_una_casi_fuera_se_descarta() {
    let marco = Rect::marco(100.0, 100.0);
    let a = ann(
        "bbox",
        json!({"x": 90.0, "y": 10.0, "width": 20.0, "height": 10.0}),
    );
    // La mitad dentro: sobrevive recortada al marco.
    let media = conservada(transformar_anotacion(&a, &Afin::identidad(), &marco, 0.3));
    assert!(cerca(media.data["x"].as_f64().unwrap(), 90.0, TOL));
    assert!(cerca(media.data["width"].as_f64().unwrap(), 10.0, TOL));

    // Con un mínimo del 60 % ya no llega.
    assert!(matches!(
        transformar_anotacion(&a, &Afin::identidad(), &marco, 0.6),
        ResultadoAnotacion::Descartada
    ));
}

// ─── OBB ────────────────────────────────────────────────────────────────────

#[test]
fn el_obb_conserva_la_orientacion_al_girar() {
    let o = Obb {
        cx: 50.0,
        cy: 50.0,
        ancho: 30.0,
        alto: 10.0,
        rotacion_grados: 20.0,
    };
    let tr = transformar_obb(&o, &Afin::rotacion_en(25.0, 50.0, 50.0)).unwrap();
    assert!(tr.exacta);
    assert!(cerca(tr.obb.rotacion_grados, 45.0, 1e-6));
    assert!(cerca(tr.obb.ancho, 30.0, 1e-6));
    assert!(cerca(tr.obb.alto, 10.0, 1e-6));
    assert!(cerca(tr.obb.cx, 50.0, 1e-6) && cerca(tr.obb.cy, 50.0, 1e-6));
}

#[test]
fn la_cizalla_deja_el_obb_ajustado_y_lo_declara() {
    let o = Obb {
        cx: 50.0,
        cy: 50.0,
        ancho: 30.0,
        alto: 10.0,
        rotacion_grados: 0.0,
    };
    let tr = transformar_obb(&o, &Afin::cizalla_grados(20.0, 0.0)).unwrap();
    assert!(!tr.exacta, "con cizalla el rectángulo ya no es un rectángulo");
    // El ajuste crece: es lo que hay que poder avisar, no esconder.
    assert!(tr.obb.alto >= o.alto - 1e-9);
    assert!(tr.obb.ancho > o.ancho);
}

#[test]
fn el_obb_espejado_gira_al_otro_lado() {
    let a = ann(
        "obb",
        json!({"x": 40.0, "y": 50.0, "width": 30.0, "height": 10.0, "rotation": 20.0}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let r = conservada(transformar_anotacion(
        &a,
        &Afin::espejo_h(100.0),
        &marco,
        0.3,
    ));
    assert!(cerca(r.data["x"].as_f64().unwrap(), 60.0, 1e-6));
    assert!(cerca(r.data["rotation"].as_f64().unwrap(), -20.0, 1e-6));
    assert!(cerca(r.data["width"].as_f64().unwrap(), 30.0, 1e-6));
}

// ─── Keypoints ──────────────────────────────────────────────────────────────

#[test]
fn el_espejo_intercambia_los_pares_izquierda_derecha() {
    let a = ann(
        "keypoints",
        json!({"points": [
            {"x": 10.0, "y": 20.0, "visible": true, "name": "left_shoulder"},
            {"x": 60.0, "y": 22.0, "visible": true, "name": "right_shoulder"},
            {"x": 35.0, "y": 5.0,  "visible": true, "name": "nose"}
        ]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let r = conservada(transformar_anotacion(
        &a,
        &Afin::espejo_h(100.0),
        &marco,
        0.3,
    ));
    let pts = r.data["points"].as_array().unwrap();
    // El nombre se queda en su sitio; lo que viaja es la coordenada. El hombro
    // izquierdo de la imagen volteada es el que era derecho.
    assert_eq!(pts[0]["name"], "left_shoulder");
    assert!(cerca(pts[0]["x"].as_f64().unwrap(), 40.0, TOL));
    assert_eq!(pts[1]["name"], "right_shoulder");
    assert!(cerca(pts[1]["x"].as_f64().unwrap(), 90.0, TOL));
    // El que no tiene pareja sólo se refleja.
    assert!(cerca(pts[2]["x"].as_f64().unwrap(), 65.0, TOL));
}

#[test]
fn sin_espejo_los_pares_no_se_tocan() {
    let a = ann(
        "keypoints",
        json!({"points": [
            {"x": 10.0, "y": 20.0, "visible": true, "name": "left_eye"},
            {"x": 60.0, "y": 20.0, "visible": true, "name": "right_eye"}
        ]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let r = conservada(transformar_anotacion(
        &a,
        &Afin::traslacion(5.0, 0.0),
        &marco,
        0.3,
    ));
    let pts = r.data["points"].as_array().unwrap();
    assert!(cerca(pts[0]["x"].as_f64().unwrap(), 15.0, TOL));
    assert!(cerca(pts[1]["x"].as_f64().unwrap(), 65.0, TOL));
}

#[test]
fn la_lateralidad_se_lee_por_token_no_por_subcadena() {
    assert_eq!(pareja_lateral("left_eye").as_deref(), Some("right_eye"));
    assert_eq!(pareja_lateral("eye-R").as_deref(), Some("eye-L"));
    assert_eq!(pareja_lateral("Left Hip").as_deref(), Some("Right Hip"));
    assert_eq!(
        pareja_lateral("codo_izquierdo").as_deref(),
        Some("codo_derecho")
    );
    // Nombres con las letras dentro, que no declaran lateralidad.
    assert_eq!(pareja_lateral("pelvis"), None);
    assert_eq!(pareja_lateral("clavicle"), None);
    assert_eq!(pareja_lateral("nose"), None);
}

#[test]
fn un_punto_fuera_del_marco_deja_de_ser_visible() {
    let a = ann(
        "keypoints",
        json!({"points": [
            {"x": 10.0, "y": 20.0, "visible": true, "name": "a"},
            {"x": 95.0, "y": 20.0, "visible": true, "name": "b"}
        ]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let r = conservada(transformar_anotacion(
        &a,
        &Afin::traslacion(20.0, 0.0),
        &marco,
        0.3,
    ));
    let pts = r.data["points"].as_array().unwrap();
    assert_eq!(pts[0]["visible"], json!(true));
    assert_eq!(pts[1]["visible"], json!(false));
}

#[test]
fn la_visibilidad_numerica_se_devuelve_numerica() {
    let a = ann(
        "keypoints",
        json!({"points": [{"x": 10.0, "y": 20.0, "visible": 2, "name": "a"}]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let r = conservada(transformar_anotacion(&a, &Afin::identidad(), &marco, 0.3));
    assert_eq!(r.data["points"][0]["visible"], json!(2));
}

#[test]
fn sin_ningun_punto_visible_la_anotacion_se_descarta() {
    let a = ann(
        "keypoints",
        json!({"points": [{"x": 10.0, "y": 20.0, "visible": true, "name": "a"}]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    assert!(matches!(
        transformar_anotacion(&a, &Afin::traslacion(200.0, 0.0), &marco, 0.3),
        ResultadoAnotacion::Descartada
    ));
}

// ─── Landmarks ──────────────────────────────────────────────────────────────

#[test]
fn un_landmark_fuera_del_marco_descarta_el_conjunto() {
    let a = ann(
        "landmarks",
        json!({"points": [
            {"x": 10.0, "y": 20.0, "name": "p1"},
            {"x": 90.0, "y": 20.0, "name": "p2"}
        ]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    assert!(matches!(
        transformar_anotacion(&a, &Afin::traslacion(20.0, 0.0), &marco, 0.3),
        ResultadoAnotacion::Descartada
    ));
    let dentro = conservada(transformar_anotacion(
        &a,
        &Afin::traslacion(5.0, 0.0),
        &marco,
        0.3,
    ));
    assert!(cerca(
        dentro.data["points"][0]["x"].as_f64().unwrap(),
        15.0,
        TOL
    ));
}

// ─── Polígonos ──────────────────────────────────────────────────────────────

#[test]
fn el_poligono_se_recorta_contra_el_marco() {
    let a = ann(
        "polygon",
        json!({"points": [{"x": 80.0, "y": 10.0}, {"x": 140.0, "y": 10.0}, {"x": 140.0, "y": 40.0}, {"x": 80.0, "y": 40.0}]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    let r = conservada(transformar_anotacion(&a, &Afin::identidad(), &marco, 0.3));
    let pts = puntos_de(&r.data, "points").unwrap();
    assert!(pts.iter().all(|&(x, _)| x <= 100.0 + TOL));
    // De 60×30 quedan 20×30: un tercio.
    assert!(cerca(polygon_area(&pts), 600.0, 1e-6));
}

#[test]
fn un_poligono_con_poca_superficie_dentro_se_descarta() {
    let a = ann(
        "polygon",
        json!({"points": [{"x": 95.0, "y": 10.0}, {"x": 195.0, "y": 10.0}, {"x": 195.0, "y": 40.0}, {"x": 95.0, "y": 40.0}]}),
    );
    let marco = Rect::marco(100.0, 100.0);
    // Sólo el 5 % cae dentro.
    assert!(matches!(
        transformar_anotacion(&a, &Afin::identidad(), &marco, 0.3),
        ResultadoAnotacion::Descartada
    ));
    // Con el mínimo por debajo, sobrevive.
    assert!(matches!(
        transformar_anotacion(&a, &Afin::identidad(), &marco, 0.01),
        ResultadoAnotacion::Conservada(_)
    ));
}

// ─── Máscaras ───────────────────────────────────────────────────────────────

#[test]
fn la_mascara_se_mueve_con_los_pixeles() {
    let caja = Rect::nuevo(10.0, 20.0, 20.0, 10.0);
    let img = imagen_con_cuadrado(100, 100, &caja);
    let b64 = codificar_mascara(&img, "data:image/png;base64,").unwrap();
    let a = ann("mask", json!({ "base64png": b64 }));
    let marco = Rect::marco(100.0, 100.0);

    let r = conservada(transformar_anotacion(
        &a,
        &Afin::espejo_h(100.0),
        &marco,
        0.3,
    ));
    let escrito = r.data["base64png"].as_str().unwrap();
    assert!(
        escrito.starts_with("data:image/png;base64,"),
        "el prefijo data: se conserva tal como venía"
    );
    let (movida, _) = decodificar_mascara(escrito).unwrap();
    let env = envolvente_opaca(&movida);
    let esperada = transformar_rect(&caja, &Afin::espejo_h(100.0));
    assert!(cerca(env.x, esperada.x, 1.0), "{env:?} vs {esperada:?}");
    assert!(cerca(env.y, esperada.y, 1.0));
    assert!(cerca(env.ancho, esperada.ancho, 1.0));
    // Un espejo no pierde píxeles.
    assert_eq!(cobertura(&img), cobertura(&movida));
}

#[test]
fn una_mascara_que_se_sale_del_marco_se_descarta() {
    let img = imagen_con_cuadrado(100, 100, &Rect::nuevo(10.0, 20.0, 20.0, 10.0));
    let b64 = codificar_mascara(&img, "").unwrap();
    let a = ann("mask", json!({ "base64png": b64 }));
    let marco = Rect::marco(100.0, 100.0);
    assert!(matches!(
        transformar_anotacion(&a, &Afin::traslacion(300.0, 0.0), &marco, 0.3),
        ResultadoAnotacion::Descartada
    ));
}

#[test]
fn escalar_una_mascara_no_la_hace_menos_visible() {
    // La escala cambia el conteo de píxeles sin perder nada: si la visibilidad
    // se midiera contra el conteo original, un zoom ×0.5 descartaría máscaras
    // enteras por haber quedado al 25 % de píxeles.
    let img = imagen_con_cuadrado(100, 100, &Rect::nuevo(10.0, 20.0, 40.0, 40.0));
    let b64 = codificar_mascara(&img, "").unwrap();
    let a = ann("mask", json!({ "base64png": b64 }));
    let marco = Rect::marco(100.0, 100.0);
    assert!(matches!(
        transformar_anotacion(&a, &Afin::escala(0.5, 0.5), &marco, 0.9),
        ResultadoAnotacion::Conservada(_)
    ));
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

#[test]
fn la_clasificacion_no_tiene_geometria_que_mover() {
    let a = ann("classification", json!({}));
    let marco = Rect::marco(100.0, 100.0);
    assert!(matches!(
        transformar_anotacion(&a, &Afin::rotacion_grados(30.0), &marco, 0.3),
        ResultadoAnotacion::Conservada(_)
    ));
}

#[test]
fn un_tipo_desconocido_no_se_deja_pasar_tal_cual() {
    // Dejarlo pasar escribiría coordenadas viejas sobre píxeles nuevos, que es
    // el fallo silencioso que este módulo existe para evitar.
    let a = ann("cubo-3d", json!({"x": 1.0}));
    let marco = Rect::marco(100.0, 100.0);
    assert!(matches!(
        transformar_anotacion(&a, &Afin::rotacion_grados(30.0), &marco, 0.3),
        ResultadoAnotacion::NoSoportada
    ));
    assert!(!tipo_soportado("cubo-3d"));
    for t in [
        "bbox",
        "obb",
        "polygon",
        "instance-segmentation",
        "keypoints",
        "landmarks",
        "mask",
        "classification",
        "multi-label-classification",
    ] {
        assert!(tipo_soportado(t), "{t} debería estar soportado");
    }
}

#[test]
fn el_angulo_se_normaliza_sin_cambiar_la_caja() {
    // 160° y −20° son el mismo rectángulo; se escribe el segundo para que la
    // anotación no parezca haber girado 180° cuando no lo hizo.
    let o = Obb {
        cx: 50.0,
        cy: 50.0,
        ancho: 30.0,
        alto: 10.0,
        rotacion_grados: 20.0,
    };
    let tr = transformar_obb(&o, &Afin::rotacion_en(140.0, 50.0, 50.0)).unwrap();
    assert!(cerca(tr.obb.rotacion_grados, -20.0, 1e-6));
    assert!(cerca(tr.obb.ancho, 30.0, 1e-6) && cerca(tr.obb.alto, 10.0, 1e-6));
    // Y las esquinas salen en el mismo sitio que las del giro real.
    let esperadas = transformar_puntos(&o.esquinas(), &Afin::rotacion_en(140.0, 50.0, 50.0));
    let env_real = Rect::envolvente(&esperadas).unwrap();
    let env_obb = Rect::envolvente(&tr.obb.esquinas()).unwrap();
    assert!(cerca(env_real.x, env_obb.x, 1e-6) && cerca(env_real.y, env_obb.y, 1e-6));
    assert!(cerca(env_real.ancho, env_obb.ancho, 1e-6));
}

#[test]
fn la_imagen_se_interpola_y_replica_el_borde() {
    // Medio negro, medio blanco: al desplazar medio píxel aparece un valor
    // intermedio, que es justo lo que el vecino más cercano no daría.
    let mut img = RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 255]));
    for y in 0..8 {
        for x in 4..8 {
            img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
        }
    }
    let movida = warp_imagen(&img, &Afin::traslacion(0.5, 0.0), 8, 8).unwrap();
    let borde = movida.get_pixel(4, 4)[0];
    assert!(borde > 0 && borde < 255, "el borde quedó en {borde}");

    // Un giro deja las esquinas con el color del borde, no con negro: unas
    // esquinas negras le enseñan al modelo a esperar esquinas negras.
    let plana = RgbaImage::from_pixel(8, 8, Rgba([200, 200, 200, 255]));
    let girada = warp_imagen(&plana, &Afin::rotacion_en(10.0, 4.0, 4.0), 8, 8).unwrap();
    assert_eq!(girada.get_pixel(0, 0).0, [200, 200, 200, 255]);
}
