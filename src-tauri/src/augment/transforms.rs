//! El catálogo de transformaciones: qué se puede aplicar, con qué parámetros, y
//! qué le hace a los píxeles.
//!
//! Cada transformación lleva su probabilidad `p` y **rangos** en vez de valores:
//! lo que se guarda es el sobre dentro del cual se sortea cada variante. Un
//! `degrees: 0..10` no gira siempre 10°, gira lo que toque en ese intervalo.
//!
//! ## La separación que gobierna el módulo
//!
//! Una transformación es geométrica o fotométrica, y la diferencia no es de
//! clasificación sino de consecuencias:
//!
//! - **Geométrica**: mueve píxeles, así que hay que mover las anotaciones con
//!   ellos. Aquí sólo se sortea la matriz; quien la aplica a las etiquetas es
//!   [`super::geometry`], que es donde vive la corrección.
//! - **Fotométrica**: cambia lo que el modelo ve sin mover nada. Las anotaciones
//!   no se tocan — pero sí cambia lo que se puede aprender, y en imagen médica
//!   eso no es inocuo: un cambio de contraste **es un ventaneo distinto** y puede
//!   borrar el hallazgo.
//!
//! ## Lo que no está
//!
//! **Perspectiva (tilt).** Es una homografía, no una transformación afín, y
//! [`super::geometry`] sólo sabe de afines. Entra cuando haya matriz proyectiva
//! con sus tests, no antes: una variante del catálogo que no mueve las
//! anotaciones correctamente es peor que no tener la variante.

use image::{Rgba, RgbaImage};
use rand::Rng;
use serde::{Deserialize, Serialize};

use super::geometry::{Afin, Rect};

// ─── Rangos ─────────────────────────────────────────────────────────────────

/// Intervalo cerrado del que se sortea un parámetro.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rango {
    pub min: f64,
    pub max: f64,
}

impl Rango {
    pub const fn nuevo(min: f64, max: f64) -> Self {
        Rango { min, max }
    }

    /// Un parámetro que no varía: el rango degenerado.
    pub const fn fijo(v: f64) -> Self {
        Rango { min: v, max: v }
    }

    /// Simétrico alrededor de cero, que es la forma natural de casi todos: un
    /// giro de ±10°, un brillo de ±0.2.
    pub const fn simetrico(amplitud: f64) -> Self {
        Rango {
            min: -amplitud,
            max: amplitud,
        }
    }

    pub fn sortear(&self, rng: &mut impl Rng) -> f64 {
        let (lo, hi) = if self.min <= self.max {
            (self.min, self.max)
        } else {
            (self.max, self.min)
        };
        if (hi - lo).abs() < f64::EPSILON {
            lo
        } else {
            rng.gen_range(lo..=hi)
        }
    }
}

/// Desde dónde se hace zoom.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CentroZoom {
    /// El centro de la imagen. Conserva la composición.
    Central,
    /// Un punto cualquiera: obliga al modelo a no depender de dónde cae el
    /// objeto en el encuadre.
    Aleatorio,
}

// ─── El catálogo ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum TransformSpec {
    /// Espejo en X. **Desactivado en modalidades lateralizadas**: en una
    /// radiografía la izquierda y la derecha son diagnósticas.
    FlipH { p: f64 },
    /// Espejo en Y. En radiología el eje cráneo-caudal es fijo.
    FlipV { p: f64 },
    Rotate { p: f64, degrees: Rango },
    Shear {
        p: f64,
        x_degrees: Rango,
        y_degrees: Rango,
    },
    Zoom {
        p: f64,
        scale: Rango,
        center: CentroZoom,
    },
    /// Desplazamiento en fracción del lado.
    Translate { p: f64, x: Rango, y: Rango },
    /// `brightness` y `contrast` en fracción: 0.0 no cambia nada.
    BrightnessContrast {
        p: f64,
        brightness: Rango,
        contrast: Rango,
    },
    /// Giro de tono en grados. Sin sentido en escala de grises.
    Hue { p: f64, degrees: Rango },
    /// Factor de saturación: 1.0 no cambia nada, 0.0 deja la imagen gris.
    Saturation { p: f64, factor: Rango },
    Grayscale { p: f64 },
    /// Sigma en fracción del rango completo (0.05 ≈ 13 niveles de 255).
    GaussianNoise { p: f64, sigma: Rango },
    /// Tamaño del kernel en píxeles y ángulo en grados. El tamaño es
    /// configurable porque **relativo a la lesión** decide si la borra.
    MotionBlur {
        p: f64,
        kernel: Rango,
        angle: Rango,
    },
    GaussianBlur { p: f64, sigma: Rango },
    /// Cuánto se suma de la máscara de enfoque. 0.0 no cambia nada.
    Sharpen { p: f64, amount: Rango },
    /// Oclusión. `area` en fracción de la imagen, `ratio` la proporción del
    /// rectángulo borrado.
    RandomErasing {
        p: f64,
        area: Rango,
        ratio: Rango,
    },
}

impl TransformSpec {
    pub fn probabilidad(&self) -> f64 {
        match self {
            TransformSpec::FlipH { p }
            | TransformSpec::FlipV { p }
            | TransformSpec::Rotate { p, .. }
            | TransformSpec::Shear { p, .. }
            | TransformSpec::Zoom { p, .. }
            | TransformSpec::Translate { p, .. }
            | TransformSpec::BrightnessContrast { p, .. }
            | TransformSpec::Hue { p, .. }
            | TransformSpec::Saturation { p, .. }
            | TransformSpec::Grayscale { p }
            | TransformSpec::GaussianNoise { p, .. }
            | TransformSpec::MotionBlur { p, .. }
            | TransformSpec::GaussianBlur { p, .. }
            | TransformSpec::Sharpen { p, .. }
            | TransformSpec::RandomErasing { p, .. } => *p,
        }
    }

    /// Identificador estable; la UI lo traduce y el contrato de modelo lo
    /// transcribe. No se manda la frase hecha porque el backend no sabe de
    /// idiomas.
    pub fn id(&self) -> &'static str {
        match self {
            TransformSpec::FlipH { .. } => "flip_h",
            TransformSpec::FlipV { .. } => "flip_v",
            TransformSpec::Rotate { .. } => "rotate",
            TransformSpec::Shear { .. } => "shear",
            TransformSpec::Zoom { .. } => "zoom",
            TransformSpec::Translate { .. } => "translate",
            TransformSpec::BrightnessContrast { .. } => "brightness_contrast",
            TransformSpec::Hue { .. } => "hue",
            TransformSpec::Saturation { .. } => "saturation",
            TransformSpec::Grayscale { .. } => "grayscale",
            TransformSpec::GaussianNoise { .. } => "gaussian_noise",
            TransformSpec::MotionBlur { .. } => "motion_blur",
            TransformSpec::GaussianBlur { .. } => "gaussian_blur",
            TransformSpec::Sharpen { .. } => "sharpen",
            TransformSpec::RandomErasing { .. } => "random_erasing",
        }
    }

    /// `true` si mueve píxeles, y por tanto hay que mover las anotaciones.
    pub fn es_geometrica(&self) -> bool {
        matches!(
            self,
            TransformSpec::FlipH { .. }
                | TransformSpec::FlipV { .. }
                | TransformSpec::Rotate { .. }
                | TransformSpec::Shear { .. }
                | TransformSpec::Zoom { .. }
                | TransformSpec::Translate { .. }
        )
    }

    /// `true` si invierte la lateralidad de la imagen.
    ///
    /// Es lo que un corpus de modalidad lateralizada —radiografía, mamografía,
    /// retina— no puede permitirse: no está peor documentado, está mal
    /// entrenado. La comprobación vive aquí, en el catálogo, y no en la UI, para
    /// que el aviso y la reja lean el mismo dato.
    pub fn invierte_lateralidad(&self) -> bool {
        matches!(self, TransformSpec::FlipH { p } if *p > 0.0)
    }

    /// `true` si cambia algo en una imagen monocroma.
    ///
    /// Un CT no tiene tono ni saturación: ofrecer esas transformaciones en
    /// escala de grises es ofrecer una casilla que no hace nada.
    pub fn tiene_sentido_en_monocromo(&self) -> bool {
        !matches!(
            self,
            TransformSpec::Hue { .. } | TransformSpec::Saturation { .. } | TransformSpec::Grayscale { .. }
        )
    }
}

// ─── Lo que sale de sortear ─────────────────────────────────────────────────

/// Una transformación ya concretada: sin rangos ni probabilidades, lista para
/// aplicarse. Es lo que el contrato puede transcribir como "esto fue lo que se
/// le hizo a esta imagen".
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Muestra {
    Geometrica(Afin),
    Fotometrica(Fotometrica),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Fotometrica {
    BrilloContraste { brillo: f64, contraste: f64 },
    Tono(f64),
    Saturacion(f64),
    Grises,
    Ruido(f64),
    DesenfoqueMovimiento { tam: u32, angulo: f64 },
    DesenfoqueGaussiano(f64),
    Nitidez(f64),
    Borrado(Rect),
}

/// Lo que hace falta para sortear una transformación sobre una imagen concreta.
pub struct Contexto<'a> {
    pub ancho: f64,
    pub alto: f64,
    /// Envolventes de las anotaciones, para que el borrado aleatorio no tape
    /// ninguna entera.
    pub cajas: &'a [Rect],
    /// Fracción máxima de una anotación que el borrado puede cubrir.
    pub max_oclusion: f64,
}

impl Contexto<'_> {
    pub fn sin_anotaciones(ancho: f64, alto: f64) -> Contexto<'static> {
        Contexto {
            ancho,
            alto,
            cajas: &[],
            max_oclusion: 0.5,
        }
    }
}

/// Intentos de colocar el rectángulo de borrado antes de rendirse.
const INTENTOS_BORRADO: usize = 20;

impl TransformSpec {
    /// Sortea la transformación. `None` cuando la probabilidad no sale, o cuando
    /// no hay forma de aplicarla sin romper algo.
    pub fn muestrear(&self, rng: &mut impl Rng, ctx: &Contexto) -> Option<Muestra> {
        let p = self.probabilidad();
        if p <= 0.0 || rng.gen::<f64>() >= p {
            return None;
        }
        let (cx, cy) = (ctx.ancho / 2.0, ctx.alto / 2.0);
        Some(match self {
            TransformSpec::FlipH { .. } => Muestra::Geometrica(Afin::espejo_h(ctx.ancho)),
            TransformSpec::FlipV { .. } => Muestra::Geometrica(Afin::espejo_v(ctx.alto)),
            TransformSpec::Rotate { degrees, .. } => {
                Muestra::Geometrica(Afin::rotacion_en(degrees.sortear(rng), cx, cy))
            }
            TransformSpec::Shear {
                x_degrees,
                y_degrees,
                ..
            } => {
                // La cizalla se hace sobre el centro: aplicada sobre el origen
                // se lleva la imagen fuera del marco.
                let c = Afin::cizalla_grados(x_degrees.sortear(rng), y_degrees.sortear(rng));
                Muestra::Geometrica(
                    Afin::traslacion(-cx, -cy)
                        .luego(&c)
                        .luego(&Afin::traslacion(cx, cy)),
                )
            }
            TransformSpec::Zoom { scale, center, .. } => {
                let s = scale.sortear(rng);
                if s.abs() < f64::EPSILON {
                    return None;
                }
                let (zx, zy) = match center {
                    CentroZoom::Central => (cx, cy),
                    CentroZoom::Aleatorio => (
                        rng.gen_range(0.0..=ctx.ancho.max(f64::EPSILON)),
                        rng.gen_range(0.0..=ctx.alto.max(f64::EPSILON)),
                    ),
                };
                Muestra::Geometrica(
                    Afin::traslacion(-zx, -zy)
                        .luego(&Afin::escala(s, s))
                        .luego(&Afin::traslacion(zx, zy)),
                )
            }
            TransformSpec::Translate { x, y, .. } => Muestra::Geometrica(Afin::traslacion(
                x.sortear(rng) * ctx.ancho,
                y.sortear(rng) * ctx.alto,
            )),
            TransformSpec::BrightnessContrast {
                brightness,
                contrast,
                ..
            } => Muestra::Fotometrica(Fotometrica::BrilloContraste {
                brillo: brightness.sortear(rng),
                contraste: contrast.sortear(rng),
            }),
            TransformSpec::Hue { degrees, .. } => {
                Muestra::Fotometrica(Fotometrica::Tono(degrees.sortear(rng)))
            }
            TransformSpec::Saturation { factor, .. } => {
                Muestra::Fotometrica(Fotometrica::Saturacion(factor.sortear(rng).max(0.0)))
            }
            TransformSpec::Grayscale { .. } => Muestra::Fotometrica(Fotometrica::Grises),
            TransformSpec::GaussianNoise { sigma, .. } => {
                Muestra::Fotometrica(Fotometrica::Ruido(sigma.sortear(rng).max(0.0)))
            }
            TransformSpec::MotionBlur { kernel, angle, .. } => {
                let tam = kernel.sortear(rng).round().max(1.0) as u32;
                if tam < 2 {
                    return None;
                }
                Muestra::Fotometrica(Fotometrica::DesenfoqueMovimiento {
                    tam,
                    angulo: angle.sortear(rng),
                })
            }
            TransformSpec::GaussianBlur { sigma, .. } => {
                let s = sigma.sortear(rng);
                if s <= 0.0 {
                    return None;
                }
                Muestra::Fotometrica(Fotometrica::DesenfoqueGaussiano(s))
            }
            TransformSpec::Sharpen { amount, .. } => {
                let a = amount.sortear(rng);
                if a.abs() < f64::EPSILON {
                    return None;
                }
                Muestra::Fotometrica(Fotometrica::Nitidez(a))
            }
            TransformSpec::RandomErasing { area, ratio, .. } => {
                Muestra::Fotometrica(Fotometrica::Borrado(sortear_borrado(rng, area, ratio, ctx)?))
            }
        })
    }
}

/// Busca un rectángulo que ocluya sin tapar ninguna anotación entera.
///
/// Devuelve `None` si no lo encuentra en [`INTENTOS_BORRADO`] intentos: no
/// borrar es el fallo correcto. Borrar la única lesión de la imagen y dejar la
/// etiqueta encima enseña al modelo a detectar lo que no está.
fn sortear_borrado(
    rng: &mut impl Rng,
    area: &Rango,
    ratio: &Rango,
    ctx: &Contexto,
) -> Option<Rect> {
    let total = ctx.ancho * ctx.alto;
    if total <= 0.0 {
        return None;
    }
    for _ in 0..INTENTOS_BORRADO {
        let objetivo = area.sortear(rng).clamp(0.0, 1.0) * total;
        let prop = ratio.sortear(rng).max(0.01);
        let ancho = (objetivo * prop).sqrt();
        let alto = if prop > 0.0 { ancho / prop } else { 0.0 };
        if ancho < 1.0 || alto < 1.0 || ancho >= ctx.ancho || alto >= ctx.alto {
            continue;
        }
        let x = rng.gen_range(0.0..=(ctx.ancho - ancho));
        let y = rng.gen_range(0.0..=(ctx.alto - alto));
        let candidato = Rect::nuevo(x, y, ancho, alto);
        let tapa_demasiado = ctx.cajas.iter().any(|caja| {
            let area_caja = caja.area();
            area_caja > 0.0
                && caja
                    .interseccion(&candidato)
                    .map(|i| i.area() / area_caja)
                    .unwrap_or(0.0)
                    > ctx.max_oclusion
        });
        if !tapa_demasiado {
            return Some(candidato);
        }
    }
    None
}

// ─── Aplicación sobre píxeles ───────────────────────────────────────────────

/// Aplica una transformación fotométrica. No toca las anotaciones porque no
/// mueve nada, y **nunca toca el alfa**: en una imagen de entrenamiento el alfa
/// no es información visual, y en una máscara es la máscara entera.
pub fn aplicar_fotometrica(img: &RgbaImage, f: &Fotometrica, rng: &mut impl Rng) -> RgbaImage {
    match *f {
        Fotometrica::BrilloContraste { brillo, contraste } => {
            mapear(img, |c| {
                // El contraste pivota sobre el gris medio: multiplicar sobre el
                // 0 oscurecería la imagen en vez de darle contraste.
                let v = (c - 0.5) * (1.0 + contraste) + 0.5 + brillo;
                v.clamp(0.0, 1.0)
            })
        }
        Fotometrica::Tono(grados) => mapear_hsv(img, |(h, s, v)| ((h + grados).rem_euclid(360.0), s, v)),
        Fotometrica::Saturacion(factor) => {
            mapear_hsv(img, |(h, s, v)| (h, (s * factor).clamp(0.0, 1.0), v))
        }
        Fotometrica::Grises => {
            let mut salida = img.clone();
            for p in salida.pixels_mut() {
                let l = luma(p[0], p[1], p[2]);
                *p = Rgba([l, l, l, p[3]]);
            }
            salida
        }
        Fotometrica::Ruido(sigma) => {
            let mut salida = img.clone();
            for p in salida.pixels_mut() {
                for c in 0..3 {
                    let ruido = normal_estandar(rng) * sigma * 255.0;
                    p[c] = (p[c] as f64 + ruido).clamp(0.0, 255.0) as u8;
                }
            }
            salida
        }
        Fotometrica::DesenfoqueGaussiano(sigma) => {
            imageproc::filter::gaussian_blur_f32(img, sigma as f32)
        }
        Fotometrica::DesenfoqueMovimiento { tam, angulo } => desenfoque_movimiento(img, tam, angulo),
        Fotometrica::Nitidez(cantidad) => {
            // Máscara de enfoque: original + cantidad · (original − desenfocada).
            let suave = imageproc::filter::gaussian_blur_f32(img, 1.0);
            let mut salida = img.clone();
            for (x, y, p) in salida.enumerate_pixels_mut() {
                let s = suave.get_pixel(x, y);
                for c in 0..3 {
                    let detalle = p[c] as f64 - s[c] as f64;
                    p[c] = (p[c] as f64 + cantidad * detalle).clamp(0.0, 255.0) as u8;
                }
            }
            salida
        }
        Fotometrica::Borrado(r) => {
            let mut salida = img.clone();
            let x0 = r.x.max(0.0) as u32;
            let y0 = r.y.max(0.0) as u32;
            let x1 = ((r.x + r.ancho).min(salida.width() as f64)).max(0.0) as u32;
            let y1 = ((r.y + r.alto).min(salida.height() as f64)).max(0.0) as u32;
            for y in y0..y1 {
                for x in x0..x1 {
                    // Ruido, no un gris plano: un rectángulo uniforme es un
                    // patrón que el modelo aprende a reconocer como tal.
                    let p = salida.get_pixel_mut(x, y);
                    for c in 0..3 {
                        p[c] = rng.gen();
                    }
                }
            }
            salida
        }
    }
}

fn mapear(img: &RgbaImage, f: impl Fn(f64) -> f64) -> RgbaImage {
    let mut salida = img.clone();
    for p in salida.pixels_mut() {
        for c in 0..3 {
            p[c] = (f(p[c] as f64 / 255.0) * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    salida
}

fn mapear_hsv(img: &RgbaImage, f: impl Fn((f64, f64, f64)) -> (f64, f64, f64)) -> RgbaImage {
    let mut salida = img.clone();
    for p in salida.pixels_mut() {
        let (r, g, b) = hsv_a_rgb(f(rgb_a_hsv(p[0], p[1], p[2])));
        *p = Rgba([r, g, b, p[3]]);
    }
    salida
}

pub fn luma(r: u8, g: u8, b: u8) -> u8 {
    (0.299 * r as f64 + 0.587 * g as f64 + 0.114 * b as f64).round() as u8
}

/// `true` si ningún píxel tiene color: la imagen es monocroma aunque venga en
/// tres canales, que es como llega una radiografía convertida a PNG.
pub fn es_monocroma(img: &RgbaImage) -> bool {
    img.pixels().all(|p| p[0] == p[1] && p[1] == p[2])
}

pub fn rgb_a_hsv(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let (r, g, b) = (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
    let h = if delta < f64::EPSILON {
        0.0
    } else if max == r {
        60.0 * (((g - b) / delta) % 6.0)
    } else if max == g {
        60.0 * ((b - r) / delta + 2.0)
    } else {
        60.0 * ((r - g) / delta + 4.0)
    };
    let s = if max <= 0.0 { 0.0 } else { delta / max };
    (h.rem_euclid(360.0), s, max)
}

pub fn hsv_a_rgb((h, s, v): (f64, f64, f64)) -> (u8, u8, u8) {
    let c = v * s;
    let h1 = h.rem_euclid(360.0) / 60.0;
    let x = c * (1.0 - (h1 % 2.0 - 1.0).abs());
    let (r, g, b) = match h1 as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = v - c;
    let canal = |t: f64| ((t + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    (canal(r), canal(g), canal(b))
}

/// Promedia a lo largo de una línea: simula el movimiento del paciente o de la
/// platina. El borde se extiende en vez de oscurecerse.
fn desenfoque_movimiento(img: &RgbaImage, tam: u32, angulo: f64) -> RgbaImage {
    let (w, h) = (img.width() as i64, img.height() as i64);
    let (sin, cos) = angulo.to_radians().sin_cos();
    let mitad = (tam as i64) / 2;
    let mut salida = img.clone();
    for y in 0..h {
        for x in 0..w {
            let mut acc = [0f64; 3];
            let mut n = 0f64;
            for k in -mitad..=mitad {
                let sx = (x as f64 + k as f64 * cos).round() as i64;
                let sy = (y as f64 + k as f64 * sin).round() as i64;
                let p = img.get_pixel(sx.clamp(0, w - 1) as u32, sy.clamp(0, h - 1) as u32);
                for c in 0..3 {
                    acc[c] += p[c] as f64;
                }
                n += 1.0;
            }
            let destino = salida.get_pixel_mut(x as u32, y as u32);
            for c in 0..3 {
                destino[c] = (acc[c] / n).round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    salida
}

/// Normal estándar por Box–Muller. Se escribe aquí en vez de traer
/// `rand_distr` por una función de cinco líneas.
fn normal_estandar(rng: &mut impl Rng) -> f64 {
    let u1: f64 = rng.gen_range(f64::EPSILON..1.0);
    let u2: f64 = rng.gen_range(0.0..1.0);
    (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()
}

#[cfg(test)]
mod tests;
