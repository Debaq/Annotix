//! La matriz afín y cómo se le aplica a cada tipo de anotación.
//!
//! Aquí vive la corrección de toda la augmentación. Una transformación que mueve
//! píxeles y no mueve las etiquetas con ellos no rompe nada de forma visible: el
//! dataset se escribe, el entrenamiento corre y el modelo aprende de cajas que no
//! contienen lo que dicen contener. Por eso todo lo de este archivo son funciones
//! puras con tests uno por uno, y por eso el resto del subsistema
//! (`transforms`, `tiling`, `plan`) se apoya en él en vez de repetir la cuenta.
//!
//! ## Convenio de coordenadas
//!
//! Coordenadas de imagen: origen arriba a la izquierda, **y hacia abajo**. Un
//! ángulo positivo gira en el sentido de las agujas del reloj tal como se ve en
//! pantalla. Es el mismo convenio que ya usa `utils::converters::obb_to_aabbox`
//! para el `rotation` de los OBB, y cambiarlo aquí habría dejado dos convenios
//! en el mismo proceso.
//!
//! ## Lo que una transformación le hace a cada tipo
//!
//! | Tipo | Qué pasa |
//! |---|---|
//! | `bbox` | Se transforman las cuatro esquinas y se toma la envolvente. Con rotación **la caja engorda**: es inevitable en una caja eje-alineada y hay que decirlo, no esconderlo |
//! | `obb` | Se conserva la orientación. Exacta mientras la transformación mantenga los ángulos rectos (giro, espejo, escalado uniforme); con cizalla o perspectiva se ajusta el OBB a los puntos y se marca `exacta: false` |
//! | `polygon` | Punto a punto, y se recorta contra el marco |
//! | `keypoints` | Punto a punto, **y con los pares izquierda/derecha intercambiados cuando la transformación es un espejo**. Sin eso el esqueleto queda cruzado y nadie lo ve |
//! | `landmarks` | Punto a punto. No tienen bandera de visibilidad: si uno sale del marco se descarta la anotación entera, porque un conjunto de landmarks incompleto no es un conjunto de landmarks con un punto menos |
//! | `mask` | Se remuestrea por el inverso, al vecino más cercano: una máscara es categórica y una interpolación inventa valores intermedios |

use image::{Rgba, RgbaImage};
use serde_json::Value;

use crate::export::{parse_bbox, parse_keypoints, parse_landmarks, parse_mask, parse_obb};
use crate::store::project_file::AnnotationEntry;
use crate::utils::converters::polygon_area;

/// Tolerancia para decidir si dos ejes siguen siendo perpendiculares.
const EPS_ORTOGONAL: f64 = 1e-9;

// ─── Matriz afín ────────────────────────────────────────────────────────────

/// Transformación afín 2D.
///
/// ```text
/// x' = a·x + b·y + c
/// y' = d·x + e·y + f
/// ```
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Afin {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub e: f64,
    pub f: f64,
}

impl Default for Afin {
    fn default() -> Self {
        Self::identidad()
    }
}

impl Afin {
    pub const fn identidad() -> Self {
        Afin {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 0.0,
            e: 1.0,
            f: 0.0,
        }
    }

    pub const fn traslacion(tx: f64, ty: f64) -> Self {
        Afin {
            a: 1.0,
            b: 0.0,
            c: tx,
            d: 0.0,
            e: 1.0,
            f: ty,
        }
    }

    pub const fn escala(sx: f64, sy: f64) -> Self {
        Afin {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: 0.0,
            e: sy,
            f: 0.0,
        }
    }

    /// Giro alrededor del origen.
    pub fn rotacion_grados(grados: f64) -> Self {
        let r = grados.to_radians();
        let (sin, cos) = r.sin_cos();
        Afin {
            a: cos,
            b: -sin,
            c: 0.0,
            d: sin,
            e: cos,
            f: 0.0,
        }
    }

    /// Giro alrededor de un punto cualquiera — el caso real, porque una imagen se
    /// gira sobre su centro y no sobre su esquina.
    pub fn rotacion_en(grados: f64, cx: f64, cy: f64) -> Self {
        Afin::traslacion(-cx, -cy)
            .luego(&Afin::rotacion_grados(grados))
            .luego(&Afin::traslacion(cx, cy))
    }

    /// Espejo horizontal dentro de una imagen de `ancho` píxeles.
    pub fn espejo_h(ancho: f64) -> Self {
        Afin {
            a: -1.0,
            b: 0.0,
            c: ancho,
            d: 0.0,
            e: 1.0,
            f: 0.0,
        }
    }

    /// Espejo vertical dentro de una imagen de `alto` píxeles.
    pub fn espejo_v(alto: f64) -> Self {
        Afin {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 0.0,
            e: -1.0,
            f: alto,
        }
    }

    /// Cizalla en grados sobre cada eje.
    pub fn cizalla_grados(x_grados: f64, y_grados: f64) -> Self {
        Afin {
            a: 1.0,
            b: x_grados.to_radians().tan(),
            c: 0.0,
            d: y_grados.to_radians().tan(),
            e: 1.0,
            f: 0.0,
        }
    }

    /// Aplica primero `self` y después `otra`.
    ///
    /// El orden es el de la lectura y no el del álgebra (`otra ∘ self`) a
    /// propósito: quien encadena transformaciones las piensa en el orden en que
    /// ocurren.
    pub fn luego(&self, otra: &Afin) -> Afin {
        Afin {
            a: otra.a * self.a + otra.b * self.d,
            b: otra.a * self.b + otra.b * self.e,
            c: otra.a * self.c + otra.b * self.f + otra.c,
            d: otra.d * self.a + otra.e * self.d,
            e: otra.d * self.b + otra.e * self.e,
            f: otra.d * self.c + otra.e * self.f + otra.f,
        }
    }

    pub fn aplicar(&self, (x, y): (f64, f64)) -> (f64, f64) {
        (
            self.a * x + self.b * y + self.c,
            self.d * x + self.e * y + self.f,
        )
    }

    pub fn determinante(&self) -> f64 {
        self.a * self.e - self.b * self.d
    }

    /// `true` si la transformación invierte la orientación — un espejo, o un
    /// número impar de ellos. Es lo que dispara el intercambio de los pares
    /// izquierda/derecha de los keypoints.
    pub fn es_espejo(&self) -> bool {
        self.determinante() < 0.0
    }

    /// `true` si un rectángulo sigue siendo un rectángulo después de aplicarla.
    ///
    /// Se cumple con giros, espejos y escalados por eje; no con cizalla. Es lo
    /// que decide si un OBB transformado es exacto o ajustado.
    pub fn conserva_rectangulos(&self) -> bool {
        (self.a * self.b + self.d * self.e).abs() < EPS_ORTOGONAL
    }

    pub fn inversa(&self) -> Option<Afin> {
        let det = self.determinante();
        if det.abs() < f64::EPSILON {
            return None;
        }
        let (a, b, d, e) = (self.e / det, -self.b / det, -self.d / det, self.a / det);
        Some(Afin {
            a,
            b,
            c: -(a * self.c + b * self.f),
            d,
            e,
            f: -(d * self.c + e * self.f),
        })
    }
}

// ─── Formas ─────────────────────────────────────────────────────────────────

/// Rectángulo eje-alineado, con la esquina superior izquierda y el tamaño — que
/// es como lo guarda `bbox` en `project.json`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub ancho: f64,
    pub alto: f64,
}

impl Rect {
    pub const fn nuevo(x: f64, y: f64, ancho: f64, alto: f64) -> Self {
        Rect { x, y, ancho, alto }
    }

    /// El marco de una imagen de `ancho` × `alto`.
    pub const fn marco(ancho: f64, alto: f64) -> Self {
        Rect {
            x: 0.0,
            y: 0.0,
            ancho,
            alto,
        }
    }

    pub fn esquinas(&self) -> [(f64, f64); 4] {
        [
            (self.x, self.y),
            (self.x + self.ancho, self.y),
            (self.x + self.ancho, self.y + self.alto),
            (self.x, self.y + self.alto),
        ]
    }

    pub fn area(&self) -> f64 {
        (self.ancho.max(0.0)) * (self.alto.max(0.0))
    }

    pub fn envolvente(puntos: &[(f64, f64)]) -> Option<Rect> {
        let (mut min_x, mut min_y) = (f64::INFINITY, f64::INFINITY);
        let (mut max_x, mut max_y) = (f64::NEG_INFINITY, f64::NEG_INFINITY);
        for &(x, y) in puntos {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
        if !min_x.is_finite() || !min_y.is_finite() {
            return None;
        }
        Some(Rect {
            x: min_x,
            y: min_y,
            ancho: max_x - min_x,
            alto: max_y - min_y,
        })
    }

    pub fn interseccion(&self, otro: &Rect) -> Option<Rect> {
        let x0 = self.x.max(otro.x);
        let y0 = self.y.max(otro.y);
        let x1 = (self.x + self.ancho).min(otro.x + otro.ancho);
        let y1 = (self.y + self.alto).min(otro.y + otro.alto);
        if x1 <= x0 || y1 <= y0 {
            return None;
        }
        Some(Rect {
            x: x0,
            y: y0,
            ancho: x1 - x0,
            alto: y1 - y0,
        })
    }

    pub fn contiene(&self, (x, y): (f64, f64)) -> bool {
        x >= self.x && y >= self.y && x <= self.x + self.ancho && y <= self.y + self.alto
    }
}

/// Caja orientada: centro, tamaño y giro en grados, igual que en `project.json`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Obb {
    pub cx: f64,
    pub cy: f64,
    pub ancho: f64,
    pub alto: f64,
    pub rotacion_grados: f64,
}

impl Obb {
    /// Las cuatro esquinas en orden: superior-izquierda, superior-derecha,
    /// inferior-derecha, inferior-izquierda, ya giradas.
    pub fn esquinas(&self) -> [(f64, f64); 4] {
        let (hw, hh) = (self.ancho / 2.0, self.alto / 2.0);
        let r = self.rotacion_grados.to_radians();
        let (sin, cos) = r.sin_cos();
        [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)].map(|(dx, dy)| {
            (
                self.cx + dx * cos - dy * sin,
                self.cy + dx * sin + dy * cos,
            )
        })
    }
}

/// Un OBB transformado, y si la transformación lo dejó exacto.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ObbTransformado {
    pub obb: Obb,
    /// `false` cuando hubo cizalla o perspectiva: el rectángulo se convirtió en
    /// un paralelogramo y lo que se devuelve es el OBB ajustado a sus esquinas,
    /// que **es más grande que el objeto**. Quien lo use tiene que poder avisar.
    pub exacta: bool,
}

// ─── Transformación de formas ───────────────────────────────────────────────

pub fn transformar_puntos(puntos: &[(f64, f64)], t: &Afin) -> Vec<(f64, f64)> {
    puntos.iter().map(|&p| t.aplicar(p)).collect()
}

/// Envolvente eje-alineada del rectángulo transformado.
///
/// Con giro la caja **engorda**: la envolvente de un rectángulo girado es mayor
/// que él. No hay forma de evitarlo con una caja eje-alineada, y por eso los
/// presets de modalidades lateralizadas limitan el giro a pocos grados.
pub fn transformar_rect(r: &Rect, t: &Afin) -> Rect {
    let puntos = transformar_puntos(&r.esquinas(), t);
    Rect::envolvente(&puntos).unwrap_or(*r)
}

/// Ajusta un OBB de rotación dada a una nube de puntos: proyecta sobre los ejes
/// girados y toma los extremos.
pub fn ajustar_obb(puntos: &[(f64, f64)], rotacion_grados: f64) -> Option<Obb> {
    if puntos.is_empty() {
        return None;
    }
    let r = rotacion_grados.to_radians();
    let (sin, cos) = r.sin_cos();
    let (mut min_u, mut max_u) = (f64::INFINITY, f64::NEG_INFINITY);
    let (mut min_v, mut max_v) = (f64::INFINITY, f64::NEG_INFINITY);
    for &(x, y) in puntos {
        let u = x * cos + y * sin;
        let v = -x * sin + y * cos;
        min_u = min_u.min(u);
        max_u = max_u.max(u);
        min_v = min_v.min(v);
        max_v = max_v.max(v);
    }
    let (cu, cv) = ((min_u + max_u) / 2.0, (min_v + max_v) / 2.0);
    Some(Obb {
        cx: cu * cos - cv * sin,
        cy: cu * sin + cv * cos,
        ancho: max_u - min_u,
        alto: max_v - min_v,
        rotacion_grados,
    })
}

/// Lleva un ángulo al intervalo (-90°, 90°].
///
/// Sumar o restar 180° a un rectángulo lo deja igual —intercambia esquinas
/// opuestas, no ejes—, así que normalizar no cambia la caja y evita que un
/// espejo devuelva 160° donde la anotación original decía 20°: el mismo
/// rectángulo escrito de dos formas se lee como un cambio y no lo es.
fn normalizar_angulo(mut grados: f64) -> f64 {
    while grados > 90.0 {
        grados -= 180.0;
    }
    while grados <= -90.0 {
        grados += 180.0;
    }
    grados
}

/// Transforma un OBB conservando su orientación.
pub fn transformar_obb(o: &Obb, t: &Afin) -> Option<ObbTransformado> {
    let esquinas = transformar_puntos(&o.esquinas(), t);
    let (e1x, e1y) = (
        esquinas[1].0 - esquinas[0].0,
        esquinas[1].1 - esquinas[0].1,
    );
    let rotacion = normalizar_angulo(e1y.atan2(e1x).to_degrees());
    let obb = ajustar_obb(&esquinas, rotacion)?;
    Some(ObbTransformado {
        obb,
        exacta: t.conserva_rectangulos(),
    })
}

// ─── Recorte ────────────────────────────────────────────────────────────────

/// Recorta un polígono contra un rectángulo (Sutherland–Hodgman).
///
/// Devuelve vacío cuando no queda nada dentro. Con polígonos cóncavos el
/// resultado puede traer aristas pegadas al borde; para lo que se usa aquí
/// —medir cuánto sobrevive y volver a escribir la anotación— eso da igual.
pub fn recortar_poligono(puntos: &[(f64, f64)], marco: &Rect) -> Vec<(f64, f64)> {
    if puntos.len() < 3 {
        return Vec::new();
    }
    let (x0, y0) = (marco.x, marco.y);
    let (x1, y1) = (marco.x + marco.ancho, marco.y + marco.alto);

    // (dentro?, intersección con el borde) para cada uno de los cuatro lados.
    let bordes: [(fn(&(f64, f64), f64) -> bool, fn(&(f64, f64), &(f64, f64), f64) -> (f64, f64), f64); 4] = [
        (|p, l| p.0 >= l, corte_vertical, x0),
        (|p, l| p.0 <= l, corte_vertical, x1),
        (|p, l| p.1 >= l, corte_horizontal, y0),
        (|p, l| p.1 <= l, corte_horizontal, y1),
    ];

    let mut salida = puntos.to_vec();
    for (dentro, corte, limite) in bordes {
        if salida.is_empty() {
            return Vec::new();
        }
        let entrada = std::mem::take(&mut salida);
        for i in 0..entrada.len() {
            let actual = entrada[i];
            let previo = entrada[(i + entrada.len() - 1) % entrada.len()];
            let actual_dentro = dentro(&actual, limite);
            let previo_dentro = dentro(&previo, limite);
            if actual_dentro {
                if !previo_dentro {
                    salida.push(corte(&previo, &actual, limite));
                }
                salida.push(actual);
            } else if previo_dentro {
                salida.push(corte(&previo, &actual, limite));
            }
        }
    }
    salida
}

fn corte_vertical(a: &(f64, f64), b: &(f64, f64), x: f64) -> (f64, f64) {
    let t = if (b.0 - a.0).abs() < f64::EPSILON {
        0.0
    } else {
        (x - a.0) / (b.0 - a.0)
    };
    (x, a.1 + t * (b.1 - a.1))
}

fn corte_horizontal(a: &(f64, f64), b: &(f64, f64), y: f64) -> (f64, f64) {
    let t = if (b.1 - a.1).abs() < f64::EPSILON {
        0.0
    } else {
        (y - a.1) / (b.1 - a.1)
    };
    (a.0 + t * (b.0 - a.0), y)
}

/// Qué fracción del rectángulo cae dentro del marco. 0.0 si no lo toca.
pub fn visibilidad_rect(r: &Rect, marco: &Rect) -> f64 {
    let area = r.area();
    if area <= 0.0 {
        return 0.0;
    }
    r.interseccion(marco).map(|i| i.area()).unwrap_or(0.0) / area
}

/// Qué fracción del polígono sobrevive al recorte, y el polígono recortado.
pub fn recortar_con_visibilidad(
    puntos: &[(f64, f64)],
    marco: &Rect,
) -> (Vec<(f64, f64)>, f64) {
    let area = polygon_area(puntos);
    let recortado = recortar_poligono(puntos, marco);
    if area <= 0.0 {
        return (recortado, 0.0);
    }
    let visible = polygon_area(&recortado) / area;
    (recortado, visible.clamp(0.0, 1.0))
}

// ─── Keypoints: los pares izquierda/derecha ─────────────────────────────────

/// El nombre del punto simétrico, si el nombre declara lateralidad.
///
/// Reconoce la palabra como **token** (separado por `_`, `-` o espacio), no como
/// subcadena: `left_eye` empareja con `right_eye`, pero `pelvis` no se convierte
/// en `perighthis` por llevar una `l` dentro.
pub fn pareja_lateral(nombre: &str) -> Option<String> {
    let mut cambiado = false;
    let mut salida = String::with_capacity(nombre.len() + 2);
    let mut token = String::new();

    let volcar = |token: &mut String, salida: &mut String, cambiado: &mut bool| {
        if let Some(op) = opuesto_lateral(token) {
            salida.push_str(&aplicar_caja(token, &op));
            *cambiado = true;
        } else {
            salida.push_str(token);
        }
        token.clear();
    };

    for ch in nombre.chars() {
        if ch == '_' || ch == '-' || ch == ' ' {
            volcar(&mut token, &mut salida, &mut cambiado);
            salida.push(ch);
        } else {
            token.push(ch);
        }
    }
    volcar(&mut token, &mut salida, &mut cambiado);

    if cambiado {
        Some(salida)
    } else {
        None
    }
}

fn opuesto_lateral(token: &str) -> Option<&'static str> {
    match token.to_lowercase().as_str() {
        "left" => Some("right"),
        "right" => Some("left"),
        "l" => Some("r"),
        "r" => Some("l"),
        "izquierdo" => Some("derecho"),
        "derecho" => Some("izquierdo"),
        "izquierda" => Some("derecha"),
        "derecha" => Some("izquierda"),
        "izq" => Some("der"),
        "der" => Some("izq"),
        _ => None,
    }
}

/// Copia el uso de mayúsculas del token original sobre su opuesto: `LEFT` →
/// `RIGHT`, `Left` → `Right`, `left` → `right`.
fn aplicar_caja(original: &str, nuevo: &str) -> String {
    let letras: Vec<char> = original.chars().filter(|c| c.is_alphabetic()).collect();
    let todo_mayus = !letras.is_empty() && letras.iter().all(|c| c.is_uppercase());
    if todo_mayus {
        return nuevo.to_uppercase();
    }
    let primera_mayus = letras.first().map(|c| c.is_uppercase()).unwrap_or(false);
    if primera_mayus {
        let mut it = nuevo.chars();
        return match it.next() {
            Some(c) => c.to_uppercase().collect::<String>() + it.as_str(),
            None => String::new(),
        };
    }
    nuevo.to_string()
}

/// Permutación que intercambia los pares izquierda/derecha: la posición `i` del
/// resultado dice **de qué punto** hay que tomar las coordenadas.
///
/// Los puntos sin pareja se quedan donde están. Devolver una permutación en vez
/// de reordenar la lista es lo que permite conservar los nombres en su sitio:
/// lo que viaja es la coordenada, no la etiqueta.
pub fn permutacion_espejo(nombres: &[String]) -> Vec<usize> {
    (0..nombres.len())
        .map(|i| {
            pareja_lateral(&nombres[i])
                .and_then(|pareja| {
                    nombres
                        .iter()
                        .position(|n| n.eq_ignore_ascii_case(&pareja) && !n.eq_ignore_ascii_case(&nombres[i]))
                })
                .unwrap_or(i)
        })
        .collect()
}

// ─── Máscaras ───────────────────────────────────────────────────────────────

/// Remuestrea una máscara RGBA por el inverso de la transformación.
///
/// Vecino más cercano a propósito: una máscara es categórica, y una
/// interpolación bilineal inventa bordes con alfa intermedio que después hay que
/// umbralizar de vuelta. Lo que cae fuera queda transparente.
pub fn warp_mascara(src: &RgbaImage, t: &Afin, ancho: u32, alto: u32) -> Option<RgbaImage> {
    let inv = t.inversa()?;
    let mut destino = RgbaImage::from_pixel(ancho, alto, Rgba([0, 0, 0, 0]));
    let (sw, sh) = (src.width() as f64, src.height() as f64);
    for y in 0..alto {
        for x in 0..ancho {
            let (sx, sy) = inv.aplicar((x as f64 + 0.5, y as f64 + 0.5));
            if sx < 0.0 || sy < 0.0 || sx >= sw || sy >= sh {
                continue;
            }
            destino.put_pixel(x, y, *src.get_pixel(sx as u32, sy as u32));
        }
    }
    Some(destino)
}

/// Píxeles marcados de una máscara: el mismo umbral de alfa que usa el
/// preparador de datasets (`draw_mask_on_target`).
pub fn cobertura(m: &RgbaImage) -> u64 {
    m.pixels().filter(|p| p[3] > 128).count() as u64
}

/// Decodifica el PNG base64 de una anotación de máscara, con o sin prefijo
/// `data:`. Devuelve también el prefijo para poder volver a escribirlo igual.
pub fn decodificar_mascara(base64png: &str) -> Result<(RgbaImage, String), String> {
    use base64::Engine;
    let (prefijo, cuerpo) = match base64png.find(',') {
        Some(pos) => (&base64png[..=pos], &base64png[pos + 1..]),
        None => ("", base64png),
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cuerpo)
        .map_err(|e| format!("Error decodificando base64 de máscara: {}", e))?;
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("Error cargando PNG de máscara: {}", e))?;
    Ok((img.to_rgba8(), prefijo.to_string()))
}

pub fn codificar_mascara(m: &RgbaImage, prefijo: &str) -> Result<String, String> {
    use base64::Engine;
    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgba8(m.clone())
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .map_err(|e| format!("Error codificando PNG de máscara: {}", e))?;
    Ok(format!(
        "{}{}",
        prefijo,
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

// ─── Anotaciones ────────────────────────────────────────────────────────────

/// Qué pasó con una anotación al transformarla.
#[derive(Debug, Clone)]
pub enum ResultadoAnotacion {
    /// Sobrevive, con la geometría ya movida.
    Conservada(Box<AnnotationEntry>),
    /// Se salió del marco, o quedó por debajo de la visibilidad mínima.
    Descartada,
    /// El tipo no tiene transformación geométrica definida aquí.
    ///
    /// No se transforma **ni se deja pasar tal cual**: dejarla pasar escribiría
    /// una etiqueta en las coordenadas viejas sobre píxeles nuevos, que es
    /// exactamente el fallo silencioso que este módulo existe para evitar. Quien
    /// llama decide: normalmente, no aumentar esa imagen.
    NoSoportada,
}

/// `true` si `transformar_anotacion` sabe mover este tipo.
pub fn tipo_soportado(tipo: &str) -> bool {
    matches!(
        tipo,
        "bbox"
            | "obb"
            | "polygon"
            | "instance-segmentation"
            | "keypoints"
            | "landmarks"
            | "mask"
            | "classification"
            | "multi-label-classification"
    )
}

/// Mueve una anotación con los píxeles y la recorta contra el marco de salida.
///
/// `min_visibilidad` es la fracción de la anotación que tiene que sobrevivir al
/// recorte para que se conserve. Dejar el 5 % de una lesión en una tesela enseña
/// al modelo que ese fragmento es la lesión entera.
pub fn transformar_anotacion(
    ann: &AnnotationEntry,
    t: &Afin,
    marco: &Rect,
    min_visibilidad: f64,
) -> ResultadoAnotacion {
    match ann.annotation_type.as_str() {
        // Sin geometría: la etiqueta es de la imagen entera y sobrevive a
        // cualquier transformación que no la recorte.
        "classification" | "multi-label-classification" => {
            ResultadoAnotacion::Conservada(Box::new(ann.clone()))
        }
        "bbox" => transformar_bbox(ann, t, marco, min_visibilidad),
        "obb" => transformar_obb_anotacion(ann, t, marco, min_visibilidad),
        "polygon" | "instance-segmentation" => transformar_poligono(ann, t, marco, min_visibilidad),
        "keypoints" => transformar_keypoints(ann, t, marco, min_visibilidad),
        "landmarks" => transformar_landmarks(ann, t, marco),
        "mask" => transformar_mascara(ann, t, marco, min_visibilidad),
        _ => ResultadoAnotacion::NoSoportada,
    }
}

fn con_datos(ann: &AnnotationEntry, data: Value) -> ResultadoAnotacion {
    let mut nueva = ann.clone();
    nueva.data = data;
    ResultadoAnotacion::Conservada(Box::new(nueva))
}

fn transformar_bbox(
    ann: &AnnotationEntry,
    t: &Afin,
    marco: &Rect,
    min_visibilidad: f64,
) -> ResultadoAnotacion {
    let Some(b) = parse_bbox(&ann.data) else {
        return ResultadoAnotacion::Descartada;
    };
    let r = transformar_rect(&Rect::nuevo(b.x, b.y, b.width, b.height), t);
    if visibilidad_rect(&r, marco) < min_visibilidad {
        return ResultadoAnotacion::Descartada;
    }
    let Some(recortado) = r.interseccion(marco) else {
        return ResultadoAnotacion::Descartada;
    };
    let mut data = ann.data.clone();
    fijar(&mut data, "x", recortado.x);
    fijar(&mut data, "y", recortado.y);
    fijar(&mut data, "width", recortado.ancho);
    fijar(&mut data, "height", recortado.alto);
    con_datos(ann, data)
}

fn transformar_obb_anotacion(
    ann: &AnnotationEntry,
    t: &Afin,
    marco: &Rect,
    min_visibilidad: f64,
) -> ResultadoAnotacion {
    let Some(o) = parse_obb(&ann.data) else {
        return ResultadoAnotacion::Descartada;
    };
    let origen = Obb {
        cx: o.x,
        cy: o.y,
        ancho: o.width,
        alto: o.height,
        rotacion_grados: o.rotation,
    };
    let Some(tr) = transformar_obb(&origen, t) else {
        return ResultadoAnotacion::Descartada;
    };
    // El recorte se mide sobre las esquinas, no sobre la envolvente: una caja
    // girada 45° tiene la mitad de su envolvente fuera de sí misma, y medir ahí
    // descartaría cajas que están enteras dentro del marco.
    let esquinas: Vec<(f64, f64)> = tr.obb.esquinas().to_vec();
    let (recortado, visible) = recortar_con_visibilidad(&esquinas, marco);
    if visible < min_visibilidad || recortado.len() < 3 {
        return ResultadoAnotacion::Descartada;
    }
    // Con el marco cortando la caja, se reajusta a lo que queda dentro
    // conservando la orientación: un OBB no sabe representar un trozo.
    let Some(final_obb) = ajustar_obb(&recortado, tr.obb.rotacion_grados) else {
        return ResultadoAnotacion::Descartada;
    };
    let mut data = ann.data.clone();
    let clave_x = if data.get("cx").is_some() { "cx" } else { "x" };
    let clave_y = if data.get("cy").is_some() { "cy" } else { "y" };
    fijar(&mut data, clave_x, final_obb.cx);
    fijar(&mut data, clave_y, final_obb.cy);
    fijar(&mut data, "width", final_obb.ancho);
    fijar(&mut data, "height", final_obb.alto);
    let clave_rot = if data.get("angle").is_some() {
        "angle"
    } else {
        "rotation"
    };
    fijar(&mut data, clave_rot, final_obb.rotacion_grados);
    con_datos(ann, data)
}

fn transformar_poligono(
    ann: &AnnotationEntry,
    t: &Afin,
    marco: &Rect,
    min_visibilidad: f64,
) -> ResultadoAnotacion {
    // No se usa `parse_polygon` porque exige tres puntos y aquí un polígono
    // degenerado se descarta con el mismo criterio que el resto.
    let Some(puntos) = puntos_de(&ann.data, "points") else {
        return ResultadoAnotacion::Descartada;
    };
    if puntos.len() < 3 {
        return ResultadoAnotacion::Descartada;
    }
    let movidos = transformar_puntos(&puntos, t);
    let (recortado, visible) = recortar_con_visibilidad(&movidos, marco);
    if visible < min_visibilidad || recortado.len() < 3 {
        return ResultadoAnotacion::Descartada;
    }
    let mut data = ann.data.clone();
    data["points"] = Value::Array(
        recortado
            .iter()
            .map(|&(x, y)| serde_json::json!({ "x": x, "y": y }))
            .collect(),
    );
    con_datos(ann, data)
}

fn transformar_keypoints(
    ann: &AnnotationEntry,
    t: &Afin,
    marco: &Rect,
    min_visibilidad: f64,
) -> ResultadoAnotacion {
    let Some(kps) = parse_keypoints(&ann.data) else {
        return ResultadoAnotacion::Descartada;
    };
    let movidos: Vec<(f64, f64)> = kps
        .points
        .iter()
        .map(|p| t.aplicar((p.x, p.y)))
        .collect();

    let nombres: Vec<String> = kps.points.iter().map(|p| p.name.clone()).collect();
    let perm = if t.es_espejo() {
        permutacion_espejo(&nombres)
    } else {
        (0..nombres.len()).collect()
    };

    let visibles_antes = kps.points.iter().filter(|p| p.visible).count();
    let mut salida = Vec::with_capacity(kps.points.len());
    let mut visibles_despues = 0usize;
    for i in 0..kps.points.len() {
        let origen = perm[i];
        let (x, y) = movidos[origen];
        let visible = kps.points[origen].visible && marco.contiene((x, y));
        if visible {
            visibles_despues += 1;
        }
        salida.push((x, y, visible));
    }

    if visibles_despues == 0 {
        return ResultadoAnotacion::Descartada;
    }
    if visibles_antes > 0 {
        let fraccion = visibles_despues as f64 / visibles_antes as f64;
        if fraccion < min_visibilidad {
            return ResultadoAnotacion::Descartada;
        }
    }

    let mut data = ann.data.clone();
    let clave = if data.get("points").is_some() {
        "points"
    } else {
        "keypoints"
    };
    if let Some(arr) = data.get_mut(clave).and_then(|v| v.as_array_mut()) {
        for (p, (x, y, visible)) in arr.iter_mut().zip(salida.iter()) {
            fijar(p, "x", *x);
            fijar(p, "y", *y);
            // Se respeta cómo venía escrita la visibilidad: hay proyectos con
            // booleano y otros con el 0/1/2 de COCO.
            let numerica = p.get("visible").map(|v| v.is_number()).unwrap_or(false);
            if let Some(obj) = p.as_object_mut() {
                obj.insert(
                    "visible".to_string(),
                    if numerica {
                        Value::from(if *visible { 2 } else { 0 })
                    } else {
                        Value::Bool(*visible)
                    },
                );
            }
        }
    }
    con_datos(ann, data)
}

fn transformar_landmarks(ann: &AnnotationEntry, t: &Afin, marco: &Rect) -> ResultadoAnotacion {
    let Some(lms) = parse_landmarks(&ann.data) else {
        return ResultadoAnotacion::Descartada;
    };
    let movidos: Vec<(f64, f64)> = lms.points.iter().map(|p| t.aplicar((p.x, p.y))).collect();
    // Un landmark no tiene bandera de visibilidad: si uno se sale, la anotación
    // ya no dice lo que decía y no hay forma de escribir "este falta".
    if movidos.iter().any(|&p| !marco.contiene(p)) {
        return ResultadoAnotacion::Descartada;
    }
    let nombres: Vec<String> = lms.points.iter().map(|p| p.name.clone()).collect();
    let perm = if t.es_espejo() {
        permutacion_espejo(&nombres)
    } else {
        (0..nombres.len()).collect()
    };
    let mut data = ann.data.clone();
    if let Some(arr) = data.get_mut("points").and_then(|v| v.as_array_mut()) {
        for (i, p) in arr.iter_mut().enumerate() {
            let (x, y) = movidos[perm[i]];
            fijar(p, "x", x);
            fijar(p, "y", y);
        }
    }
    con_datos(ann, data)
}

fn transformar_mascara(
    ann: &AnnotationEntry,
    t: &Afin,
    marco: &Rect,
    min_visibilidad: f64,
) -> ResultadoAnotacion {
    let Some(m) = parse_mask(&ann.data) else {
        return ResultadoAnotacion::Descartada;
    };
    let Ok((src, prefijo)) = decodificar_mascara(&m.base64png) else {
        return ResultadoAnotacion::Descartada;
    };
    let antes = cobertura(&src);
    let (ancho, alto) = (
        marco.ancho.round().max(1.0) as u32,
        marco.alto.round().max(1.0) as u32,
    );
    // El marco puede no empezar en el origen (una tesela): la máscara se escribe
    // en coordenadas del recorte, así que se lleva su esquina al (0,0).
    let hacia_marco = t.luego(&Afin::traslacion(-marco.x, -marco.y));
    let Some(destino) = warp_mascara(&src, &hacia_marco, ancho, alto) else {
        return ResultadoAnotacion::Descartada;
    };
    let despues = cobertura(&destino);
    if antes == 0 || despues == 0 {
        return ResultadoAnotacion::Descartada;
    }
    // La escala cambia el número de píxeles sin que la máscara pierda nada, así
    // que la visibilidad se mide contra lo que la escala predice, no contra el
    // conteo original.
    let esperados = antes as f64 * t.determinante().abs();
    if esperados > 0.0 && (despues as f64 / esperados) < min_visibilidad {
        return ResultadoAnotacion::Descartada;
    }
    let Ok(b64) = codificar_mascara(&destino, &prefijo) else {
        return ResultadoAnotacion::Descartada;
    };
    let mut data = ann.data.clone();
    let clave = if data.get("base64png").is_some() {
        "base64png"
    } else {
        "imageData"
    };
    data[clave] = Value::String(b64);
    con_datos(ann, data)
}

/// Escribe un número en el JSON sin romper el objeto si venía con otra forma.
fn fijar(data: &mut Value, clave: &str, valor: f64) {
    if let Some(obj) = data.as_object_mut() {
        obj.insert(clave.to_string(), Value::from(valor));
    }
}

fn puntos_de(data: &Value, clave: &str) -> Option<Vec<(f64, f64)>> {
    let arr = data.get(clave)?.as_array()?;
    let mut puntos = Vec::with_capacity(arr.len());
    for p in arr {
        puntos.push((p.get("x")?.as_f64()?, p.get("y")?.as_f64()?));
    }
    Some(puntos)
}

#[cfg(test)]
mod tests;
