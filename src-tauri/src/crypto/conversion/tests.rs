//! Lo que hay que probar de la conversión: que no se deje nada, que lo que deja
//! fuera sea a propósito, que se pueda reanudar, y que ida y vuelta devuelva el
//! proyecto byte a byte.

use super::*;
use crate::crypto::sesion;
use crate::crypto::vault::Vault;

const FRASE: &str = "una frase de paso suficientemente larga";

/// Proyecto en claro con imagen, thumbnail, serie, dataset preparado y registro.
fn proyecto() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path();
    std::fs::write(d.join("project.json"), br#"{"name":"Sarcoma"}"#).unwrap();
    std::fs::create_dir_all(d.join("images")).unwrap();
    std::fs::write(d.join("images/a.png"), b"pixeles de A").unwrap();
    std::fs::create_dir_all(d.join("thumbnails")).unwrap();
    std::fs::write(d.join("thumbnails/a.jpg"), b"mini A").unwrap();
    std::fs::create_dir_all(d.join("timeseries")).unwrap();
    std::fs::write(d.join("timeseries/s.json"), b"[1,2,3]").unwrap();
    std::fs::create_dir_all(d.join("training/job_1")).unwrap();
    std::fs::write(d.join("training/job_1/data.yaml"), b"nc: 2").unwrap();
    crate::audit::log::record(
        d,
        "proj-1",
        crate::audit::events::LOG_OPENED,
        serde_json::json!({}),
    )
    .unwrap();
    crate::audit::log::close(d);
    tmp
}

fn instantanea(dir: &std::path::Path) -> Vec<(String, Vec<u8>)> {
    let mut v: Vec<(String, Vec<u8>)> = archivos(dir)
        .into_iter()
        .map(|p| (relativa(dir, &p), std::fs::read(&p).unwrap()))
        .collect();
    v.sort();
    v
}

#[test]
fn cifrar_no_se_deja_ningun_archivo_del_corpus() {
    let tmp = proyecto();
    let (vault, clave) = Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();
    sesion::desbloquear(tmp.path(), clave.clone());

    let avance = cifrar_proyecto(tmp.path(), &clave, |_| {}).unwrap();
    assert!(avance.fallos.is_empty(), "{:?}", avance.fallos);
    assert!(avance.hechos >= 5, "{avance:?}");

    for rel in ["project.json", "images/a.png", "thumbnails/a.jpg", "timeseries/s.json"] {
        let bytes = std::fs::read(tmp.path().join(rel)).unwrap();
        assert!(archivo::es_cifrado(&bytes), "{rel} quedó en claro");
    }
    let registro = std::fs::read_to_string(tmp.path().join("audit.jsonl")).unwrap();
    assert!(registro.starts_with("#ANXLOG1"));
    sesion::bloquear(tmp.path());
}

#[test]
fn el_dataset_preparado_se_queda_en_claro_a_proposito() {
    // Lo lee y lo escribe Python, que no sabe descifrar. Es una copia del corpus
    // en claro al lado del corpus cifrado, y por eso hay que decirlo donde se
    // activa el cifrado en vez de esconderlo aquí.
    let tmp = proyecto();
    let (vault, clave) = Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();
    sesion::desbloquear(tmp.path(), clave.clone());
    cifrar_proyecto(tmp.path(), &clave, |_| {}).unwrap();

    let yaml = std::fs::read(tmp.path().join("training/job_1/data.yaml")).unwrap();
    assert_eq!(yaml, b"nc: 2");
    sesion::bloquear(tmp.path());
}

#[test]
fn ida_y_vuelta_devuelve_el_proyecto_igual() {
    let tmp = proyecto();
    let antes = instantanea(tmp.path());
    let registro_antes = std::fs::read_to_string(tmp.path().join("audit.jsonl")).unwrap();

    let (vault, clave) = Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();
    sesion::desbloquear(tmp.path(), clave.clone());
    cifrar_proyecto(tmp.path(), &clave, |_| {}).unwrap();
    descifrar_proyecto(tmp.path(), &clave, |_| {}).unwrap();

    assert_eq!(instantanea(tmp.path()), antes);
    // Y la cadena de auditoría es la misma: convertir no invalida el registro.
    assert_eq!(
        std::fs::read_to_string(tmp.path().join("audit.jsonl")).unwrap(),
        registro_antes
    );
    sesion::bloquear(tmp.path());
}

#[test]
fn una_conversion_a_medias_se_reanuda() {
    // Es la propiedad que da el detectar por marca de cabecera: un corte de luz
    // deja unos archivos cifrados y otros no, y eso se lee igual de bien.
    let tmp = proyecto();
    let (vault, clave) = Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();
    sesion::desbloquear(tmp.path(), clave.clone());

    // Cifrar sólo una parte a mano, como si el proceso hubiera muerto ahí.
    let uno = tmp.path().join("images/a.png");
    let bytes = std::fs::read(&uno).unwrap();
    std::fs::write(&uno, archivo::cifrar(&clave, "images/a.png", &bytes).unwrap()).unwrap();

    let avance = cifrar_proyecto(tmp.path(), &clave, |_| {}).unwrap();
    assert_eq!(avance.saltados, 1, "el ya cifrado no se vuelve a cifrar");
    assert!(avance.fallos.is_empty());
    assert_eq!(
        crate::store::io::leer_ruta(&uno).unwrap(),
        b"pixeles de A".to_vec()
    );
    sesion::bloquear(tmp.path());
}

#[test]
fn el_vault_no_entra_en_la_conversion() {
    // Cifrar la cabecera con la clave que guarda es perder el proyecto.
    let tmp = proyecto();
    let (vault, clave) = Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();
    sesion::desbloquear(tmp.path(), clave.clone());
    cifrar_proyecto(tmp.path(), &clave, |_| {}).unwrap();

    let leido = Vault::leer(tmp.path()).unwrap().unwrap();
    assert_eq!(leido.abrir(FRASE).unwrap().bytes(), clave.bytes());
    sesion::bloquear(tmp.path());
}

#[test]
fn el_avance_cuenta_lo_que_queda() {
    let tmp = proyecto();
    let (vault, clave) = Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();
    sesion::desbloquear(tmp.path(), clave.clone());

    let mut ultimo = Avance::default();
    let avance = cifrar_proyecto(tmp.path(), &clave, |a| ultimo = a.clone()).unwrap();
    assert_eq!(ultimo.hechos, avance.hechos);
    assert_eq!(avance.hechos + avance.saltados, avance.total);
    sesion::bloquear(tmp.path());
}
