//! Contrato único entre el preparador de dataset y el generador de script.
//!
//! Antes, `prepare_dataset_for_backend` devolvía sólo la ruta raíz del job y cada
//! generador de script escribía a mano los subpaths que *creía* que existían
//! (`os.path.join(dataset_dir, "images/train")`). Nadie verificaba que ambos lados
//! coincidieran, y en 13 de 19 backends no coincidían: el entrenamiento moría con
//! `FileNotFoundError` en la primera línea útil, o peor, cargaba un dataset vacío.
//!
//! Ahora el preparador **declara** cada archivo o directorio que escribe, y el
//! generador sólo puede pedir claves declaradas: `ds.input(keys::IMAGES_TRAIN)?`.
//! Pedir una clave que nadie escribió es un error explícito en el momento de generar
//! el script, con la lista de lo que sí está disponible.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use super::DatasetFormat;

/// Claves canónicas del contrato. Son las únicas que un preparador puede declarar
/// y un generador puede pedir; cualquier otra es un error de programación.
pub mod keys {
    /// Directorio con las imágenes de un split (layout plano).
    pub const IMAGES_TRAIN: &str = "images_train";
    pub const IMAGES_VAL: &str = "images_val";
    pub const IMAGES_TEST: &str = "images_test";

    /// Directorio con labels YOLO `.txt`, uno por imagen.
    pub const LABELS_TRAIN: &str = "labels_train";
    pub const LABELS_VAL: &str = "labels_val";
    pub const LABELS_TEST: &str = "labels_test";

    /// Raíz de un dataset ImageFolder: el directorio que contiene `train/` y `val/`.
    /// Ultralytics lo exige así en clasificación (`data=` debe ser un directorio).
    pub const IMAGEFOLDER_ROOT: &str = "imagefolder_root";
    /// Directorio raíz de un split en layout ImageFolder (`{split}/{clase}/img.jpg`).
    pub const IMAGEFOLDER_TRAIN: &str = "imagefolder_train";
    pub const IMAGEFOLDER_VAL: &str = "imagefolder_val";
    pub const IMAGEFOLDER_TEST: &str = "imagefolder_test";

    /// JSON de etiquetas de clasificación: `[{"filename": ..., "label": n}]`
    /// o, en multi-etiqueta, `[{"filename": ..., "labels": [0,1,...]}]`.
    pub const LABELS_JSON_TRAIN: &str = "labels_json_train";
    pub const LABELS_JSON_VAL: &str = "labels_json_val";
    pub const LABELS_JSON_TEST: &str = "labels_json_test";

    /// Directorio con máscaras PNG de índice de clase.
    pub const MASKS_TRAIN: &str = "masks_train";
    pub const MASKS_VAL: &str = "masks_val";
    pub const MASKS_TEST: &str = "masks_test";

    /// Anotaciones COCO (bbox, instancia o keypoints según el formato del dataset).
    pub const ANN_TRAIN: &str = "ann_train";
    pub const ANN_VAL: &str = "ann_val";
    pub const ANN_TEST: &str = "ann_test";

    /// `data.yaml` de ultralytics.
    pub const DATA_YAML: &str = "data_yaml";

    /// Listado de clases legible por el script.
    pub const CLASSES_FILE: &str = "classes_file";

    /// Arrays numpy de series temporales.
    pub const X_TRAIN: &str = "x_train";
    pub const Y_TRAIN: &str = "y_train";
    pub const X_VAL: &str = "x_val";
    pub const Y_VAL: &str = "y_val";
    pub const X_TEST: &str = "x_test";
    pub const Y_TEST: &str = "y_test";
    /// Metadatos del ventaneo y la normalización aplicada.
    pub const TS_META: &str = "ts_meta";

    /// CSV en formato largo (`series_id, time_idx, target, ...`).
    pub const LONG_CSV: &str = "long_csv";

    /// CSV tabular de entrada.
    pub const TABLE_CSV: &str = "table_csv";
    /// Metadatos del CSV: columna objetivo, features y tipo de tarea, tal como
    /// quedaron al importarlo. Viajan con el dataset para que el script no dependa
    /// de que la UI los reenvíe.
    pub const TABLE_META: &str = "table_meta";

    /// Todas las claves válidas, para validar declaraciones y para el lint de tests.
    pub const ALL: &[&str] = &[
        IMAGES_TRAIN,
        IMAGES_VAL,
        IMAGES_TEST,
        LABELS_TRAIN,
        LABELS_VAL,
        LABELS_TEST,
        IMAGEFOLDER_ROOT,
        IMAGEFOLDER_TRAIN,
        IMAGEFOLDER_VAL,
        IMAGEFOLDER_TEST,
        LABELS_JSON_TRAIN,
        LABELS_JSON_VAL,
        LABELS_JSON_TEST,
        MASKS_TRAIN,
        MASKS_VAL,
        MASKS_TEST,
        ANN_TRAIN,
        ANN_VAL,
        ANN_TEST,
        DATA_YAML,
        CLASSES_FILE,
        X_TRAIN,
        Y_TRAIN,
        X_VAL,
        Y_VAL,
        X_TEST,
        Y_TEST,
        TS_META,
        LONG_CSV,
        TABLE_CSV,
        TABLE_META,
    ];
}

/// Lo que un preparador dejó en disco, declarado explícitamente.
///
/// `inputs` guarda rutas **relativas** a `root` con separador `/`, de modo que el
/// mismo `PreparedDataset` sirve para el runner local (rutas absolutas derivadas) y
/// para el paquete descargable, donde el zip se extrae en otra máquina.
#[derive(Debug, Clone)]
pub struct PreparedDataset {
    root: PathBuf,
    #[allow(dead_code)]
    format: DatasetFormat,
    class_names: Vec<String>,
    inputs: BTreeMap<&'static str, String>,
}

impl PreparedDataset {
    pub fn new(root: impl Into<PathBuf>, format: DatasetFormat, class_names: Vec<String>) -> Self {
        Self {
            root: root.into(),
            format,
            class_names,
            inputs: BTreeMap::new(),
        }
    }

    /// Declara un archivo o directorio escrito por el preparador.
    ///
    /// La ruta se normaliza a separador `/` y se vuelve relativa a `root` si venía
    /// absoluta, porque es así como la consumen los scripts generados.
    pub fn declare(&mut self, key: &'static str, rel: impl AsRef<Path>) -> &mut Self {
        debug_assert!(
            keys::ALL.contains(&key),
            "clave de contrato desconocida: {key}"
        );
        let path = rel.as_ref();
        let relative = path
            .strip_prefix(&self.root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        self.inputs.insert(key, relative);
        self
    }

    /// Raíz del dataset. La usan los tests de contrato y el empaquetado.
    #[allow(dead_code)]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Raíz con separador `/`, lista para interpolar en un literal de Python.
    pub fn root_py(&self) -> String {
        self.root.to_string_lossy().replace('\\', "/")
    }

    /// Formato declarado; sirve para diagnósticos y para los tests.
    #[allow(dead_code)]
    pub fn format(&self) -> &DatasetFormat {
        &self.format
    }

    #[allow(dead_code)]
    pub fn class_names(&self) -> &[String] {
        &self.class_names
    }

    pub fn num_classes(&self) -> usize {
        self.class_names.len()
    }

    /// Claves declaradas, en orden. La recorren los tests de contrato para
    /// comprobar que cada ruta declarada existe de verdad en disco.
    #[allow(dead_code)]
    pub fn declared_keys(&self) -> impl Iterator<Item = &&'static str> {
        self.inputs.keys()
    }

    /// `true` si el preparador declaró esa clave. La usan los tests de contrato.
    #[allow(dead_code)]
    pub fn has(&self, key: &str) -> bool {
        self.inputs.contains_key(key)
    }

    /// Ruta relativa declarada para `key`, o un error que dice qué sí hay declarado.
    pub fn input(&self, key: &str) -> Result<&str, String> {
        self.inputs.get(key).map(|s| s.as_str()).ok_or_else(|| {
            let available: Vec<&str> = self.inputs.keys().copied().collect();
            format!(
                "el dataset preparado no declara '{}'. Declarado: [{}]. \
                 El preparador y el generador de script no coinciden: \
                 corrige el preparador de este backend en training/dataset.rs.",
                key,
                available.join(", ")
            )
        })
    }

    /// Ruta absoluta de una clave declarada.
    pub fn abs(&self, key: &str) -> Result<PathBuf, String> {
        Ok(self.root.join(self.input(key)?))
    }

    /// Cabecera Python con las rutas declaradas, como constantes del script.
    ///
    /// Es el **único** lugar donde un script recibe rutas del dataset: el cuerpo usa
    /// las constantes y nunca vuelve a componer un path a mano. El test de contrato
    /// verifica justamente eso.
    pub fn py_header(&self, needed: &[&str]) -> Result<String, String> {
        let mut out = String::new();
        out.push_str("import os\n\n");
        out.push_str("# ── Rutas del dataset (declaradas por Annotix) ──\n");
        out.push_str(&format!("DATASET_DIR = r\"{}\"\n", self.root_py()));
        for key in needed {
            let rel = self.input(key)?;
            out.push_str(&format!(
                "{} = os.path.join(DATASET_DIR, r\"{}\")\n",
                py_const_name(key),
                rel
            ));
        }
        out.push_str(&format!("NUM_CLASSES = {}\n", self.num_classes()));
        let names = self
            .class_names
            .iter()
            .map(|n| format!("{:?}", n))
            .collect::<Vec<_>>()
            .join(", ");
        out.push_str(&format!("CLASS_NAMES = [{}]\n", names));
        Ok(out)
    }
}

/// `images_train` → `IMAGES_TRAIN`
pub fn py_const_name(key: &str) -> String {
    key.to_uppercase()
}

/// Rutas del dataset ya resueltas y validadas, listas para interpolar en un script.
///
/// El router (`scripts::generate_train_script_for_backend`) es el único que las
/// construye, pidiendo al `PreparedDataset` exactamente las claves que el backend
/// necesita. Si falta alguna, el error sale ahí — antes de escribir un `train.py`
/// que no encontraría sus datos.
#[derive(Debug, Clone)]
pub struct ScriptPaths {
    /// Bloque de constantes Python (`DATASET_DIR`, `IMAGES_TRAIN`, …). Es la única
    /// vía por la que un script recibe rutas del dataset: su cuerpo usa las
    /// constantes y nunca compone un path de entrada.
    pub header: String,
    pub num_classes: usize,
}

impl PreparedDataset {
    /// Resuelve y valida las claves que un backend necesita.
    pub fn script_paths(&self, needed: &[&str]) -> Result<ScriptPaths, String> {
        // `py_header` valida que cada clave pedida esté declarada.
        Ok(ScriptPaths {
            header: self.py_header(needed)?,
            num_classes: self.num_classes(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> PreparedDataset {
        let mut ds = PreparedDataset::new(
            PathBuf::from("/tmp/job"),
            DatasetFormat::YoloTxt,
            vec!["gato".into(), "perro".into()],
        );
        ds.declare(keys::IMAGES_TRAIN, "images/train")
            .declare(keys::DATA_YAML, "data.yaml");
        ds
    }

    #[test]
    fn declara_y_lee_rutas_relativas() {
        let ds = sample();
        assert_eq!(ds.input(keys::IMAGES_TRAIN).unwrap(), "images/train");
        assert_eq!(
            ds.abs(keys::DATA_YAML).unwrap(),
            PathBuf::from("/tmp/job/data.yaml")
        );
    }

    #[test]
    fn relativiza_rutas_absolutas_al_declarar() {
        let mut ds = sample();
        ds.declare(keys::MASKS_TRAIN, PathBuf::from("/tmp/job/masks/train"));
        assert_eq!(ds.input(keys::MASKS_TRAIN).unwrap(), "masks/train");
    }

    #[test]
    fn pedir_clave_no_declarada_explica_que_hay() {
        let ds = sample();
        let err = ds.input(keys::LABELS_JSON_TRAIN).unwrap_err();
        assert!(err.contains("labels_json_train"), "{err}");
        assert!(err.contains("images_train"), "{err}");
    }

    #[test]
    fn cabecera_python_declara_constantes_y_clases() {
        let ds = sample();
        let header = ds.py_header(&[keys::IMAGES_TRAIN]).unwrap();
        assert!(header.contains("DATASET_DIR = r\"/tmp/job\""));
        assert!(header.contains("IMAGES_TRAIN = os.path.join(DATASET_DIR, r\"images/train\")"));
        assert!(header.contains("NUM_CLASSES = 2"));
        assert!(header.contains("CLASS_NAMES = [\"gato\", \"perro\"]"));
    }

    #[test]
    fn script_paths_trae_cabecera_y_clases() {
        let ds = sample();
        let sp = ds
            .script_paths(&[keys::IMAGES_TRAIN, keys::DATA_YAML])
            .unwrap();
        assert!(sp.header.contains("IMAGES_TRAIN = os.path.join"));
        assert!(sp.header.contains("DATA_YAML = os.path.join"));
        assert_eq!(sp.num_classes, 2);
    }

    #[test]
    fn script_paths_falla_si_el_preparador_no_declaro_la_clave() {
        let ds = sample();
        assert!(ds.script_paths(&[keys::MASKS_TRAIN]).is_err());
    }

    #[test]
    fn cabecera_falla_si_falta_una_clave_pedida() {
        let ds = sample();
        assert!(ds.py_header(&[keys::X_TRAIN]).is_err());
    }
}
