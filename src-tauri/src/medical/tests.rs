//! Pruebas de la ingesta médica, con DICOM construidos en la propia prueba.
//!
//! Lo que hay que demostrar no es que se lea un archivo: es que **el nombre del
//! paciente no llegue al proyecto**. Un test que sólo comprobara que la imagen
//! entra dejaría pasar exactamente el fallo que importa.

use dicom_dictionary_std::tags;
use dicom_object::{FileMetaTableBuilder, InMemDicomObject};

use super::deident;
use super::dicom;

/// Un DICOM mínimo pero real: cabecera de archivo, identificadores de paciente y
/// una imagen de 4×4 en 16 bits.
///
/// Se construye aquí en vez de traer un archivo de muestra porque un DICOM de
/// muestra con datos de paciente reales no puede vivir en un repositorio, y uno
/// con datos falsos habría que fabricarlo igual.
fn dicom_de_prueba(ruta: &std::path::Path, con_ventana: bool) {
    use dicom_core::value::PrimitiveValue;
    use dicom_core::VR;
    use dicom_object::mem::InMemElement;

    let mut obj = InMemDicomObject::new_empty();

    let texto = |tag, vr, v: &str| InMemElement::new(tag, vr, PrimitiveValue::from(v));

    // Lo que hay que quitar.
    obj.put(texto(tags::PATIENT_NAME, VR::PN, "PEREZ^JUAN"));
    obj.put(texto(tags::PATIENT_ID, VR::LO, "H-0099887"));
    obj.put(texto(tags::PATIENT_BIRTH_DATE, VR::DA, "19551103"));
    obj.put(texto(tags::INSTITUTION_NAME, VR::LO, "Hospital Central"));
    obj.put(texto(tags::REFERRING_PHYSICIAN_NAME, VR::PN, "SOTO^ANA"));
    obj.put(texto(tags::ACCESSION_NUMBER, VR::SH, "ACC-4455"));
    obj.put(texto(tags::STUDY_DESCRIPTION, VR::LO, "TAC torax control"));

    // Lo que hay que conservar.
    obj.put(texto(tags::MODALITY, VR::CS, "CT"));
    obj.put(texto(tags::MANUFACTURER, VR::LO, "ACME"));
    obj.put(texto(tags::BODY_PART_EXAMINED, VR::CS, "CHEST"));
    obj.put(texto(tags::PATIENT_SEX, VR::CS, "M"));
    obj.put(texto(tags::PATIENT_AGE, VR::AS, "070Y"));
    obj.put(texto(tags::PIXEL_SPACING, VR::DS, "0.7\\0.7"));
    obj.put(texto(tags::RESCALE_INTERCEPT, VR::DS, "-1024"));
    obj.put(texto(tags::RESCALE_SLOPE, VR::DS, "1"));
    if con_ventana {
        obj.put(texto(tags::WINDOW_CENTER, VR::DS, "-600"));
        obj.put(texto(tags::WINDOW_WIDTH, VR::DS, "1500"));
    }

    // Una etiqueta privada del fabricante (grupo impar).
    obj.put(InMemElement::new(
        dicom_object::Tag(0x0009, 0x0010),
        VR::LO,
        PrimitiveValue::from("ACME PRIVATE"),
    ));

    // Imagen 4×4, 16 bits sin signo, un gradiente.
    obj.put(InMemElement::new(
        tags::SAMPLES_PER_PIXEL,
        VR::US,
        PrimitiveValue::from(1u16),
    ));
    obj.put(texto(
        tags::PHOTOMETRIC_INTERPRETATION,
        VR::CS,
        "MONOCHROME2",
    ));
    obj.put(InMemElement::new(
        tags::ROWS,
        VR::US,
        PrimitiveValue::from(4u16),
    ));
    obj.put(InMemElement::new(
        tags::COLUMNS,
        VR::US,
        PrimitiveValue::from(4u16),
    ));
    obj.put(InMemElement::new(
        tags::BITS_ALLOCATED,
        VR::US,
        PrimitiveValue::from(16u16),
    ));
    obj.put(InMemElement::new(
        tags::BITS_STORED,
        VR::US,
        PrimitiveValue::from(16u16),
    ));
    obj.put(InMemElement::new(
        tags::HIGH_BIT,
        VR::US,
        PrimitiveValue::from(15u16),
    ));
    obj.put(InMemElement::new(
        tags::PIXEL_REPRESENTATION,
        VR::US,
        PrimitiveValue::from(0u16),
    ));

    let pixeles: dicom_core::value::C<u16> = (0..16u16).map(|i| i * 200).collect();
    obj.put(InMemElement::new(
        tags::PIXEL_DATA,
        VR::OW,
        PrimitiveValue::U16(pixeles),
    ));

    let meta = FileMetaTableBuilder::new()
        .media_storage_sop_class_uid("1.2.840.10008.5.1.4.1.1.2") // CT Image Storage
        .media_storage_sop_instance_uid("1.2.3.4.5.6.7.8")
        .transfer_syntax("1.2.840.10008.1.2.1"); // Explicit VR Little Endian

    // `with_meta` toma el constructor, no la tabla: completa los UID que falten
    // a partir del propio objeto.
    obj.with_meta(meta)
        .expect("objeto con cabecera")
        .write_to_file(ruta)
        .expect("escribir dicom");
}

/// El test que justifica el módulo: el nombre del paciente **no llega**.
#[test]
fn el_nombre_del_paciente_no_entra_al_proyecto() {
    let tmp = tempfile::tempdir().unwrap();
    let ruta = tmp.path().join("caso.dcm");
    dicom_de_prueba(&ruta, true);

    let img = dicom::leer(&ruta, "proj-1").expect("leer dicom");

    // Ni en los metadatos que se guardan…
    let serializado = serde_json::to_string(&img.meta).unwrap();
    for filtrado in [
        "PEREZ",
        "JUAN",
        "H-0099887",
        "19551103",
        "Hospital Central",
        "SOTO",
    ] {
        assert!(
            !serializado.contains(filtrado),
            "«{filtrado}» sobrevivió en los metadatos: {serializado}"
        );
    }

    // …ni en el sujeto, que va seudonimizado.
    let sujeto = img.deident.subject_pseudonym.clone().expect("seudónimo");
    assert!(sujeto.starts_with("SUJ-"));
    assert!(!sujeto.contains("0099887"));
    assert_eq!(sujeto, deident::seudonimo("proj-1", "H-0099887"));
}

/// El informe dice qué se quitó, qué se quedó y qué no cubre. Sin esa lista, la
/// deidentificación es una promesa que nadie puede comprobar.
#[test]
fn el_informe_enumera_lo_quitado_y_lo_conservado() {
    let tmp = tempfile::tempdir().unwrap();
    let ruta = tmp.path().join("caso.dcm");
    dicom_de_prueba(&ruta, true);

    let img = dicom::leer(&ruta, "proj-1").expect("leer dicom");
    let d = &img.deident;

    for esperado in [
        "PatientName",
        "PatientID",
        "PatientBirthDate",
        "InstitutionName",
        "ReferringPhysicianName",
        "AccessionNumber",
        "StudyDescription",
    ] {
        assert!(
            d.removed.iter().any(|r| r == esperado),
            "no se informó la eliminación de {esperado}: {:?}",
            d.removed
        );
    }

    for conservado in ["Modality", "Manufacturer", "PixelSpacing"] {
        assert!(
            d.kept.iter().any(|k| k == conservado),
            "no se informó que se conserva {conservado}: {:?}",
            d.kept
        );
    }

    assert!(d.reduced.iter().any(|r| r == "PatientAge"));
    assert!(d.private_removed >= 1, "no contó la etiqueta privada");
    assert!(d.warnings.iter().any(|w| w.contains("píxeles")));
}

/// Los metadatos de adquisición sí se conservan: sin ellos, el corpus pierde lo
/// que permite decir para qué equipos vale un modelo.
#[test]
fn los_metadatos_de_adquisicion_sobreviven() {
    let tmp = tempfile::tempdir().unwrap();
    let ruta = tmp.path().join("caso.dcm");
    dicom_de_prueba(&ruta, true);

    let img = dicom::leer(&ruta, "proj-1").expect("leer dicom");
    let m = &img.meta;

    assert_eq!(m.modality.as_deref(), Some("CT"));
    assert_eq!(m.manufacturer.as_deref(), Some("ACME"));
    assert_eq!(m.body_part.as_deref(), Some("CHEST"));
    assert_eq!(m.patient_sex.as_deref(), Some("M"));
    assert_eq!(m.patient_age_years, Some(70));
    assert_eq!(m.pixel_spacing.as_deref(), Some(&[0.7, 0.7][..]));
    assert_eq!((m.rows, m.columns), (4, 4));
}

/// La ventana del archivo manda sobre la calculada: es la que el equipo
/// consideró adecuada para esa adquisición.
#[test]
fn la_ventana_del_archivo_manda_sobre_la_calculada() {
    let tmp = tempfile::tempdir().unwrap();

    let con = tmp.path().join("con.dcm");
    dicom_de_prueba(&con, true);
    let img = dicom::leer(&con, "p").expect("leer");
    assert!(img.meta.window_from_file);
    let w = img.meta.window.expect("ventana");
    assert_eq!((w.center, w.width), (-600.0, 1500.0));

    let sin = tmp.path().join("sin.dcm");
    dicom_de_prueba(&sin, false);
    let img = dicom::leer(&sin, "p").expect("leer");
    assert!(
        !img.meta.window_from_file,
        "se inventó que venía del archivo"
    );
    assert!(img.meta.window.expect("ventana").width > 0.0);
}

/// El reescalado se aplica **una sola vez**: un CT con intercepto −1024 sale en
/// unidades Hounsfield. Aplicarlo dos veces —que es lo que pasaba antes, porque
/// `to_vec` ya lo hace— desplazaba la imagen 1024 HU y la ventana de pulmón
/// mostraba negro.
#[test]
fn el_rescalado_del_archivo_se_aplica_una_sola_vez() {
    let tmp = tempfile::tempdir().unwrap();
    let ruta = tmp.path().join("caso.dcm");
    dicom_de_prueba(&ruta, true);

    let img = dicom::leer(&ruta, "p").expect("leer");
    // El píxel 0 vale 0 en el archivo → 0·1 + (−1024) = −1024 HU, ni −2048.
    assert_eq!(img.values[0], -1024.0);
    let (min, max) = img.meta.value_range.expect("rango");
    assert_eq!(min, -1024.0);
    // El último píxel vale 15·200 = 3000 → 3000 − 1024 = 1976 HU.
    assert_eq!(max, 1976.0);
}

/// Un DICOM se reconoce por su preámbulo, no por la extensión: muchos DICOM
/// clínicos no llevan ninguna.
#[test]
fn un_dicom_sin_extension_se_reconoce_igual() {
    let tmp = tempfile::tempdir().unwrap();
    let ruta = tmp.path().join("sin_extension");
    dicom_de_prueba(&ruta, true);

    assert!(dicom::es_dicom(&ruta));
}

/// La imagen renderizada es un PNG en gris del tamaño que declara el archivo.
#[test]
fn la_imagen_renderizada_es_un_png_del_tamano_declarado() {
    let tmp = tempfile::tempdir().unwrap();
    let ruta = tmp.path().join("caso.dcm");
    dicom_de_prueba(&ruta, true);

    let img = dicom::leer(&ruta, "p").expect("leer");
    let png = img.a_png().expect("png");

    let decodificada = image::load_from_memory(&png).expect("decodificar png");
    assert_eq!((decodificada.width(), decodificada.height()), (4, 4));
    assert_eq!(img.gray.len(), 16);
}

/// La copia de 16 bits tiene que devolver los mismos valores físicos: si no, el
/// reventaneo posterior mostraría otra cosa que la imagen original.
#[test]
fn la_copia_de_16_bits_conserva_los_valores_fisicos() {
    let tmp = tempfile::tempdir().unwrap();
    let ruta = tmp.path().join("caso.dcm");
    dicom_de_prueba(&ruta, true);
    let img = dicom::leer(&ruta, "p").expect("leer");

    let dir = tmp.path().join("medical");
    let (nombre, slope, intercept) = super::import::guardar_crudo_para_test(
        &dir,
        "x.raw.png",
        &img.values,
        img.width,
        img.height,
    )
    .expect("guardar crudo");

    let (leidos, w, h) =
        super::import::leer_crudo(&dir.join(nombre), slope, intercept).expect("leer crudo");

    assert_eq!((w, h), (img.width, img.height));
    for (original, vuelto) in img.values.iter().zip(leidos.iter()) {
        assert!(
            (original - vuelto).abs() < 0.1,
            "el valor cambió al ida y vuelta: {original} → {vuelto}"
        );
    }
}
