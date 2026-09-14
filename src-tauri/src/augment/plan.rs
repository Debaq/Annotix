//! El plan: qué se aplica, cuántas veces, con qué semilla, y la ejecución que lo
//! materializa en disco.
//!
//! ## El orden, que es parte del diseño
//!
//! ```text
//! seleccionar clases → repartir (train/val/test) → [sólo train] teselar → aumentar
//! ```
//!
//! Repartir **antes** de teselar y aumentar no es un detalle de implementación:
//! si se repartiera después, dos teselas de la misma imagen —o dos variantes de
//! la misma foto— caerían en train y en test, y la métrica saldría inflada sin
//! que nada lo delatara. Es la fuga de la etapa 1 por un camino nuevo.
//!
//! Y **sólo sobre train**. Medir sobre imágenes aumentadas mide cómo le va al
//! modelo con las deformaciones que uno mismo eligió, no con datos nuevos. Es un
//! error fácil de cometer y difícil de detectar después, así que la función ni
//! siquiera recibe val y test: no hay forma de pedírselo.
//!
//! ## Determinismo
//!
//! El mismo plan sobre el mismo corpus da el mismo dataset. La semilla de cada
//! variante no sale de un generador que avanza mientras se recorre el corpus,
//! sino de mezclar (semilla base, id de imagen, tesela, número de variante): así
//! no depende del orden del recorrido ni de cuántas imágenes se saltaron por el
//! camino, y una imagen añadida al corpus no cambia las variantes de las demás.
//!
//! ## Lo que las entradas generadas tienen de raro
//!
//! `ImageEntry::file` sale de aquí como **ruta absoluta**, en todas las entradas
//! y no sólo en las generadas. Los quince preparadores resuelven la imagen con
//! `images_dir.join(&entry.file)`, y `Path::join` con una ruta absoluta devuelve
//! la ruta absoluta: así el dataset puede mezclar imágenes del proyecto con
//! imágenes materializadas en otro directorio sin tocar ni un preparador. Estas
//! entradas no vuelven nunca a `project.json` — describen el dataset, no el
//! corpus.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use image::RgbaImage;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};

use super::geometry::{self, Afin, Rect, ResultadoAnotacion};
use super::tiling::{self, Procedencia, TilingSpec};
use super::transforms::{aplicar_fotometrica, Contexto, Fotometrica, Muestra, TransformSpec};
use crate::contract::readiness::{es_lateralizada, Aviso};
use crate::store::project_file::ImageEntry;

// ─── El plan ────────────────────────────────────────────────────────────────

/// Cómo se reparte el número de variantes entre las clases.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BalanceMode {
    /// El mismo factor para todas. El comportamiento simple.
    Uniform,
    /// Se calcula por clase para acercar los conteos al de la mayoritaria, con
    /// `max_factor` de tope.
    Balance,
    /// El usuario fija el factor de cada clase.
    Manual,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AugmentationPlan {
    pub enabled: bool,
    /// Cuántas variantes por imagen de train. 0 = sólo las originales (o sólo
    /// las teselas, si hay teselado).
    pub factor: u32,
    pub balance: BalanceMode,
    /// Factor por clase, para `Manual`. La clave es el `class_id`.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub per_class_factor: BTreeMap<i64, u32>,
    /// Tope del modo `Balance`. Sin él, una clase con 2 ejemplos frente a una de
    /// 400 pediría 200 variantes de las mismas 2 imágenes.
    pub max_factor: u32,
    /// Semilla. `None` = derivada del id del proyecto.
    ///
    /// Viaja como texto por el mismo motivo que la del reparto: es un entero de
    /// 64 bits y `JSON.parse` redondearía cualquier cosa por encima de 2^53, así
    /// que el informe enseñaría para reproducir el dataset una semilla que no es
    /// la que se usó.
    #[serde(
        default,
        with = "crate::store::project_file::serde_u64_texto",
        skip_serializing_if = "Option::is_none"
    )]
    pub seed: Option<u64>,
    pub transforms: Vec<TransformSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tiling: Option<TilingSpec>,
    /// Fracción mínima de una anotación que tiene que sobrevivir al recorte.
    pub min_visibility: f64,
}

impl Default for AugmentationPlan {
    fn default() -> Self {
        AugmentationPlan {
            // Apagada: materializar un dataset varias veces más grande que el
            // corpus no es algo que deba pasar sin que nadie lo haya pedido.
            enabled: false,
            factor: 2,
            balance: BalanceMode::Uniform,
            per_class_factor: BTreeMap::new(),
            max_factor: 10,
            seed: None,
            transforms: Vec::new(),
            tiling: None,
            min_visibility: 0.3,
        }
    }
}

impl AugmentationPlan {
    pub fn validar(&self) -> Result<(), String> {
        if !(0.0..=1.0).contains(&self.min_visibility) {
            return Err(format!(
                "La visibilidad mínima va entre 0 y 1 (llegó {})",
                self.min_visibility
            ));
        }
        if let Some(t) = &self.tiling {
            t.validar()?;
        }
        Ok(())
    }

    /// `true` si el plan va a escribir algo: sin transformaciones ni teselado,
    /// un factor de 20 sólo copiaría la misma imagen veinte veces.
    pub fn hace_algo(&self) -> bool {
        self.enabled
            && (self.tiling.is_some() || (self.factor > 0 && !self.transforms.is_empty()))
    }

    /// Avisos de corrección contra la modalidad del corpus.
    ///
    /// Un corpus lateralizado con volteo horizontal no está peor documentado:
    /// está mal entrenado, porque no puede aprender lateralidad y la lateralidad
    /// es diagnóstica. Se comprueba contra el mismo `es_lateralizada` que usa la
    /// previsión del contrato, para que el aviso previo y este digan lo mismo.
    pub fn avisos_de_modalidad(&self, modalidad: Option<&str>) -> Vec<Aviso> {
        let mut avisos = Vec::new();
        if !self.enabled {
            return avisos;
        }
        let lateralizada = modalidad.is_some_and(es_lateralizada);
        if lateralizada && self.transforms.iter().any(|t| t.invierte_lateralidad()) {
            avisos.push(Aviso {
                code: "volteo_en_modalidad_lateralizada".into(),
                kind: "correccion".into(),
                detail: modalidad.map(|m| m.to_string()),
            });
        }
        if self.tiling.is_some() {
            // Un modelo entrenado por teselas hay que aplicarlo por teselas y
            // recomponer. Quien no lo sepa entrenará un modelo que no sabrá usar.
            avisos.push(Aviso {
                code: "teselado_exige_inferencia_por_teselas".into(),
                kind: "correccion".into(),
                detail: None,
            });
        }
        avisos
    }
}

// ─── Factores por clase ─────────────────────────────────────────────────────

/// Anotaciones por clase en el conjunto que entra.
pub fn conteo_por_clase(imagenes: &[ImageEntry]) -> BTreeMap<i64, usize> {
    let mut cuenta = BTreeMap::new();
    for img in imagenes {
        for ann in &img.annotations {
            *cuenta.entry(ann.class_id).or_insert(0) += 1;
        }
    }
    cuenta
}

/// Cuántas variantes le tocan a cada clase.
///
/// En `Balance`, el factor acerca cada clase a la mayoritaria: una clase con 20
/// ejemplos frente a una de 400 pide ×20, topado por `max_factor`.
pub fn factores_por_clase(plan: &AugmentationPlan, imagenes: &[ImageEntry]) -> BTreeMap<i64, u32> {
    let cuenta = conteo_por_clase(imagenes);
    match plan.balance {
        BalanceMode::Uniform => cuenta.keys().map(|&c| (c, plan.factor)).collect(),
        BalanceMode::Manual => cuenta
            .keys()
            .map(|&c| {
                (
                    c,
                    plan.per_class_factor.get(&c).copied().unwrap_or(plan.factor),
                )
            })
            .collect(),
        BalanceMode::Balance => {
            let mayor = cuenta.values().copied().max().unwrap_or(0);
            cuenta
                .iter()
                .map(|(&clase, &n)| {
                    let factor = if n == 0 {
                        plan.factor
                    } else {
                        // −1 porque el original ya cuenta como un ejemplo: para
                        // igualar 400 con 20 hacen falta 19 variantes, no 20.
                        (mayor.div_ceil(n) as u32).saturating_sub(1)
                    };
                    (clase, factor.min(plan.max_factor))
                })
                .collect()
        }
    }
}

/// Cuántas variantes genera una imagen: la mayor de las de sus clases.
///
/// Una imagen con una clase rara y una común se multiplica por la rara. Lo
/// contrario —tomar la menor— dejaría la clase rara sin multiplicar cada vez que
/// comparte imagen con una común, que es casi siempre.
pub fn factor_de_imagen(img: &ImageEntry, factores: &BTreeMap<i64, u32>, por_defecto: u32) -> u32 {
    img.annotations
        .iter()
        .filter_map(|a| factores.get(&a.class_id).copied())
        .max()
        .unwrap_or(por_defecto)
}

/// Clases que se multiplican mucho teniendo pocos ejemplos.
///
/// Multiplicar por 20 una clase con 2 ejemplos no crea 22 casos: crea 2 casos
/// vistos 20 veces, y el modelo los memoriza. El equilibrado por augmentación
/// tapa el desbalance en la métrica de entrenamiento sin arreglar la falta de
/// datos, así que se dice — y baja el nivel de evidencia del contrato como todo
/// lo demás.
const POCOS_EJEMPLOS: usize = 10;

pub fn avisos_de_balance(plan: &AugmentationPlan, imagenes: &[ImageEntry]) -> Vec<Aviso> {
    let cuenta = conteo_por_clase(imagenes);
    let factores = factores_por_clase(plan, imagenes);
    let mut avisos = Vec::new();
    for (clase, n) in cuenta {
        let factor = factores.get(&clase).copied().unwrap_or(0);
        if n <= POCOS_EJEMPLOS && factor >= 2 {
            avisos.push(Aviso {
                code: "clase_con_pocos_ejemplos_multiplicada".into(),
                kind: "evidencia".into(),
                detail: Some(format!("{clase}:{n}x{factor}")),
            });
        }
    }
    avisos
}

// ─── Lo que ya está materializado ───────────────────────────────────────────

/// Qué ejes de augmentación **ya vienen aplicados** en el dataset, con los
/// nombres que usa ultralytics.
///
/// Existe para que la augmentación en línea de un backend y la materializada no
/// se pisen. Volver a voltear lo que ya se volteó no es sólo trabajo repetido:
/// deshace la mitad de las variantes y, en un corpus lateralizado, vuelve a
/// meter el volteo que el preset había puesto a cero.
///
/// Es **una sola verdad**: la traducción vive aquí y la leen tanto el generador
/// de YOLO como el de `smp`. Dos tablas equivalentes en dos archivos se separan.
pub fn ejes_materializados(ids: &[String]) -> BTreeSet<&'static str> {
    let mut ejes = BTreeSet::new();
    for id in ids {
        match id.as_str() {
            "flip_h" => {
                ejes.insert("fliplr");
            }
            "flip_v" => {
                ejes.insert("flipud");
            }
            "rotate" => {
                ejes.insert("degrees");
            }
            "shear" => {
                ejes.insert("shear");
            }
            "zoom" => {
                ejes.insert("scale");
            }
            "translate" => {
                ejes.insert("translate");
            }
            // El brillo y el contraste de ultralytics viajan en el canal V del
            // HSV; el tono y la saturación tienen los suyos.
            "brightness_contrast" => {
                ejes.insert("hsv_v");
            }
            "hue" => {
                ejes.insert("hsv_h");
            }
            "saturation" => {
                ejes.insert("hsv_s");
            }
            "random_erasing" => {
                ejes.insert("erasing");
            }
            // Escala de grises, ruido y desenfoques no tienen equivalente en la
            // augmentación de ultralytics: no hay nada que apagar.
            _ => {}
        }
    }
    ejes
}

// ─── Ejecución ──────────────────────────────────────────────────────────────

/// De dónde salió cada imagen que no estaba en el corpus.
///
/// Va al manifiesto del dataset, no a `project.json`: describe el artefacto del
/// entrenamiento. Es lo que permite abrir una imagen generada y saber qué se le
/// hizo — que es la mitad del motivo de haber elegido augmentación fuera de
/// línea.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registro {
    pub file: String,
    pub source_image_id: String,
    pub source_file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,
    /// La tesela de la que salió, cuando hay teselado.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tile: Option<Procedencia>,
    /// Número de variante. 0 es la imagen base (el original o la tesela sin
    /// transformar).
    pub variant: u32,
    /// Identificadores de las transformaciones que se aplicaron, en orden.
    pub transforms: Vec<String>,
    /// Semilla de esta variante, como texto.
    pub seed: String,
}

#[derive(Debug, Clone, Default)]
pub struct Materializado {
    /// Todas las imágenes de train: las que quedan del corpus y las generadas.
    pub imagenes: Vec<ImageEntry>,
    pub manifiesto: Vec<Registro>,
    pub avisos: Vec<Aviso>,
    /// Cuántas imágenes nuevas se escribieron en disco.
    pub generadas: usize,
}

pub struct EntradaPlan<'a> {
    pub project_id: &'a str,
    /// Dónde están las imágenes del proyecto.
    pub images_dir: &'a Path,
    /// Dónde escribir las generadas.
    pub destino: &'a Path,
    /// Modalidad dominante del corpus, para los avisos de corrección.
    pub modalidad: Option<&'a str>,
}

/// Materializa el plan sobre las imágenes de **train**.
///
/// No recibe val ni test a propósito: aumentar el conjunto con el que se mide es
/// un error difícil de detectar después, y la forma de no cometerlo es no tener
/// dónde cometerlo.
pub fn materializar(
    plan: &AugmentationPlan,
    entrada: &EntradaPlan,
    train: &[ImageEntry],
) -> Result<Materializado, String> {
    plan.validar()?;
    let mut salida = Materializado::default();
    salida.avisos.extend(plan.avisos_de_modalidad(entrada.modalidad));

    if !plan.hace_algo() {
        salida.imagenes = train
            .iter()
            .map(|img| con_ruta_absoluta(img, entrada.images_dir))
            .collect();
        return Ok(salida);
    }

    salida.avisos.extend(avisos_de_balance(plan, train));
    let factores = factores_por_clase(plan, train);
    let base = plan.seed.unwrap_or_else(|| derivar_semilla(entrada.project_id));
    std::fs::create_dir_all(entrada.destino)
        .map_err(|e| format!("Error creando el directorio de augmentación: {e}"))?;

    let mut tipos_no_soportados = std::collections::BTreeSet::new();

    for img in train {
        let ruta = entrada.images_dir.join(&img.file);
        let bitmap = match image::open(&ruta) {
            Ok(i) => i.to_rgba8(),
            Err(e) => {
                // La misma decisión que toman los preparadores con una imagen
                // que falta: avisar y seguir, no abortar el entrenamiento.
                log::warn!("No se pudo abrir {ruta:?} para aumentar: {e}");
                salida.imagenes.push(con_ruta_absoluta(img, entrada.images_dir));
                continue;
            }
        };

        // Una imagen con una anotación que la geometría no sabe mover no se
        // toca: transformarla escribiría etiquetas viejas sobre píxeles nuevos.
        let no_soportadas: Vec<&str> = img
            .annotations
            .iter()
            .map(|a| a.annotation_type.as_str())
            .filter(|t| !geometry::tipo_soportado(t))
            .collect();
        if !no_soportadas.is_empty() {
            for t in no_soportadas {
                tipos_no_soportados.insert(t.to_string());
            }
            salida.imagenes.push(con_ruta_absoluta(img, entrada.images_dir));
            continue;
        }

        // ── Bases: la imagen entera, o sus teselas ──────────────────────────
        let mut bases: Vec<(ImageEntry, RgbaImage, Option<Procedencia>)> = Vec::new();
        match &plan.tiling {
            None => bases.push((con_ruta_absoluta(img, entrada.images_dir), bitmap, None)),
            Some(spec) => {
                let mut rng = rng_de(base, &img.id, 0, 0);
                for tesela in tiling::rejilla(bitmap.width() as f64, bitmap.height() as f64, spec) {
                    let recorte =
                        tiling::anotaciones_de_tesela(&img.annotations, &tesela, plan.min_visibility);
                    if recorte.anotaciones.is_empty() && !tiling::conservar_vacia(spec, &mut rng) {
                        continue;
                    }
                    let pixeles = tiling::recortar_imagen(&bitmap, &tesela.rect);
                    let (mut entrada_tesela, procedencia) =
                        tiling::derivar_entrada(img, &tesela, recorte.anotaciones);
                    let ruta = escribir(&pixeles, entrada.destino, &entrada_tesela.name)?;
                    entrada_tesela.file = ruta;
                    salida.generadas += 1;
                    salida.manifiesto.push(Registro {
                        file: entrada_tesela.name.clone(),
                        source_image_id: img.id.clone(),
                        source_file: img.file.clone(),
                        subject_id: img.subject_id.clone(),
                        tile: Some(procedencia.clone()),
                        variant: 0,
                        transforms: Vec::new(),
                        seed: base.to_string(),
                    });
                    bases.push((entrada_tesela, pixeles, Some(procedencia)));
                }
            }
        }

        // ── Variantes de cada base ──────────────────────────────────────────
        let cuantas = factor_de_imagen(img, &factores, plan.factor);
        for (indice_base, (entrada_base, pixeles, procedencia)) in bases.into_iter().enumerate() {
            for v in 1..=cuantas {
                let semilla = mezclar(base, &img.id, indice_base as u64, v as u64);
                let mut rng = StdRng::seed_from_u64(semilla);
                let Some((mut generada, bitmap_generado, aplicadas)) =
                    generar_variante(plan, &entrada_base, &pixeles, v, &mut rng)
                else {
                    continue;
                };
                let ruta = escribir(&bitmap_generado, entrada.destino, &generada.name)?;
                generada.file = ruta;
                salida.generadas += 1;
                salida.manifiesto.push(Registro {
                    file: generada.name.clone(),
                    source_image_id: img.id.clone(),
                    source_file: img.file.clone(),
                    subject_id: img.subject_id.clone(),
                    tile: procedencia.clone(),
                    variant: v,
                    transforms: aplicadas,
                    seed: semilla.to_string(),
                });
                salida.imagenes.push(generada);
            }
            salida.imagenes.push(entrada_base);
        }
    }

    for tipo in tipos_no_soportados {
        salida.avisos.push(Aviso {
            code: "tipo_de_anotacion_sin_augmentacion".into(),
            kind: "evidencia".into(),
            detail: Some(tipo),
        });
    }

    Ok(salida)
}

/// Genera una variante. `None` si no quedó ninguna anotación en pie: una imagen
/// cuyo giro dejó fuera todo lo etiquetado entraría al dataset como fondo, y eso
/// no es lo que nadie pidió al subir el factor.
fn generar_variante(
    plan: &AugmentationPlan,
    base: &ImageEntry,
    pixeles: &RgbaImage,
    numero: u32,
    rng: &mut StdRng,
) -> Option<(ImageEntry, RgbaImage, Vec<String>)> {
    let (ancho, alto) = (pixeles.width(), pixeles.height());
    let cajas: Vec<Rect> = base
        .annotations
        .iter()
        .filter_map(geometry::envolvente_anotacion)
        .collect();
    let ctx = Contexto {
        ancho: ancho as f64,
        alto: alto as f64,
        cajas: &cajas,
        max_oclusion: 0.5,
    };

    // Las geométricas se componen en una sola matriz y se aplican de una vez:
    // remuestrear la imagen una vez por transformación la emborrona sin que
    // nadie lo haya pedido.
    let mut afin = Afin::identidad();
    let mut fotometricas: Vec<Fotometrica> = Vec::new();
    let mut aplicadas = Vec::new();
    for spec in &plan.transforms {
        match spec.muestrear(rng, &ctx) {
            Some(Muestra::Geometrica(t)) => {
                afin = afin.luego(&t);
                aplicadas.push(spec.id().to_string());
            }
            Some(Muestra::Fotometrica(f)) => {
                fotometricas.push(f);
                aplicadas.push(spec.id().to_string());
            }
            None => {}
        }
    }
    if aplicadas.is_empty() {
        return None;
    }

    let mut bitmap = if afin == Afin::identidad() {
        pixeles.clone()
    } else {
        geometry::warp_imagen(pixeles, &afin, ancho, alto)?
    };
    for f in &fotometricas {
        bitmap = aplicar_fotometrica(&bitmap, f, rng);
    }

    let marco = Rect::marco(ancho as f64, alto as f64);
    let mut anotaciones = Vec::with_capacity(base.annotations.len());
    for ann in &base.annotations {
        match geometry::transformar_anotacion(ann, &afin, &marco, plan.min_visibility) {
            ResultadoAnotacion::Conservada(a) => anotaciones.push(*a),
            // El tipo ya se comprobó antes de llegar aquí.
            ResultadoAnotacion::Descartada | ResultadoAnotacion::NoSoportada => {}
        }
    }
    if anotaciones.is_empty() && !base.annotations.is_empty() {
        return None;
    }

    let (tronco, _) = partir_extension(&base.name);
    let nombre = format!("{tronco}__aug{numero}.png");
    let generada = ImageEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name: nombre.clone(),
        file: nombre,
        width: ancho,
        height: alto,
        annotations: anotaciones,
        // El resto se hereda: el sujeto sobre todo, para que una variante nunca
        // se separe de su original si alguien vuelve a repartir.
        ..base.clone()
    };
    Some((generada, bitmap, aplicadas))
}

fn escribir(img: &RgbaImage, destino: &Path, nombre: &str) -> Result<String, String> {
    let ruta: PathBuf = destino.join(nombre);
    // PNG siempre: un JPEG recomprimido en cada variante suma artefactos que el
    // modelo aprende como si fueran textura.
    img.save(&ruta)
        .map_err(|e| format!("Error escribiendo {ruta:?}: {e}"))?;
    Ok(ruta.to_string_lossy().to_string())
}

fn con_ruta_absoluta(img: &ImageEntry, images_dir: &Path) -> ImageEntry {
    let mut copia = img.clone();
    copia.file = images_dir.join(&img.file).to_string_lossy().to_string();
    copia
}

fn partir_extension(archivo: &str) -> (&str, &str) {
    match archivo.rfind('.') {
        Some(pos) => (&archivo[..pos], &archivo[pos + 1..]),
        None => (archivo, ""),
    }
}

/// Semilla derivada del id del proyecto, con la misma cuenta que el reparto.
pub fn derivar_semilla(project_id: &str) -> u64 {
    crate::training::dataset::derive_seed(project_id)
}

/// Mezcla determinista (FNV-1a de 64 bits).
///
/// Se escribe a mano en vez de usar `DefaultHasher` porque su resultado no está
/// garantizado entre versiones de Rust, y una semilla que cambia al actualizar
/// el compilador convierte «el mismo plan da el mismo dataset» en una promesa
/// falsa.
fn mezclar(base: u64, id: &str, tesela: u64, variante: u64) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIMO: u64 = 0x1000_0000_01b3;
    let mut h = OFFSET ^ base;
    for b in id.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(PRIMO);
    }
    for v in [tesela, variante] {
        for b in v.to_le_bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(PRIMO);
        }
    }
    h
}

fn rng_de(base: u64, id: &str, tesela: u64, variante: u64) -> StdRng {
    StdRng::seed_from_u64(mezclar(base, id, tesela, variante))
}

/// `Rng` en el ámbito para que `conservar_vacia` lo acepte.
const _: fn() = || {
    fn comprueba<T: Rng>() {}
    comprueba::<StdRng>();
};

#[cfg(test)]
mod tests;
