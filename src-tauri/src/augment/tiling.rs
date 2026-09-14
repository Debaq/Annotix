//! Teselado: partir una imagen grande en una rejilla con solape, y llevarse las
//! anotaciones a cada trozo.
//!
//! ## El caso
//!
//! Una lámina de histopatología o una radiografía de 4000×3000 entrando a un
//! modelo de 640×640. Redimensionarla destruye justo lo que hay que detectar:
//! una mitosis de 30 píxeles se convierte en cinco.
//!
//! La rejilla se configura por **filas × columnas + solape**, que es como se
//! piensa —«que las teselas se pisen un 15 %»— y no por tamaño de tesela en
//! píxeles, que obliga a dividir a mano y deja restos.
//!
//! ## Por qué el solape no es un detalle
//!
//! Sin solape, un objeto que cae en la frontera queda partido en dos trozos y
//! ninguno de los dos es el objeto: el modelo aprende medias lesiones. Con
//! solape, ese objeto aparece **entero** en al menos una tesela mientras no sea
//! más grande que la banda solapada. 15–25 % cubre objetos de hasta ese tamaño
//! relativo.
//!
//! ## Lo que el teselado no resuelve
//!
//! La inferencia. Un modelo entrenado por teselas hay que aplicarlo por teselas
//! y recomponer, con supresión de no-máximos en las zonas de solape. Eso es
//! trabajo del subsistema de inferencia y no de aquí — y conviene decirlo en la
//! UI al activar el teselado, o alguien entrenará un modelo que no sabrá usar.

use image::RgbaImage;
use rand::Rng;
use serde::{Deserialize, Serialize};

use super::geometry::{transformar_anotacion, Afin, Rect, ResultadoAnotacion};
use crate::store::project_file::{AnnotationEntry, ImageEntry};

/// Qué hacer con las teselas que no tienen ninguna anotación.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmptyTilePolicy {
    /// Ninguna entra al dataset.
    Discard,
    /// Todas entran. En una lámina, el 95 % es tejido sano: el dataset se
    /// inunda de fondo y el modelo aprende a no detectar nada.
    KeepAll,
    /// Entra la fracción de `empty_keep_ratio`. Es el comportamiento por
    /// defecto, con el 10 % que recomienda ultralytics.
    KeepFraction,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TilingSpec {
    pub rows: u32,
    pub cols: u32,
    /// Solape entre teselas vecinas, en fracción del lado de la tesela.
    pub overlap: f64,
    pub empty_tiles: EmptyTilePolicy,
    pub empty_keep_ratio: f64,
}

impl Default for TilingSpec {
    fn default() -> Self {
        TilingSpec {
            rows: 2,
            cols: 2,
            overlap: 0.15,
            empty_tiles: EmptyTilePolicy::KeepFraction,
            empty_keep_ratio: 0.1,
        }
    }
}

/// Tope del solape. Por encima de la mitad del lado, una tesela empieza antes de
/// donde acabó la anterior menos su propia mitad: la rejilla deja de avanzar y
/// el número de teselas se dispara sin cubrir nada nuevo.
pub const SOLAPE_MAXIMO: f64 = 0.5;

impl TilingSpec {
    pub fn validar(&self) -> Result<(), String> {
        if self.rows == 0 || self.cols == 0 {
            return Err("El teselado necesita al menos una fila y una columna".into());
        }
        if !(0.0..SOLAPE_MAXIMO).contains(&self.overlap) {
            return Err(format!(
                "El solape tiene que estar entre 0 y {SOLAPE_MAXIMO} (llegó {})",
                self.overlap
            ));
        }
        if !(0.0..=1.0).contains(&self.empty_keep_ratio) {
            return Err(format!(
                "La fracción de teselas vacías que se conserva va entre 0 y 1 (llegó {})",
                self.empty_keep_ratio
            ));
        }
        Ok(())
    }

    /// Cuántas teselas salen de cada imagen.
    pub fn total(&self) -> u32 {
        self.rows * self.cols
    }
}

/// Una casilla de la rejilla.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tesela {
    pub fila: u32,
    pub columna: u32,
    pub rect: Rect,
}

/// De dónde salió una tesela. Va al manifiesto del dataset —no a
/// `project.json`— porque describe un artefacto del entrenamiento y no el
/// corpus: es lo que permite recomponer la predicción sobre la imagen completa,
/// y lo que deja agrupar por imagen de origen aunque no haya sujeto.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Procedencia {
    pub tile_file: String,
    pub source_image_id: String,
    pub source_file: String,
    pub subject_id: Option<String>,
    pub row: u32,
    pub col: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// La rejilla sobre una imagen de `ancho` × `alto`.
///
/// Con `c` columnas y solape `o`, el lado de la tesela sale de que la primera
/// empieza en 0, la última acaba en el borde y cada una avanza `lado·(1−o)`:
///
/// ```text
/// ancho = lado + (c − 1)·lado·(1 − o)
/// ```
pub fn rejilla(ancho: f64, alto: f64, spec: &TilingSpec) -> Vec<Tesela> {
    if spec.validar().is_err() || ancho <= 0.0 || alto <= 0.0 {
        return Vec::new();
    }
    let lado = |total: f64, n: u32| total / (1.0 + (n as f64 - 1.0) * (1.0 - spec.overlap));
    let (tw, th) = (lado(ancho, spec.cols), lado(alto, spec.rows));
    let (paso_x, paso_y) = (tw * (1.0 - spec.overlap), th * (1.0 - spec.overlap));

    let mut teselas = Vec::with_capacity(spec.total() as usize);
    for fila in 0..spec.rows {
        for columna in 0..spec.cols {
            // La última se pega al borde: el redondeo acumulado no puede dejar
            // una franja de la imagen sin cubrir.
            let x = if columna == spec.cols - 1 {
                ancho - tw
            } else {
                columna as f64 * paso_x
            };
            let y = if fila == spec.rows - 1 {
                alto - th
            } else {
                fila as f64 * paso_y
            };
            teselas.push(Tesela {
                fila,
                columna,
                rect: Rect::nuevo(x.max(0.0), y.max(0.0), tw, th),
            });
        }
    }
    teselas
}

/// Lo que quedó de las anotaciones dentro de una tesela.
#[derive(Debug, Clone, Default)]
pub struct AnotacionesDeTesela {
    pub anotaciones: Vec<AnnotationEntry>,
    /// Cuántas se descartaron por quedar por debajo de la visibilidad mínima.
    pub descartadas: usize,
    /// Cuántas eran de un tipo que la geometría no sabe mover. No es un detalle
    /// de contabilidad: con una sola, la imagen no se debería teselar —quien
    /// llama decide, pero necesita saberlo.
    pub no_soportadas: usize,
}

/// Lleva las anotaciones de la imagen a las coordenadas de la tesela.
///
/// Una anotación cortada por el borde se recorta, y si de ella queda menos del
/// `min_visibilidad` se descarta **en esa tesela**: dejar un fragmento del 5 %
/// de una lesión enseña al modelo que ese fragmento es la lesión entera. En la
/// tesela vecina, con el solape, la misma anotación puede entrar completa.
pub fn anotaciones_de_tesela(
    anotaciones: &[AnnotationEntry],
    tesela: &Tesela,
    min_visibilidad: f64,
) -> AnotacionesDeTesela {
    let t = Afin::traslacion(-tesela.rect.x, -tesela.rect.y);
    let marco = Rect::marco(tesela.rect.ancho, tesela.rect.alto);
    let mut salida = AnotacionesDeTesela::default();
    for ann in anotaciones {
        match transformar_anotacion(ann, &t, &marco, min_visibilidad) {
            ResultadoAnotacion::Conservada(a) => salida.anotaciones.push(*a),
            ResultadoAnotacion::Descartada => salida.descartadas += 1,
            ResultadoAnotacion::NoSoportada => salida.no_soportadas += 1,
        }
    }
    salida
}

/// Recorta el rectángulo de la tesela. Lo que se salga de la imagen queda
/// transparente, que sólo puede pasar por redondeo de un píxel.
pub fn recortar_imagen(img: &RgbaImage, rect: &Rect) -> RgbaImage {
    let x = rect.x.round().max(0.0) as u32;
    let y = rect.y.round().max(0.0) as u32;
    let ancho = rect.ancho.round().max(1.0) as u32;
    let alto = rect.alto.round().max(1.0) as u32;
    let mut salida = RgbaImage::new(ancho, alto);
    for dy in 0..alto {
        for dx in 0..ancho {
            let (sx, sy) = (x + dx, y + dy);
            if sx < img.width() && sy < img.height() {
                salida.put_pixel(dx, dy, *img.get_pixel(sx, sy));
            }
        }
    }
    salida
}

/// Si una tesela sin anotaciones entra al dataset.
pub fn conservar_vacia(spec: &TilingSpec, rng: &mut impl Rng) -> bool {
    match spec.empty_tiles {
        EmptyTilePolicy::Discard => false,
        EmptyTilePolicy::KeepAll => true,
        EmptyTilePolicy::KeepFraction => rng.gen::<f64>() < spec.empty_keep_ratio,
    }
}

/// La entrada de dataset de una tesela, y su procedencia.
///
/// **La tesela hereda el sujeto de su imagen.** Sin eso, doce teselas del mismo
/// paciente se reparten entre train y test y la métrica mide memoria: es la fuga
/// de la etapa 1 a otra escala. Aquí el teselado ocurre después del reparto y
/// sólo sobre train, así que la herencia es por coherencia del dato —y por si
/// alguien vuelve a repartir sobre lo teselado.
pub fn derivar_entrada(
    origen: &ImageEntry,
    tesela: &Tesela,
    anotaciones: Vec<AnnotationEntry>,
) -> (ImageEntry, Procedencia) {
    let sufijo = format!("r{}c{}", tesela.fila, tesela.columna);
    let (tronco, _) = partir_extension(&origen.file);
    let archivo = format!("{tronco}__{sufijo}.png");

    let entrada = ImageEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: format!("{} [{}]", origen.name, sufijo),
        file: archivo.clone(),
        width: tesela.rect.ancho.round().max(1.0) as u32,
        height: tesela.rect.alto.round().max(1.0) as u32,
        uploaded: origen.uploaded,
        annotated: origen.annotated,
        status: origen.status.clone(),
        annotations: anotaciones,
        subject_id: origen.subject_id.clone(),
        video_id: origen.video_id.clone(),
        frame_index: origen.frame_index,
        // Una tesela sin anotaciones es un fondo de verdad —el recorte se miró
        // entero— y no una imagen que nadie anotó todavía.
        is_background: true,
        locked_by: None,
        lock_expires: None,
        download_status: None,
        predictions: Vec::new(),
        medical: origen.medical.clone(),
        // Las capas de lectura y los rechazos describen el trabajo sobre el
        // corpus, no un artefacto del entrenamiento: no se arrastran.
        readings: Vec::new(),
        rejected: Vec::new(),
    };

    let procedencia = Procedencia {
        tile_file: archivo,
        source_image_id: origen.id.clone(),
        source_file: origen.file.clone(),
        subject_id: origen.subject_id.clone(),
        row: tesela.fila,
        col: tesela.columna,
        x: tesela.rect.x,
        y: tesela.rect.y,
        width: tesela.rect.ancho,
        height: tesela.rect.alto,
    };

    (entrada, procedencia)
}

fn partir_extension(archivo: &str) -> (&str, &str) {
    match archivo.rfind('.') {
        Some(pos) => (&archivo[..pos], &archivo[pos + 1..]),
        None => (archivo, ""),
    }
}

#[cfg(test)]
mod tests;
