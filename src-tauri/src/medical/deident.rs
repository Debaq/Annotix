//! Deidentificación de DICOM al importar.
//!
//! Un DICOM trae el nombre del paciente, su fecha de nacimiento, su identificador
//! del hospital, la institución, el médico que lo pidió y el número de acceso.
//! Nada de eso hace falta para entrenar un modelo, y todo eso sale del hospital
//! en cuanto alguien copia la carpeta del proyecto.
//!
//! ## Qué hace, y qué no
//!
//! Sigue el espíritu del perfil básico de confidencialidad de DICOM (PS3.15,
//! anexo E): quita los identificadores directos y deja los datos de adquisición,
//! que son los que describen la imagen. **No es una implementación certificada de
//! ese perfil**: no reescribe UIDs con un mapa consistente, no toca lo que pueda
//! haber quemado en los píxeles, y no mira las etiquetas privadas de cada
//! fabricante una por una —las descarta todas en bloque, que es más seguro y más
//! tosco—.
//!
//! Por eso el importador devuelve un **informe de lo que quitó**, y por eso hay
//! que verificar el resultado con una herramienta externa antes de confiar un
//! corpus clínico a esto. Decirlo aquí es parte del trabajo: una deidentificación
//! que promete más de lo que hace es peor que ninguna, porque se deja de mirar.

use serde::{Deserialize, Serialize};

/// Etiquetas que se eliminan por ser identificadores directos o cuasi-directos.
///
/// `(grupo, elemento, nombre)`. El nombre es para el informe: quien lo lee no
/// tiene por qué saberse los números.
pub const A_ELIMINAR: &[(u16, u16, &str)] = &[
    // Identidad del paciente
    (0x0010, 0x0010, "PatientName"),
    (0x0010, 0x0020, "PatientID"),
    (0x0010, 0x0021, "IssuerOfPatientID"),
    (0x0010, 0x0030, "PatientBirthDate"),
    (0x0010, 0x0032, "PatientBirthTime"),
    (0x0010, 0x1000, "OtherPatientIDs"),
    (0x0010, 0x1001, "OtherPatientNames"),
    (0x0010, 0x1005, "PatientBirthName"),
    (0x0010, 0x1040, "PatientAddress"),
    (0x0010, 0x1060, "PatientMotherBirthName"),
    (0x0010, 0x2154, "PatientTelephoneNumbers"),
    (0x0010, 0x2160, "EthnicGroup"),
    (0x0010, 0x4000, "PatientComments"),
    // Quién y dónde
    (0x0008, 0x0080, "InstitutionName"),
    (0x0008, 0x0081, "InstitutionAddress"),
    (0x0008, 0x0090, "ReferringPhysicianName"),
    (0x0008, 0x0092, "ReferringPhysicianAddress"),
    (0x0008, 0x0094, "ReferringPhysicianTelephoneNumbers"),
    (0x0008, 0x1048, "PhysiciansOfRecord"),
    (0x0008, 0x1050, "PerformingPhysicianName"),
    (0x0008, 0x1060, "NameOfPhysiciansReadingStudy"),
    (0x0008, 0x1070, "OperatorsName"),
    (0x0008, 0x1010, "StationName"),
    (0x0040, 0x0006, "ScheduledPerformingPhysicianName"),
    // Números de expediente
    (0x0008, 0x0050, "AccessionNumber"),
    (0x0020, 0x0010, "StudyID"),
    (0x0038, 0x0010, "AdmissionID"),
    (0x0038, 0x0300, "CurrentPatientLocation"),
    (0x0038, 0x0400, "PatientInstitutionResidence"),
    // Texto libre: lo que alguien escribió a mano puede contener cualquier cosa
    (0x0008, 0x1030, "StudyDescription"),
    (0x0008, 0x103E, "SeriesDescription"),
    (0x0008, 0x4000, "IdentifyingComments"),
    (0x0020, 0x4000, "ImageComments"),
    (0x0032, 0x1060, "RequestedProcedureDescription"),
    (0x0040, 0x0254, "PerformedProcedureStepDescription"),
    (0x0040, 0x1400, "RequestedProcedureComments"),
];

/// Etiquetas que se **conservan**: describen cómo se adquirió la imagen, no a
/// quién. Sin ellas el corpus pierde justo lo que permite decir para qué equipos
/// vale un modelo.
pub const A_CONSERVAR: &[(u16, u16, &str)] = &[
    (0x0008, 0x0060, "Modality"),
    (0x0008, 0x0070, "Manufacturer"),
    (0x0008, 0x1090, "ManufacturerModelName"),
    (0x0018, 0x0015, "BodyPartExamined"),
    (0x0018, 0x0050, "SliceThickness"),
    (0x0018, 0x0060, "KVP"),
    (0x0018, 0x0080, "RepetitionTime"),
    (0x0018, 0x0081, "EchoTime"),
    (0x0018, 0x0087, "MagneticFieldStrength"),
    (0x0018, 0x1030, "ProtocolName"),
    (0x0018, 0x1151, "XRayTubeCurrent"),
    (0x0018, 0x5100, "PatientPosition"),
    (0x0028, 0x0030, "PixelSpacing"),
    (0x0028, 0x1050, "WindowCenter"),
    (0x0028, 0x1051, "WindowWidth"),
    (0x0028, 0x1052, "RescaleIntercept"),
    (0x0028, 0x1053, "RescaleSlope"),
];

/// Edad y sexo: se conservan porque describen a la población y el contrato de
/// modelo los necesita, pero **la edad se redondea a años** —una fecha de
/// nacimiento exacta identifica— y se dice que se hizo.
pub const CUASI_IDENTIFICADORES: &[(u16, u16, &str)] = &[
    (0x0010, 0x0040, "PatientSex"),
    (0x0010, 0x1010, "PatientAge"),
];

/// Qué se quitó de un archivo, para que el usuario pueda comprobarlo.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeidentReport {
    /// Etiquetas eliminadas, por nombre.
    pub removed: Vec<String>,
    /// Etiquetas **conservadas**, por nombre. Van en el informe porque «qué se
    /// quitó» sólo es media respuesta: quien revisa un corpus necesita saber
    /// también qué sigue ahí.
    pub kept: Vec<String>,
    /// Cuasi-identificadores que se conservaron con reducción: sexo, y edad
    /// redondeada a años. Se listan aparte porque no son ni carne ni pescado —
    /// describen la población y a la vez estrechan el círculo de quién puede ser.
    pub reduced: Vec<String>,
    /// Etiquetas privadas del fabricante eliminadas en bloque.
    pub private_removed: usize,
    /// El `PatientID` se convirtió en este seudónimo. `None` si no venía.
    pub subject_pseudonym: Option<String>,
    /// Avisos: lo que esta deidentificación **no** cubre y el usuario tiene que
    /// mirar por su cuenta.
    pub warnings: Vec<String>,
}

/// Seudónimo estable de un identificador de paciente **dentro de un proyecto**.
///
/// El mismo paciente da siempre el mismo seudónimo en el mismo proyecto —hace
/// falta para agrupar sus muestras en el reparto— y uno distinto en otro
/// proyecto, porque el id del proyecto entra en la cuenta. Así, dos corpus
/// compartidos por separado no se pueden cruzar por el seudónimo.
///
/// Es un hash con sal, no un cifrado: **no se puede deshacer**. Quien necesite
/// volver al identificador real tiene que guardarse su propia tabla, y eso es
/// una decisión del estudio, no de la app.
pub fn seudonimo(project_id: &str, patient_id: &str) -> String {
    let h = crate::hashchain::sha256_hex(&format!("{}|{}", project_id, patient_id.trim()));
    format!("SUJ-{}", &h[..12].to_uppercase())
}

/// Avisos que acompañan siempre a una importación deidentificada.
///
/// Van en cada informe a propósito. Un usuario que importa mil archivos ve el
/// informe una vez; si estas frases estuvieran sólo en la documentación, no las
/// vería nunca.
pub fn avisos_estandar() -> Vec<String> {
    vec![
        "No se inspeccionan los píxeles: si la imagen lleva el nombre del paciente \
         quemado —frecuente en ecografía y en capturas de pantalla—, sigue ahí."
            .to_string(),
        "Los UID de estudio y serie se eliminan en vez de reescribirse con un mapa \
         consistente: dos archivos de la misma serie dejan de saber que lo son."
            .to_string(),
        "Las etiquetas privadas del fabricante se descartan en bloque. Es lo seguro, \
         pero puede llevarse metadatos de adquisición útiles."
            .to_string(),
        "Esto no es una implementación certificada del perfil PS3.15. Antes de \
         confiarle un corpus clínico, verifica el resultado con una herramienta \
         externa."
            .to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// El mismo paciente, el mismo seudónimo: sin eso no se pueden agrupar sus
    /// muestras y el reparto volvería a partirlo entre particiones.
    #[test]
    fn el_seudonimo_es_estable_dentro_del_proyecto() {
        let a = seudonimo("proj-1", "12345678");
        let b = seudonimo("proj-1", "12345678");
        assert_eq!(a, b);
        assert!(a.starts_with("SUJ-"));
    }

    /// Y distinto en otro proyecto: dos corpus compartidos por separado no se
    /// pueden cruzar por el seudónimo.
    #[test]
    fn el_seudonimo_no_se_puede_cruzar_entre_proyectos() {
        assert_ne!(
            seudonimo("proj-1", "12345678"),
            seudonimo("proj-2", "12345678")
        );
    }

    /// El seudónimo no puede parecerse al identificador original ni contenerlo.
    #[test]
    fn el_seudonimo_no_filtra_el_identificador() {
        let id = "H-998877";
        let s = seudonimo("proj-1", id);
        assert!(!s.contains(id));
        assert!(!s.contains("998877"));
    }

    /// Espacios de más no pueden producir dos seudónimos para el mismo paciente.
    #[test]
    fn los_espacios_no_crean_un_paciente_nuevo() {
        assert_eq!(seudonimo("p", "  1234 "), seudonimo("p", "1234"));
    }

    /// Ninguna etiqueta puede estar a la vez en la lista de eliminar y en la de
    /// conservar: sería ambiguo y el resultado dependería del orden del código.
    #[test]
    fn ninguna_etiqueta_esta_en_las_dos_listas() {
        for (g, e, nombre) in A_ELIMINAR {
            assert!(
                !A_CONSERVAR.iter().any(|(g2, e2, _)| g2 == g && e2 == e),
                "{nombre} está en eliminar y en conservar"
            );
        }
    }

    /// Los avisos no son decoración: si alguno desaparece, el informe deja de
    /// decir lo que esta deidentificación no cubre.
    #[test]
    fn los_avisos_dicen_lo_que_no_se_cubre() {
        let avisos = avisos_estandar();
        assert!(avisos.iter().any(|a| a.contains("píxeles")));
        assert!(avisos.iter().any(|a| a.contains("UID")));
        assert!(avisos.iter().any(|a| a.contains("PS3.15")));
    }
}
