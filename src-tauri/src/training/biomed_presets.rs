//! Presets de entrenamiento del dominio biomédico.
//!
//! Un preset biomédico no es un preset generalista con otro nombre. Lo que lo
//! distingue son dos cosas, y las dos importan más que los hiperparámetros:
//!
//! **1. Augmentaciones que no rompen la anatomía.** El equivalente generalista
//! usa mosaico, mixup y volteos libres, y los tres destruyen información
//! diagnóstica. Voltear una radiografía en horizontal impide que el modelo
//! aprenda lateralidad —y la lateralidad es diagnóstica: qué mama, qué ojo,
//! situs inversus—. Pegar cuatro imágenes crea contexto anatómico imposible.
//! Mezclar dos pacientes crea un hallazgo que no es de ninguno.
//!
//! En microscopía e histología pasa lo contrario: una célula no tiene arriba ni
//! izquierda, el campo es arbitrario, y los volteos y giros libres son
//! legítimos. Por eso el preset depende de la **modalidad**, no del dominio.
//!
//! **2. Un reparto recomendado.** Cada preset trae la política que su modalidad
//! pide —agrupar por sujeto, exigir test— y la UI ofrece aplicarla. No se aplica
//! sola: declarar cómo se reparte un corpus es una decisión del estudio.
//!
//! ## La regla
//!
//! Aquí no entra un preset cuyo backend y modelo no existan. Hay un test que lo
//! comprueba contra el catálogo real: ofrecer un preset que no se puede lanzar es
//! peor que no ofrecerlo, porque se descubre al final.

use serde::Serialize;

/// Augmentaciones que un preset fija. Lo que no declara, se deja como venga.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Augmentation {
    pub fliplr: f32,
    pub flipud: f32,
    pub degrees: f32,
    pub mosaic: f32,
    pub mixup: f32,
    pub copy_paste: f32,
    pub scale: f32,
}

/// Reparto que el preset recomienda para su modalidad.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitSuggestion {
    /// `subject` casi siempre: dos cortes del mismo paciente en particiones
    /// distintas hacen que la métrica mida memoria en vez de generalización.
    pub unit: &'static str,
    pub val_split: f64,
    pub test_split: f64,
    pub require_test: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiomedPreset {
    pub id: &'static str,
    pub backend: &'static str,
    /// Id del modelo dentro del backend. Tiene que existir en el catálogo.
    pub model_id: &'static str,
    pub task: &'static str,
    /// Modalidades para las que tiene sentido, en código DICOM o nombre corto.
    pub modalities: &'static [&'static str],
    /// Si la modalidad de este preset tiene lados que el volteo destruiría.
    pub lateralized: bool,
    pub augmentation: Augmentation,
    pub split: SplitSuggestion,
    /// Lo que hay que saber antes de elegirlo.
    pub notes: &'static [&'static str],
}

/// Augmentación para modalidades con orientación anatómica fija.
const ANATOMICA: Augmentation = Augmentation {
    // Cero, y es el parámetro que más importa de toda esta tabla.
    fliplr: 0.0,
    flipud: 0.0,
    // El posicionamiento del paciente está estandarizado: un giro pequeño cubre
    // la variación real de colocación, uno grande inventa una postura imposible.
    degrees: 8.0,
    mosaic: 0.0,
    mixup: 0.0,
    copy_paste: 0.0,
    scale: 0.15,
};

/// Augmentación para modalidades sin orientación: el campo es arbitrario.
const SIN_ORIENTACION: Augmentation = Augmentation {
    fliplr: 0.5,
    flipud: 0.5,
    degrees: 180.0,
    // El campo microscópico ya es un recorte arbitrario, así que pegar varios no
    // crea nada imposible.
    mosaic: 0.5,
    mixup: 0.0,
    copy_paste: 0.1,
    scale: 0.3,
};

/// Reparto por sujeto con test exigido: lo que pide cualquier corpus clínico.
const POR_SUJETO: SplitSuggestion = SplitSuggestion {
    unit: "subject",
    val_split: 0.2,
    test_split: 0.2,
    require_test: true,
};

pub const BIOMED_PRESETS: &[BiomedPreset] = &[
    BiomedPreset {
        id: "bio_unet_seg",
        backend: "smp",
        model_id: "Unet-resnet34",
        task: "segment",
        modalities: &["CT", "MR", "CR", "DX", "US"],
        lateralized: true,
        augmentation: ANATOMICA,
        split: POR_SUJETO,
        notes: &[
            "U-Net es la arquitectura más usada en segmentación biomédica y la más \
             barata de entrenar con poco dato.",
            "Sin volteos ni giros grandes: la orientación anatómica es información, \
             no ruido del que haya que hacerse invariante.",
        ],
    },
    BiomedPreset {
        id: "bio_microscopy_seg",
        backend: "smp",
        model_id: "Unet-resnet34",
        task: "segment",
        modalities: &["SM", "GM", "microscopia"],
        lateralized: false,
        augmentation: SIN_ORIENTACION,
        split: SplitSuggestion {
            unit: "subject",
            val_split: 0.2,
            test_split: 0.2,
            require_test: true,
        },
        notes: &[
            "Aquí sí valen volteos y giros libres: una célula no tiene arriba ni \
             izquierda, y el campo microscópico es un recorte arbitrario.",
            "Agrupa por placa o por preparación, no por campo: dos campos de la \
             misma placa comparten tinción, foco y artefactos.",
        ],
    },
    BiomedPreset {
        id: "bio_lesion_detect",
        backend: "yolo",
        model_id: "yolo11",
        task: "detect",
        modalities: &["CT", "MR", "CR", "DX", "MG", "US"],
        lateralized: true,
        augmentation: ANATOMICA,
        split: POR_SUJETO,
        notes: &[
            "Detección con la orientación respetada. El preset «Médico» de la \
             familia general voltea y gira: sirve para objetos biológicos sin \
             orientación, no para radiología.",
            "Una lesión que cruza varios cortes es **un** hallazgo, no uno por \
             corte: cuidado al leer las métricas de detección corte a corte.",
        ],
    },
    BiomedPreset {
        id: "bio_xray_classify",
        backend: "hf_classification",
        model_id: "microsoft/rad-dino",
        task: "classify",
        modalities: &["CR", "DX"],
        lateralized: true,
        augmentation: ANATOMICA,
        split: POR_SUJETO,
        notes: &[
            "RAD-DINO está preentrenado sobre 882.775 radiografías de tórax: con \
             poco dato propio rinde muy por encima de un backbone de ImageNet.",
            "Sin volteo horizontal: la lateralidad de un hallazgo torácico es \
             diagnóstica.",
        ],
    },
    BiomedPreset {
        id: "bio_radiology_transfer",
        backend: "timm",
        model_id: "hf_hub:Snarcy/RadioDino-s16",
        task: "classify",
        modalities: &["CT", "MR", "US"],
        lateralized: true,
        augmentation: ANATOMICA,
        split: POR_SUJETO,
        notes: &[
            "RadioDINO se entrenó con 1,35 millones de imágenes de TAC, resonancia \
             y ecografía (RadImageNet). Es el punto de partida para un corpus \
             pequeño de radiología.",
            "Comprueba contra una línea base de ImageNet en tu propio corpus: si el \
             backbone biomédico no gana con poco dato, no merece el preset.",
        ],
    },
    BiomedPreset {
        id: "bio_pathology_tiles",
        backend: "timm",
        model_id: "hf_hub:1aurent/vit_small_patch16_224.lunit_dino",
        task: "classify",
        modalities: &["SM", "histopatologia"],
        lateralized: false,
        augmentation: SIN_ORIENTACION,
        split: SplitSuggestion {
            unit: "subject",
            val_split: 0.2,
            test_split: 0.2,
            require_test: true,
        },
        notes: &[
            "Preentrenado sobre teselas de histopatología. Una tesela no tiene \
             orientación, así que los volteos y giros libres son legítimos.",
            "Agrupa por **caso**, no por lámina ni por tesela: varias láminas de un \
             mismo paciente comparten todo lo que el modelo podría memorizar.",
        ],
    },
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::training::backends::get_all_backends;

    /// La regla del módulo, como test: un preset cuyo backend o modelo no exista
    /// se descubriría al lanzarlo, que es el peor momento posible.
    #[test]
    fn todo_preset_apunta_a_un_backend_y_modelo_que_existen() {
        let catalogo = get_all_backends();

        for p in BIOMED_PRESETS {
            let backend = catalogo
                .iter()
                .find(|b| b.id == p.backend)
                .unwrap_or_else(|| panic!("{}: el backend «{}» no existe", p.id, p.backend));

            assert!(
                backend.models.iter().any(|m| m.id == p.model_id),
                "{}: el modelo «{}» no está en el backend «{}»",
                p.id,
                p.model_id,
                p.backend
            );

            assert!(
                backend.supported_tasks.iter().any(|t| t == p.task),
                "{}: el backend «{}» no hace la tarea «{}»",
                p.id,
                p.backend,
                p.task
            );
        }
    }

    /// El parámetro que más importa de toda la tabla: una modalidad con lados no
    /// puede traer volteo horizontal. Si alguien lo cambia, el modelo deja de
    /// poder aprender lateralidad y nada lo delataría.
    #[test]
    fn ninguna_modalidad_lateralizada_voltea_en_horizontal() {
        for p in BIOMED_PRESETS {
            if p.lateralized {
                assert_eq!(
                    p.augmentation.fliplr, 0.0,
                    "{} es de modalidad lateralizada y voltea en horizontal",
                    p.id
                );
                assert_eq!(
                    p.augmentation.flipud, 0.0,
                    "{} es de modalidad lateralizada y voltea en vertical",
                    p.id
                );
                assert!(
                    p.augmentation.degrees <= 15.0,
                    "{} gira {}°: el posicionamiento del paciente está estandarizado",
                    p.id,
                    p.augmentation.degrees
                );
            }
        }
    }

    /// Mezclar dos pacientes crea un hallazgo que no es de ninguno, y pegar
    /// imágenes crea contexto anatómico imposible. En ninguna modalidad médica
    /// tiene sentido.
    #[test]
    fn ningun_preset_medico_mezcla_pacientes() {
        for p in BIOMED_PRESETS {
            assert_eq!(p.augmentation.mixup, 0.0, "{} usa mixup", p.id);
            if p.lateralized {
                assert_eq!(p.augmentation.mosaic, 0.0, "{} usa mosaico", p.id);
                assert_eq!(p.augmentation.copy_paste, 0.0, "{} usa copy-paste", p.id);
            }
        }
    }

    /// Todo preset biomédico recomienda agrupar por sujeto y exigir test: es lo
    /// que separa una métrica que se puede defender de una que no.
    #[test]
    fn todo_preset_recomienda_agrupar_por_sujeto_y_exigir_test() {
        for p in BIOMED_PRESETS {
            assert_eq!(p.split.unit, "subject", "{} no agrupa por sujeto", p.id);
            assert!(p.split.test_split > 0.0, "{} no pide test", p.id);
            assert!(p.split.require_test, "{} no exige test", p.id);
        }
    }

    /// Cada preset dice para qué sirve y qué cuidado hay que tener: sin eso, la
    /// diferencia con el preset generalista no se ve y se elige al azar.
    #[test]
    fn todo_preset_explica_para_que_sirve() {
        for p in BIOMED_PRESETS {
            assert!(!p.notes.is_empty(), "{} no explica nada", p.id);
            assert!(
                !p.modalities.is_empty(),
                "{} no dice de qué modalidad",
                p.id
            );
        }
    }

    #[test]
    fn los_ids_no_se_repiten() {
        let mut vistos = std::collections::HashSet::new();
        for p in BIOMED_PRESETS {
            assert!(vistos.insert(p.id), "id repetido: {}", p.id);
        }
    }
}
