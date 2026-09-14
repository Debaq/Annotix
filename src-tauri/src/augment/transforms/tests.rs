//! Una transformación fotométrica no puede romper las anotaciones, así que lo
//! que hay que probar es otra cosa: que haga lo que dice, que no toque el alfa,
//! y que el sorteo sea reproducible.

use image::{Rgba, RgbaImage};
use rand::rngs::StdRng;
use rand::SeedableRng;

use super::*;

fn rng(semilla: u64) -> StdRng {
    StdRng::seed_from_u64(semilla)
}

fn plano(r: u8, g: u8, b: u8, a: u8) -> RgbaImage {
    RgbaImage::from_pixel(8, 8, Rgba([r, g, b, a]))
}

fn primer(img: &RgbaImage) -> [u8; 4] {
    img.get_pixel(0, 0).0
}

// ─── Rangos y sorteo ────────────────────────────────────────────────────────

#[test]
fn un_rango_fijo_devuelve_siempre_lo_mismo() {
    let r = Rango::fijo(7.5);
    let mut g = rng(1);
    for _ in 0..10 {
        assert_eq!(r.sortear(&mut g), 7.5);
    }
}

#[test]
fn un_rango_invertido_no_revienta() {
    // Un usuario puede escribir el máximo en el mínimo; el sorteo lo ordena en
    // vez de entrar en pánico dentro del preparador de datasets.
    let r = Rango::nuevo(10.0, -10.0);
    let mut g = rng(1);
    let v = r.sortear(&mut g);
    assert!((-10.0..=10.0).contains(&v));
}

#[test]
fn la_probabilidad_cero_no_se_aplica_nunca_y_la_uno_siempre() {
    let ctx = Contexto::sin_anotaciones(100.0, 100.0);
    let mut g = rng(42);
    for _ in 0..50 {
        assert!(TransformSpec::FlipH { p: 0.0 }.muestrear(&mut g, &ctx).is_none());
        assert!(TransformSpec::FlipH { p: 1.0 }.muestrear(&mut g, &ctx).is_some());
    }
}

#[test]
fn el_mismo_sorteo_con_la_misma_semilla_da_lo_mismo() {
    let ctx = Contexto::sin_anotaciones(100.0, 100.0);
    let spec = TransformSpec::Rotate {
        p: 0.5,
        degrees: Rango::simetrico(30.0),
    };
    let tirada = |s: u64| {
        let mut g = rng(s);
        (0..20)
            .map(|_| spec.muestrear(&mut g, &ctx))
            .collect::<Vec<_>>()
    };
    assert_eq!(tirada(7), tirada(7));
    assert_ne!(tirada(7), tirada(8));
}

// ─── Geométricas: sólo se comprueba que salga la matriz correcta ────────────

#[test]
fn el_flip_usa_el_ancho_de_la_imagen() {
    let ctx = Contexto::sin_anotaciones(100.0, 50.0);
    let mut g = rng(1);
    let Some(Muestra::Geometrica(t)) = TransformSpec::FlipH { p: 1.0 }.muestrear(&mut g, &ctx)
    else {
        panic!("el flip es geométrico");
    };
    assert_eq!(t.aplicar((0.0, 10.0)), (100.0, 10.0));
}

#[test]
fn el_giro_y_la_cizalla_pivotan_sobre_el_centro() {
    let ctx = Contexto::sin_anotaciones(100.0, 100.0);
    let mut g = rng(3);
    for spec in [
        TransformSpec::Rotate {
            p: 1.0,
            degrees: Rango::simetrico(30.0),
        },
        TransformSpec::Shear {
            p: 1.0,
            x_degrees: Rango::simetrico(15.0),
            y_degrees: Rango::simetrico(15.0),
        },
    ] {
        let Some(Muestra::Geometrica(t)) = spec.muestrear(&mut g, &ctx) else {
            panic!("{} es geométrica", spec.id());
        };
        let (x, y) = t.aplicar((50.0, 50.0));
        assert!(
            (x - 50.0).abs() < 1e-9 && (y - 50.0).abs() < 1e-9,
            "{} movió el centro a ({x}, {y})",
            spec.id()
        );
    }
}

#[test]
fn el_zoom_central_conserva_el_centro_y_escala_el_resto() {
    let ctx = Contexto::sin_anotaciones(100.0, 100.0);
    let mut g = rng(5);
    let Some(Muestra::Geometrica(t)) = (TransformSpec::Zoom {
        p: 1.0,
        scale: Rango::fijo(2.0),
        center: CentroZoom::Central,
    })
    .muestrear(&mut g, &ctx) else {
        panic!("el zoom es geométrico");
    };
    assert_eq!(t.aplicar((50.0, 50.0)), (50.0, 50.0));
    assert_eq!(t.aplicar((25.0, 50.0)), (0.0, 50.0));
}

#[test]
fn la_traslacion_es_fraccion_del_lado() {
    let ctx = Contexto::sin_anotaciones(200.0, 100.0);
    let mut g = rng(9);
    let Some(Muestra::Geometrica(t)) = (TransformSpec::Translate {
        p: 1.0,
        x: Rango::fijo(0.1),
        y: Rango::fijo(-0.2),
    })
    .muestrear(&mut g, &ctx) else {
        panic!("la traslación es geométrica");
    };
    assert_eq!(t.aplicar((0.0, 0.0)), (20.0, -20.0));
}

// ─── Fotométricas ───────────────────────────────────────────────────────────

#[test]
fn el_brillo_sube_y_satura_sin_desbordar() {
    let mut g = rng(1);
    let img = plano(100, 100, 100, 200);
    let claro = aplicar_fotometrica(&img, &Fotometrica::BrilloContraste { brillo: 0.2, contraste: 0.0 }, &mut g);
    assert_eq!(primer(&claro)[0], 151);
    let quemado = aplicar_fotometrica(&img, &Fotometrica::BrilloContraste { brillo: 5.0, contraste: 0.0 }, &mut g);
    assert_eq!(primer(&quemado)[0], 255);
    // El alfa no es información visual: no se toca.
    assert_eq!(primer(&claro)[3], 200);
}

#[test]
fn el_contraste_pivota_sobre_el_gris_medio() {
    let mut g = rng(1);
    // Un píxel exactamente medio no se mueve; uno oscuro se oscurece más.
    let medio = plano(128, 128, 128, 255);
    let oscuro = plano(60, 60, 60, 255);
    let f = Fotometrica::BrilloContraste { brillo: 0.0, contraste: 1.0 };
    assert!((primer(&aplicar_fotometrica(&medio, &f, &mut g))[0] as i32 - 128).abs() <= 1);
    assert!(primer(&aplicar_fotometrica(&oscuro, &f, &mut g))[0] < 60);
}

#[test]
fn el_gris_usa_la_luminancia_y_no_la_media() {
    let mut g = rng(1);
    let verde = plano(0, 255, 0, 255);
    let salida = aplicar_fotometrica(&verde, &Fotometrica::Grises, &mut g);
    let [r, gg, b, a] = primer(&salida);
    // 0.587 x 255 = 149.7. La media de los tres canales daría 85: no es lo
    // mismo, y el verde es justo donde más se separan.
    assert_eq!((r, gg, b), (150, 150, 150));
    assert_eq!(a, 255);
}

#[test]
fn el_tono_gira_el_color_y_vuelve_en_360() {
    let mut g = rng(1);
    let rojo = plano(255, 0, 0, 255);
    let verde = aplicar_fotometrica(&rojo, &Fotometrica::Tono(120.0), &mut g);
    assert_eq!(&primer(&verde)[..3], &[0, 255, 0]);
    let vuelta = aplicar_fotometrica(&rojo, &Fotometrica::Tono(360.0), &mut g);
    assert_eq!(&primer(&vuelta)[..3], &[255, 0, 0]);
}

#[test]
fn el_tono_no_hace_nada_sobre_una_imagen_monocroma() {
    // No es un capricho de la UI: en escala de grises la saturación es 0 y el
    // tono no existe. La casilla que lo ofrece está ofreciendo nada.
    let mut g = rng(1);
    let gris = plano(120, 120, 120, 255);
    assert!(es_monocroma(&gris));
    let tras = aplicar_fotometrica(&gris, &Fotometrica::Tono(90.0), &mut g);
    assert_eq!(primer(&tras), [120, 120, 120, 255]);
    assert!(!TransformSpec::Hue { p: 1.0, degrees: Rango::simetrico(30.0) }.tiene_sentido_en_monocromo());
    assert!(TransformSpec::GaussianNoise { p: 1.0, sigma: Rango::fijo(0.1) }.tiene_sentido_en_monocromo());
}

#[test]
fn la_saturacion_a_cero_deja_la_imagen_gris() {
    let mut g = rng(1);
    let naranja = plano(230, 120, 40, 255);
    let apagada = aplicar_fotometrica(&naranja, &Fotometrica::Saturacion(0.0), &mut g);
    let [r, gg, b, _] = primer(&apagada);
    assert_eq!((r, gg), (b, b));
}

#[test]
fn el_ruido_mueve_los_canales_y_respeta_el_alfa() {
    let mut g = rng(4);
    let img = plano(128, 128, 128, 77);
    let ruidosa = aplicar_fotometrica(&img, &Fotometrica::Ruido(0.1), &mut g);
    assert!(ruidosa.pixels().any(|p| p[0] != 128));
    assert!(ruidosa.pixels().all(|p| p[3] == 77));
}

#[test]
fn el_desenfoque_gaussiano_suaviza_el_borde() {
    let mut g = rng(1);
    let mut img = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 255]));
    for y in 0..16 {
        for x in 8..16 {
            img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
        }
    }
    let suave = aplicar_fotometrica(&img, &Fotometrica::DesenfoqueGaussiano(2.0), &mut g);
    let borde = suave.get_pixel(7, 8)[0];
    assert!(borde > 0 && borde < 255, "el borde quedó en {borde}");
}

#[test]
fn el_desenfoque_de_movimiento_se_extiende_en_su_angulo() {
    let mut g = rng(1);
    // Una línea vertical blanca sobre negro.
    let mut img = RgbaImage::from_pixel(21, 21, Rgba([0, 0, 0, 255]));
    for y in 0..21 {
        img.put_pixel(10, y, Rgba([255, 255, 255, 255]));
    }
    let horizontal = aplicar_fotometrica(
        &img,
        &Fotometrica::DesenfoqueMovimiento { tam: 9, angulo: 0.0 },
        &mut g,
    );
    // A lo ancho se extiende...
    assert!(horizontal.get_pixel(13, 10)[0] > 0);
    // ...y a lo largo no cambia nada, porque la línea ya era constante en Y.
    let vertical = aplicar_fotometrica(
        &img,
        &Fotometrica::DesenfoqueMovimiento { tam: 9, angulo: 90.0 },
        &mut g,
    );
    assert_eq!(vertical.get_pixel(13, 10)[0], 0);
    assert_eq!(vertical.get_pixel(10, 10)[0], 255);
}

#[test]
fn la_nitidez_hace_lo_contrario_que_el_desenfoque() {
    let mut g = rng(1);
    let mut img = RgbaImage::from_pixel(16, 16, Rgba([80, 80, 80, 255]));
    for y in 0..16 {
        for x in 8..16 {
            img.put_pixel(x, y, Rgba([160, 160, 160, 255]));
        }
    }
    let dura = aplicar_fotometrica(&img, &Fotometrica::Nitidez(2.0), &mut g);
    let salto_original = 160i32 - 80;
    let salto_duro = dura.get_pixel(8, 8)[0] as i32 - dura.get_pixel(7, 8)[0] as i32;
    assert!(
        salto_duro > salto_original,
        "el salto pasó de {salto_original} a {salto_duro}"
    );
}

// ─── Borrado aleatorio ──────────────────────────────────────────────────────

#[test]
fn el_borrado_no_tapa_una_anotacion_entera() {
    // Una anotación que ocupa casi toda la imagen: cualquier rectángulo grande
    // la taparía, así que el sorteo tiene que rendirse en vez de borrarla.
    let caja = Rect::nuevo(5.0, 5.0, 90.0, 90.0);
    let cajas = [caja];
    let ctx = Contexto {
        ancho: 100.0,
        alto: 100.0,
        cajas: &cajas,
        max_oclusion: 0.2,
    };
    let spec = TransformSpec::RandomErasing {
        p: 1.0,
        area: Rango::nuevo(0.4, 0.6),
        ratio: Rango::nuevo(0.8, 1.2),
    };
    let mut g = rng(11);
    for _ in 0..30 {
        match spec.muestrear(&mut g, &ctx) {
            None => {}
            Some(Muestra::Fotometrica(Fotometrica::Borrado(r))) => {
                let cubierto = caja
                    .interseccion(&r)
                    .map(|i| i.area() / caja.area())
                    .unwrap_or(0.0);
                assert!(cubierto <= 0.2, "tapó el {:.0} % de la anotación", cubierto * 100.0);
            }
            otro => panic!("el borrado no es {otro:?}"),
        }
    }
}

#[test]
fn sin_anotaciones_el_borrado_sale_y_cae_dentro_de_la_imagen() {
    let ctx = Contexto::sin_anotaciones(100.0, 100.0);
    let spec = TransformSpec::RandomErasing {
        p: 1.0,
        area: Rango::nuevo(0.02, 0.1),
        ratio: Rango::nuevo(0.5, 2.0),
    };
    let mut g = rng(13);
    let mut salieron = 0;
    for _ in 0..20 {
        if let Some(Muestra::Fotometrica(Fotometrica::Borrado(r))) = spec.muestrear(&mut g, &ctx) {
            salieron += 1;
            assert!(r.x >= 0.0 && r.y >= 0.0);
            assert!(r.x + r.ancho <= 100.0 + 1e-9);
            assert!(r.y + r.alto <= 100.0 + 1e-9);
        }
    }
    assert!(salieron > 0, "sin anotaciones que proteger, alguno tenía que salir");
}

#[test]
fn el_borrado_pinta_ruido_y_no_un_rectangulo_plano() {
    let mut g = rng(17);
    let img = plano(0, 0, 0, 255);
    let borrada = aplicar_fotometrica(
        &img,
        &Fotometrica::Borrado(Rect::nuevo(1.0, 1.0, 6.0, 6.0)),
        &mut g,
    );
    let dentro: Vec<u8> = (1..7).map(|x| borrada.get_pixel(x, 1)[0]).collect();
    assert!(dentro.iter().any(|&v| v != dentro[0]), "el relleno es plano");
    // Fuera del rectángulo no se tocó nada.
    assert_eq!(borrada.get_pixel(0, 0).0, [0, 0, 0, 255]);
    assert_eq!(borrada.get_pixel(7, 7).0, [0, 0, 0, 255]);
}

// ─── El catálogo como dato ──────────────────────────────────────────────────

#[test]
fn el_catalogo_sabe_cual_invierte_la_lateralidad() {
    // La comprobación vive en el catálogo para que el aviso de la UI y la reja
    // del plan lean el mismo dato, no dos listas que se separan.
    assert!(TransformSpec::FlipH { p: 0.5 }.invierte_lateralidad());
    assert!(!TransformSpec::FlipH { p: 0.0 }.invierte_lateralidad());
    assert!(!TransformSpec::FlipV { p: 0.5 }.invierte_lateralidad());
    assert!(!TransformSpec::Rotate { p: 1.0, degrees: Rango::simetrico(90.0) }.invierte_lateralidad());
}

#[test]
fn geometricas_y_fotometricas_estan_bien_separadas() {
    let ctx = Contexto::sin_anotaciones(64.0, 64.0);
    let todas = vec![
        TransformSpec::FlipH { p: 1.0 },
        TransformSpec::FlipV { p: 1.0 },
        TransformSpec::Rotate { p: 1.0, degrees: Rango::simetrico(10.0) },
        TransformSpec::Shear { p: 1.0, x_degrees: Rango::simetrico(5.0), y_degrees: Rango::simetrico(5.0) },
        TransformSpec::Zoom { p: 1.0, scale: Rango::nuevo(0.8, 1.2), center: CentroZoom::Central },
        TransformSpec::Translate { p: 1.0, x: Rango::simetrico(0.1), y: Rango::simetrico(0.1) },
        TransformSpec::BrightnessContrast { p: 1.0, brightness: Rango::simetrico(0.2), contrast: Rango::simetrico(0.2) },
        TransformSpec::Hue { p: 1.0, degrees: Rango::simetrico(20.0) },
        TransformSpec::Saturation { p: 1.0, factor: Rango::nuevo(0.7, 1.3) },
        TransformSpec::Grayscale { p: 1.0 },
        TransformSpec::GaussianNoise { p: 1.0, sigma: Rango::fijo(0.05) },
        TransformSpec::MotionBlur { p: 1.0, kernel: Rango::nuevo(3.0, 9.0), angle: Rango::nuevo(0.0, 180.0) },
        TransformSpec::GaussianBlur { p: 1.0, sigma: Rango::nuevo(0.5, 2.0) },
        TransformSpec::Sharpen { p: 1.0, amount: Rango::nuevo(0.5, 1.5) },
        TransformSpec::RandomErasing { p: 1.0, area: Rango::nuevo(0.02, 0.1), ratio: Rango::nuevo(0.5, 2.0) },
    ];
    let mut g = rng(23);
    for spec in &todas {
        let muestra = spec.muestrear(&mut g, &ctx).unwrap_or_else(|| panic!("{} no salió con p=1", spec.id()));
        match muestra {
            Muestra::Geometrica(_) => assert!(spec.es_geometrica(), "{} salió geométrica", spec.id()),
            Muestra::Fotometrica(_) => assert!(!spec.es_geometrica(), "{} salió fotométrica", spec.id()),
        }
    }
    // Los identificadores son estables y únicos: la UI y el contrato los usan.
    let mut ids: Vec<&str> = todas.iter().map(|t| t.id()).collect();
    ids.sort_unstable();
    let total = ids.len();
    ids.dedup();
    assert_eq!(ids.len(), total, "hay identificadores repetidos");
}

#[test]
fn el_plan_sobrevive_a_un_viaje_por_json() {
    // Se guarda en project.json, así que tiene que volver igual.
    let spec = TransformSpec::Shear {
        p: 0.4,
        x_degrees: Rango::simetrico(12.0),
        y_degrees: Rango::fijo(0.0),
    };
    let texto = serde_json::to_string(&spec).unwrap();
    assert!(texto.contains("\"kind\":\"shear\""), "{texto}");
    assert!(texto.contains("xDegrees"), "{texto}");
    assert_eq!(serde_json::from_str::<TransformSpec>(&texto).unwrap(), spec);
}
