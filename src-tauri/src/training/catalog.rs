//! Catálogo de familias de modelos: la información con la que se decide **cuál
//! usar**, no la que hace falta para entrenar.
//!
//! Vive a nivel de familia y no de modelo por una razón práctica: la decisión real
//! es "qué familia" —U-Net o SegFormer, YOLO o DETR—, y el tamaño se elige después
//! con los datos que ya publica `BackendModelInfo`. A nivel de modelo habría que
//! rellenar unas 150 fichas, y la mitad saldrían inventadas.
//!
//! La clave es el par **(backend, familia)**, nunca la familia sola: `resnet` en
//! `timm` es un clasificador de imagen y `resnet` en `tsai` es una red 1D para
//! series. Son cosas distintas con el mismo nombre.
//!
//! Sobre la honestidad de los números:
//!
//! - `vram` es una **cubeta**, no una medición: con los valores por defecto del
//!   backend. Un número con decimales aquí sería falsa precisión.
//! - `min_samples` es un orden de magnitud orientativo, no un umbral. Debajo de esa
//!   cifra la familia suele rendir peor que una más simple; no significa que no
//!   entrene.
//! - `reference` son métricas publicadas **sobre otros datasets** (COCO, ADE20K,
//!   ImageNet). Sirven para comparar familias entre sí, no para predecir lo que
//!   dará el corpus del usuario. La UI lo dice.
//! - `license` es la del paquete o los pesos cuando es una sola y conocida. Donde
//!   cada modelo del Hub trae la suya, dice `varies` en vez de arriesgar un dato
//!   falso: una licencia equivocada se hereda al modelo entrenado y viaja al
//!   despliegue.
//!
//! El eje `domains` marca dónde la familia está **recomendada**. Las que llevan
//! `biomedical` son arquitecturas generalistas que la Fase 3 usa como base de un
//! preset biomédico (ver `docs/biomedico-fase3-presets.md`); los modelos
//! preentrenados con datos biomédicos (MedSAM, nnU-Net, RETFound, UNI…) llegan con
//! la etapa 10 de `docs/biomedico-fase2-roadmap.md` y todavía no están aquí.
//!
//! Los textos de "cuándo usarlo" y "cuándo no" no están en este archivo: viven en
//! `public/locales/{lang}/training.json` bajo
//! `training.families.{backend}.{familia}.use` / `.avoid`, porque son texto
//! traducible y aquí sólo van datos.

use serde::{Deserialize, Serialize};

/// Ficha de decisión de una familia de modelos.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamilyInfo {
    /// `"{backend}/{familia}"`, estable, para claves de lista en la UI.
    pub key: String,
    pub backend: String,
    pub family: String,
    /// Dónde está recomendada: `general`, `biomedical`.
    pub domains: Vec<String>,
    /// Modalidades a las que apunta: `any`, `series`, `tabular` y, cuando lleguen
    /// los modelos biomédicos, `ct`, `mri`, `xray`, `microscopy`, `wsi`, `fundus`…
    pub modalities: Vec<String>,
    /// Cubeta de memoria de GPU: `le4gb`, `4to8gb`, `8to16gb`, `gt16gb`.
    pub vram: String,
    /// Velocidad relativa dentro de su tarea: `fast`, `medium`, `slow`.
    pub speed: String,
    /// Muestras etiquetadas por debajo de las cuales conviene algo más simple.
    #[serde(rename = "minSamples")]
    pub min_samples: u32,
    pub license: String,
    /// `open`, `gated` (pide token o aceptar términos), `non_commercial`.
    pub access: String,
    /// Datos del preentrenamiento, o `none` si se entrena desde cero.
    #[serde(rename = "pretrainedOn")]
    pub pretrained_on: String,
    /// Métrica publicada sobre otro dataset, en forma neutra al idioma
    /// (`"COCO mAP50-95 37-55"`): este campo se muestra tal cual en los diez
    /// locales, así que no lleva prosa. Lo que haya que explicar va en el texto
    /// traducido de la familia.
    ///
    /// `None` cuando no hay una cifra comparable: en las familias de `smp` el
    /// resultado depende del encoder, y dar un número sería inventarlo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
}

type Fila = (
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    u32,
    &'static str,
    &'static str,
    &'static str,
    Option<&'static str>,
);

#[rustfmt::skip]
const TABLA: &[Fila] = &[
    // backend, familia, dominios, modalidades, vram, velocidad, mín. muestras,
    // licencia, acceso, preentrenado en, referencia
    ("yolo", "yolo", "general,biomedical", "any", "4to8gb", "fast", 100, "AGPL-3.0", "open", "COCO", Some("COCO mAP50-95 37-55")),
    ("rt_detr", "rtdetr", "general", "any", "8to16gb", "medium", 300, "AGPL-3.0", "open", "COCO", Some("COCO mAP50-95 53-54")),
    ("rt_detr", "rtdetrv2", "general", "any", "8to16gb", "medium", 300, "AGPL-3.0", "open", "COCO", Some("COCO mAP50-95 48-54")),
    ("rf_detr", "rfdetr", "general", "any", "8to16gb", "medium", 200, "Apache-2.0", "open", "COCO", Some("COCO mAP50-95 48-60")),
    ("smp", "unet", "general,biomedical", "any", "4to8gb", "fast", 50, "MIT", "open", "ImageNet-1k", None),
    ("smp", "manet", "general,biomedical", "any", "4to8gb", "medium", 80, "MIT", "open", "ImageNet-1k", None),
    ("smp", "linknet", "general", "any", "le4gb", "fast", 50, "MIT", "open", "ImageNet-1k", None),
    ("smp", "fpn", "general", "any", "4to8gb", "fast", 80, "MIT", "open", "ImageNet-1k", None),
    ("smp", "pan", "general", "any", "4to8gb", "medium", 80, "MIT", "open", "ImageNet-1k", None),
    ("smp", "pspnet", "general", "any", "8to16gb", "medium", 150, "MIT", "open", "ImageNet-1k", None),
    ("smp", "deeplab", "general", "any", "8to16gb", "medium", 150, "MIT", "open", "ImageNet-1k", None),
    ("smp", "upernet", "general", "any", "8to16gb", "slow", 200, "MIT", "open", "ImageNet-1k", None),
    ("smp", "segformer", "general", "any", "4to8gb", "medium", 200, "MIT", "open", "ImageNet-1k", None),
    ("smp", "dpt", "general", "any", "8to16gb", "slow", 200, "MIT", "open", "ImageNet-1k", None),
    ("hf_segmentation", "segformer", "general", "any", "4to8gb", "medium", 200, "varies", "open", "ADE20K", Some("ADE20K mIoU 37-51")),
    ("hf_segmentation", "maskformer", "general", "any", "8to16gb", "slow", 300, "varies", "open", "ADE20K", Some("ADE20K mIoU 47-55")),
    ("hf_segmentation", "mask2former", "general", "any", "8to16gb", "slow", 300, "varies", "open", "ADE20K", Some("ADE20K mIoU 52-57")),
    ("hf_segmentation", "upernet", "general", "any", "8to16gb", "slow", 300, "varies", "open", "ADE20K", Some("ADE20K mIoU 45-50")),
    ("hf_segmentation", "beit", "general", "any", "gt16gb", "slow", 400, "varies", "open", "ADE20K", Some("ADE20K mIoU 53-57")),
    ("hf_segmentation", "dpt", "general", "any", "8to16gb", "slow", 300, "varies", "open", "ADE20K", None),
    ("hf_segmentation", "mobilevit", "general", "any", "le4gb", "fast", 150, "varies", "open", "ADE20K", Some("ImageNet-1k top-1 74-78")),
    ("hf_detection", "detr", "general", "any", "8to16gb", "slow", 500, "varies", "open", "COCO", Some("COCO mAP 42 (R50)")),
    ("hf_detection", "deformable-detr", "general", "any", "8to16gb", "medium", 300, "varies", "open", "COCO", Some("COCO mAP 46")),
    ("hf_detection", "conditional-detr", "general", "any", "8to16gb", "medium", 300, "varies", "open", "COCO", Some("COCO mAP 43 (R50)")),
    ("hf_instance", "maskformer", "general", "any", "8to16gb", "slow", 300, "varies", "open", "COCO", Some("COCO mask AP 34-40")),
    ("hf_instance", "mask2former", "general", "any", "gt16gb", "slow", 300, "varies", "open", "COCO", Some("COCO mask AP 43-50")),
    ("hf_pose", "resnet", "general", "any", "4to8gb", "fast", 150, "Apache-2.0", "open", "ImageNet-1k", None),
    ("hf_pose", "convnext", "general", "any", "4to8gb", "medium", 200, "Apache-2.0", "open", "ImageNet-1k", None),
    ("hf_pose", "hrnet", "general", "any", "4to8gb", "medium", 200, "Apache-2.0", "open", "ImageNet-1k", Some("COCO keypoints AP 75")),
    ("timm", "resnet", "general,biomedical", "any", "le4gb", "fast", 50, "Apache-2.0", "open", "ImageNet-1k", Some("ImageNet-1k top-1 76-82")),
    ("timm", "efficientnet", "general", "any", "le4gb", "fast", 50, "Apache-2.0", "open", "ImageNet-1k", Some("ImageNet-1k top-1 77-84")),
    ("timm", "mobilenet", "general", "any", "le4gb", "fast", 50, "Apache-2.0", "open", "ImageNet-1k", Some("ImageNet-1k top-1 71-76")),
    ("timm", "vit", "general,biomedical", "any", "4to8gb", "medium", 200, "Apache-2.0", "open", "ImageNet-21k", Some("ImageNet-1k top-1 81-85")),
    ("timm", "swin", "general", "any", "4to8gb", "medium", 200, "Apache-2.0", "open", "ImageNet-21k", Some("ImageNet-1k top-1 83-86")),
    ("timm", "convnext", "general,biomedical", "any", "4to8gb", "medium", 150, "Apache-2.0", "open", "ImageNet-21k", Some("ImageNet-1k top-1 82-86")),
    ("timm", "eva", "general", "any", "gt16gb", "slow", 300, "MIT", "open", "Merged-38M", Some("ImageNet-1k top-1 88-89")),
    ("hf_classification", "vit", "general,biomedical", "any", "4to8gb", "medium", 200, "varies", "open", "ImageNet-21k", Some("ImageNet-1k top-1 81-85")),
    ("hf_classification", "deit", "general", "any", "4to8gb", "medium", 200, "varies", "open", "ImageNet-1k", Some("ImageNet-1k top-1 81-83")),
    ("hf_classification", "beit", "general", "any", "4to8gb", "slow", 300, "varies", "open", "ImageNet-21k", Some("ImageNet-1k top-1 83-86")),
    ("hf_classification", "swin", "general", "any", "4to8gb", "medium", 200, "varies", "open", "ImageNet-21k", Some("ImageNet-1k top-1 83-86")),
    ("hf_classification", "convnext", "general,biomedical", "any", "4to8gb", "medium", 150, "varies", "open", "ImageNet-21k", Some("ImageNet-1k top-1 82-86")),
    ("tsai", "rocket", "general", "series", "le4gb", "fast", 30, "Apache-2.0", "open", "none", None),
    ("tsai", "inception", "general", "series", "le4gb", "fast", 100, "Apache-2.0", "open", "none", None),
    ("tsai", "transformer", "general", "series", "4to8gb", "medium", 300, "Apache-2.0", "open", "none", None),
    ("tsai", "resnet", "general", "series", "le4gb", "fast", 100, "Apache-2.0", "open", "none", None),
    ("tsai", "cnn", "general", "series", "le4gb", "fast", 100, "Apache-2.0", "open", "none", None),
    ("tsai", "xception", "general", "series", "le4gb", "medium", 150, "Apache-2.0", "open", "none", None),
    ("tsai", "rnn", "general", "series", "le4gb", "medium", 150, "Apache-2.0", "open", "none", None),
    ("tsai", "tcn", "general", "series", "le4gb", "fast", 100, "Apache-2.0", "open", "none", None),
    ("pytorch_forecasting", "tft", "general", "series", "4to8gb", "slow", 200, "MIT", "open", "none", None),
    ("pytorch_forecasting", "nbeats", "general", "series", "le4gb", "medium", 100, "MIT", "open", "none", None),
    ("pytorch_forecasting", "nhits", "general", "series", "le4gb", "medium", 100, "MIT", "open", "none", None),
    ("pytorch_forecasting", "deepar", "general", "series", "4to8gb", "slow", 200, "MIT", "open", "none", None),
    ("pyod", "statistical", "general", "series", "le4gb", "fast", 50, "BSD-2-Clause", "open", "none", None),
    ("pyod", "proximity", "general", "series", "le4gb", "medium", 100, "BSD-2-Clause", "open", "none", None),
    ("pyod", "ensemble", "general", "series", "le4gb", "fast", 100, "BSD-2-Clause", "open", "none", None),
    ("pyod", "autoencoder", "general", "series", "le4gb", "medium", 300, "BSD-2-Clause", "open", "none", None),
    ("tslearn", "kmeans", "general", "series", "le4gb", "medium", 30, "BSD-2-Clause", "open", "none", None),
    ("tslearn", "kshape", "general", "series", "le4gb", "medium", 30, "BSD-2-Clause", "open", "none", None),
    ("pypots", "transformer", "general", "series", "4to8gb", "medium", 200, "BSD-3-Clause", "open", "none", None),
    ("pypots", "rnn", "general", "series", "le4gb", "medium", 150, "BSD-3-Clause", "open", "none", None),
    ("pypots", "gan", "general", "series", "4to8gb", "slow", 300, "BSD-3-Clause", "open", "none", None),
    ("stumpy", "matrix-profile", "general", "series", "le4gb", "fast", 1, "BSD-3-Clause", "open", "none", None),
    ("sklearn", "boosting", "general", "tabular", "le4gb", "fast", 200, "Apache-2.0 / MIT", "open", "none", None),
    ("sklearn", "ensemble", "general", "tabular", "le4gb", "fast", 200, "BSD-3-Clause", "open", "none", None),
    ("sklearn", "linear", "general", "tabular", "le4gb", "fast", 50, "BSD-3-Clause", "open", "none", None),
    ("sklearn", "svm", "general", "tabular", "le4gb", "medium", 100, "BSD-3-Clause", "open", "none", None),
    ("sklearn", "neighbors", "general", "tabular", "le4gb", "fast", 100, "BSD-3-Clause", "open", "none", None),
    ("sklearn", "neural", "general", "tabular", "le4gb", "medium", 500, "BSD-3-Clause", "open", "none", None),
];

/// Todas las fichas del catálogo.
pub fn families() -> Vec<FamilyInfo> {
    TABLA
        .iter()
        .map(
            |(
                backend,
                family,
                domains,
                modalities,
                vram,
                speed,
                min_samples,
                license,
                access,
                pretrained_on,
                reference,
            )| {
                FamilyInfo {
                    key: format!("{backend}/{family}"),
                    backend: (*backend).to_string(),
                    family: (*family).to_string(),
                    domains: domains.split(',').map(|s| s.to_string()).collect(),
                    modalities: modalities.split(',').map(|s| s.to_string()).collect(),
                    vram: (*vram).to_string(),
                    speed: (*speed).to_string(),
                    min_samples: *min_samples,
                    license: (*license).to_string(),
                    access: (*access).to_string(),
                    pretrained_on: (*pretrained_on).to_string(),
                    reference: reference.map(|r| r.to_string()),
                }
            },
        )
        .collect()
}
