//! Lectura de archivos DICOM.
//!
//! Saca tres cosas de cada archivo: los píxeles ya ventaneados y listos para
//! anotar, los metadatos de adquisición que describen **cómo** se obtuvo la
//! imagen, y el informe de qué identificadores se quitaron.
//!
//! El archivo original **no se guarda en el proyecto**. Es una decisión, no un
//! descuido: el DICOM lleva dentro los identificadores que se acaban de quitar, y
//! conservarlo junto al corpus deidentificado devolvería al disco todo lo que la
//! deidentificación sacó. Lo que se guarda es la imagen renderizada más los
//! metadatos limpios; quien necesite el original lo tiene en su origen clínico,
//! que es donde debe estar.

use dicom_dictionary_std::tags;
use dicom_object::{FileDicomObject, InMemDicomObject};
use dicom_pixeldata::PixelDecoder;
use serde::{Deserialize, Serialize};

use super::deident::{self, DeidentReport};
use super::windowing::{self, Window};

/// Lo que se sabe de una imagen médica tras leerla.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalMeta {
    /// `CT`, `MR`, `CR`, `US`… Es lo que decide qué preset de ventana tiene
    /// sentido y qué modelos preentrenados valen.
    pub modality: Option<String>,
    pub manufacturer: Option<String>,
    pub model_name: Option<String>,
    pub body_part: Option<String>,
    /// Milímetros por píxel, `[filas, columnas]`. Sin esto, una medida en píxeles
    /// no se puede convertir a milímetros y dos equipos no son comparables.
    pub pixel_spacing: Option<Vec<f64>>,
    pub slice_thickness: Option<f64>,
    /// Parámetros de adquisición: kVp en rayos X y CT; TR y TE en resonancia.
    pub kvp: Option<f64>,
    pub repetition_time: Option<f64>,
    pub echo_time: Option<f64>,
    pub magnetic_field_strength: Option<f64>,
    pub protocol_name: Option<String>,
    pub patient_sex: Option<String>,
    /// Edad **en años**, redondeada: una fecha de nacimiento exacta identifica.
    pub patient_age_years: Option<u32>,
    /// Ventana con la que se renderizó la imagen guardada.
    pub window: Option<Window>,
    /// Si la ventana la traía el archivo o se calculó de la propia imagen.
    pub window_from_file: bool,
    /// Rango del dato original, en unidades físicas. Permite volver a ventanear
    /// con criterio en vez de a ciegas.
    pub value_range: Option<(f64, f64)>,
    pub rows: u32,
    pub columns: u32,
}

/// Una imagen médica leída: píxeles en gris de 8 bits, metadatos y el informe de
/// lo que se quitó.
pub struct MedicalImage {
    pub gray: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub meta: MedicalMeta,
    pub deident: DeidentReport,
    /// Valores en unidades físicas, para poder volver a ventanear sin releer el
    /// archivo. Sólo se conserva en memoria durante la importación.
    pub values: Vec<f64>,
}

impl MedicalImage {
    /// Codifica a PNG de 8 bits en gris.
    pub fn a_png(&self) -> Result<Vec<u8>, String> {
        let img = image::GrayImage::from_raw(self.width, self.height, self.gray.clone())
            .ok_or("Las dimensiones no cuadran con los píxeles")?;
        let mut out = Vec::new();
        image::DynamicImage::ImageLuma8(img)
            .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
            .map_err(|e| format!("Error codificando PNG: {}", e))?;
        Ok(out)
    }
}

type Objeto = FileDicomObject<InMemDicomObject>;

fn texto(obj: &Objeto, tag: dicom_object::Tag) -> Option<String> {
    let v = obj.element(tag).ok()?.to_str().ok()?.trim().to_string();
    (!v.is_empty()).then_some(v)
}

fn numero(obj: &Objeto, tag: dicom_object::Tag) -> Option<f64> {
    obj.element(tag).ok()?.to_float64().ok()
}

/// Edad DICOM (`045Y`, `018M`, `012D`) en años enteros.
///
/// Se redondea a años a propósito: los días y los meses de un adulto no aportan
/// nada al modelo y sí identifican. En lactantes se pierde precisión clínica
/// real, y por eso se informa: el que necesite meses tiene que declararlo aparte.
fn edad_en_anios(bruto: &str) -> Option<u32> {
    let b = bruto.trim();
    if b.len() < 2 {
        return None;
    }
    let (num, unidad) = b.split_at(b.len() - 1);
    let n: f64 = num.trim_start_matches('0').parse().unwrap_or(0.0);
    Some(match unidad {
        "Y" => n as u32,
        "M" => (n / 12.0) as u32,
        "W" => (n / 52.0) as u32,
        "D" => (n / 365.0) as u32,
        _ => return None,
    })
}

/// ¿Es una etiqueta privada del fabricante? Los grupos impares lo son.
fn es_privada(tag: dicom_object::Tag) -> bool {
    tag.group() % 2 == 1
}

/// Lee un DICOM, lo deidentifica y lo deja listo para anotar.
///
/// `project_id` entra en el seudónimo del paciente: el mismo paciente da el mismo
/// sujeto dentro del proyecto y uno distinto en otro.
pub fn leer(ruta: &std::path::Path, project_id: &str) -> Result<MedicalImage, String> {
    let obj =
        dicom_object::open_file(ruta).map_err(|e| format!("No es un DICOM legible: {}", e))?;

    // ─── Píxeles ────────────────────────────────────────────────────────────
    let decodificado = obj
        .decode_pixel_data()
        .map_err(|e| format!("No se pudieron leer los píxeles: {}", e))?;

    let width = decodificado.columns();
    let height = decodificado.rows();
    if width == 0 || height == 0 {
        return Err("El archivo no tiene píxeles".to_string());
    }

    let crudos: Vec<f64> = decodificado
        .to_vec::<f64>()
        .map_err(|e| format!("No se pudieron convertir los píxeles: {}", e))?;

    // Sólo el primer fotograma: una serie multi-frame se importa cuadro a cuadro
    // por otro camino, y mezclarlos aquí daría una imagen con el doble de filas.
    let por_fotograma = (width * height) as usize;
    let crudos: Vec<f64> = crudos.into_iter().take(por_fotograma).collect();
    if crudos.len() < por_fotograma {
        return Err("El archivo declara más píxeles de los que trae".to_string());
    }

    // ─── Unidades físicas ───────────────────────────────────────────────────
    // `to_vec` ya aplicó el LUT de modalidad —el `valor · slope + intercept` que
    // convierte el número guardado en unidades Hounsfield—, así que los valores
    // ya vienen en unidades físicas. Aplicarlo otra vez aquí desplazaba cada CT
    // 1024 HU: el pulmón salía en el rango del hueso y la ventana de pulmón
    // mostraba una imagen negra. Lo que **no** aplica es el VOI LUT cuando se
    // convierte a vector, que es justo lo que se quiere: el ventaneo se hace
    // aparte y se puede rehacer.
    let valores = crudos;

    let rango = valores
        .iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(*v), hi.max(*v)));

    // ─── Ventana ────────────────────────────────────────────────────────────
    // La del archivo manda: es la que el equipo consideró adecuada para esta
    // adquisición, y quien la eligió sabía más que un percentil.
    let del_archivo = numero(&obj, tags::WINDOW_CENTER)
        .zip(numero(&obj, tags::WINDOW_WIDTH))
        .filter(|(_, w)| *w > 0.0)
        .map(|(center, width)| Window { center, width });

    let window = del_archivo.unwrap_or_else(|| windowing::ventana_automatica(&valores));
    let gray = windowing::aplicar(&valores, window);

    // ─── Deidentificación ───────────────────────────────────────────────────
    let mut informe = DeidentReport {
        warnings: deident::avisos_estandar(),
        ..Default::default()
    };

    for (g, e, nombre) in deident::A_ELIMINAR {
        let tag = dicom_object::Tag(*g, *e);
        if obj.element(tag).is_ok() {
            informe.removed.push(nombre.to_string());
        }
    }
    // Qué se queda, dicho por su nombre: el informe tiene que poder leerse sin
    // saberse los números de las etiquetas de memoria.
    for (g, e, nombre) in deident::A_CONSERVAR {
        if obj.element(dicom_object::Tag(*g, *e)).is_ok() {
            informe.kept.push(nombre.to_string());
        }
    }
    for (g, e, nombre) in deident::CUASI_IDENTIFICADORES {
        if obj.element(dicom_object::Tag(*g, *e)).is_ok() {
            informe.reduced.push(nombre.to_string());
        }
    }
    informe.private_removed = obj.iter().filter(|el| es_privada(el.header().tag)).count();

    // El `PatientID` no se copia: se seudonimiza. Copiarlo sería sacar del
    // hospital el identificador con el que se puede volver a la persona.
    informe.subject_pseudonym =
        texto(&obj, tags::PATIENT_ID).map(|id| deident::seudonimo(project_id, &id));

    // ─── Metadatos que sí se conservan ──────────────────────────────────────
    let pixel_spacing = obj.element(tags::PIXEL_SPACING).ok().and_then(|el| {
        el.to_multi_float64()
            .ok()
            .filter(|v: &Vec<f64>| !v.is_empty())
    });

    let meta = MedicalMeta {
        modality: texto(&obj, tags::MODALITY),
        manufacturer: texto(&obj, tags::MANUFACTURER),
        model_name: texto(&obj, tags::MANUFACTURER_MODEL_NAME),
        body_part: texto(&obj, tags::BODY_PART_EXAMINED),
        pixel_spacing,
        slice_thickness: numero(&obj, tags::SLICE_THICKNESS),
        kvp: numero(&obj, tags::KVP),
        repetition_time: numero(&obj, tags::REPETITION_TIME),
        echo_time: numero(&obj, tags::ECHO_TIME),
        magnetic_field_strength: numero(&obj, tags::MAGNETIC_FIELD_STRENGTH),
        protocol_name: texto(&obj, tags::PROTOCOL_NAME),
        patient_sex: texto(&obj, tags::PATIENT_SEX),
        patient_age_years: texto(&obj, tags::PATIENT_AGE).and_then(|a| edad_en_anios(&a)),
        window: Some(window),
        window_from_file: del_archivo.is_some(),
        value_range: Some(rango),
        rows: height,
        columns: width,
    };

    Ok(MedicalImage {
        gray,
        width,
        height,
        meta,
        deident: informe,
        values: valores,
    })
}

/// ¿Este archivo parece un DICOM?
///
/// Por el preámbulo: 128 bytes cualesquiera seguidos de `DICM`. La extensión no
/// sirve — muchos DICOM clínicos no la llevan.
pub fn es_dicom(ruta: &std::path::Path) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(ruta) else {
        return false;
    };
    if f.seek(SeekFrom::Start(128)).is_err() {
        return false;
    }
    let mut magia = [0u8; 4];
    f.read_exact(&mut magia).is_ok() && &magia == b"DICM"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_edad_dicom_se_redondea_a_anios() {
        assert_eq!(edad_en_anios("045Y"), Some(45));
        assert_eq!(edad_en_anios("018M"), Some(1));
        assert_eq!(edad_en_anios("003D"), Some(0));
        assert_eq!(edad_en_anios(""), None);
        assert_eq!(edad_en_anios("045X"), None);
    }

    /// Los grupos impares son del fabricante y se descartan en bloque.
    #[test]
    fn las_etiquetas_privadas_son_las_de_grupo_impar() {
        assert!(es_privada(dicom_object::Tag(0x0009, 0x0010)));
        assert!(!es_privada(dicom_object::Tag(0x0010, 0x0010)));
    }

    /// Un archivo que no es DICOM no puede pasar por DICOM.
    #[test]
    fn un_archivo_cualquiera_no_es_dicom() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), b"esto no es un dicom").unwrap();
        assert!(!es_dicom(tmp.path()));
    }
}
