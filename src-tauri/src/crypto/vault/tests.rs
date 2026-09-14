//! Lo que hay que probar del vault no es que cifre: es que la frase equivocada
//! no abra, que cambiar la frase no toque los datos, y que quitar la última
//! ranura no deje un proyecto que nadie pueda abrir.

use super::*;

const FRASE: &str = "correcto caballo batería grapa";

#[test]
fn la_frase_correcta_abre_y_la_equivocada_no() {
    let (vault, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    let abierta = vault.abrir(FRASE).unwrap();
    assert_eq!(abierta.bytes(), clave.bytes());
    assert!(vault.abrir("correcto caballo bateria grapa").is_err());
    assert!(vault.abrir("").is_err());
}

#[test]
fn la_clave_no_sale_de_la_frase() {
    // Dos proyectos con la misma frase tienen claves distintas: la frase sólo
    // envuelve. Si la clave se derivara de la frase, cambiarla obligaría a
    // recifrar el corpus entero.
    let (_, a) = Vault::crear(FRASE, "a").unwrap();
    let (_, b) = Vault::crear(FRASE, "b").unwrap();
    assert_ne!(a.bytes(), b.bytes());
}

#[test]
fn varias_personas_abren_el_mismo_dataset_con_su_propia_frase() {
    // Es el caso que pidió la decisión de esta etapa: un dataset compartido
    // entre los usuarios, cada uno con su frase, una sola clave debajo.
    let (mut vault, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    vault.anadir_ranura(&clave, "otra frase larga del segundo lector", "Ana").unwrap();

    assert_eq!(vault.slots.len(), 2);
    assert_eq!(vault.abrir(FRASE).unwrap().bytes(), clave.bytes());
    assert_eq!(
        vault
            .abrir("otra frase larga del segundo lector")
            .unwrap()
            .bytes(),
        clave.bytes()
    );
}

#[test]
fn retirar_a_alguien_no_afecta_a_los_demas() {
    let (mut vault, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    let id_ana = vault.anadir_ranura(&clave, "la frase de Ana, bien larga", "Ana").unwrap();
    vault.quitar_ranura(&id_ana).unwrap();
    assert!(vault.abrir("la frase de Ana, bien larga").is_err());
    assert_eq!(vault.abrir(FRASE).unwrap().bytes(), clave.bytes());
}

#[test]
fn no_se_puede_quitar_la_ultima_ranura() {
    // Un vault sin ranuras es un proyecto que nadie puede volver a abrir, y eso
    // no puede ser el resultado de pulsar «quitar».
    let (mut vault, _) = Vault::crear(FRASE, "Nicolás").unwrap();
    let id = vault.slots[0].id.clone();
    let e = vault.quitar_ranura(&id).unwrap_err();
    assert!(e.contains("ilegible"), "{e}");
    assert_eq!(vault.slots.len(), 1);
}

#[test]
fn cambiar_la_frase_conserva_la_clave() {
    // Lo que se reescribe es la envoltura, no el corpus: la clave de proyecto
    // tiene que seguir siendo la misma o habría que recifrar miles de imágenes.
    let (mut vault, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    vault.cambiar_frase(FRASE, "una frase nueva igual de larga").unwrap();
    assert!(vault.abrir(FRASE).is_err());
    let abierta = vault.abrir("una frase nueva igual de larga").unwrap();
    assert_eq!(abierta.bytes(), clave.bytes());
    assert_eq!(vault.slots.len(), 1, "la ranura vieja no se queda colgando");
}

#[test]
fn la_clave_compartida_va_y_vuelve() {
    let (_, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    let texto = clave.exportar_compartida();
    assert!(texto.starts_with("annotix-key-v1:"));
    let vuelta = ClaveProyecto::importar_compartida(&texto).unwrap();
    assert_eq!(vuelta.bytes(), clave.bytes());

    assert!(ClaveProyecto::importar_compartida("hola").is_err());
    assert!(ClaveProyecto::importar_compartida("annotix-key-v1:AAAA").is_err());
}

#[test]
fn quien_recibe_el_dataset_monta_su_propia_frase_sobre_la_misma_clave() {
    let (_, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    let compartida = ClaveProyecto::importar_compartida(&clave.exportar_compartida()).unwrap();
    let vault_del_otro = Vault::para_clave(&compartida, "la frase del otro equipo", "Ana").unwrap();
    assert_eq!(
        vault_del_otro.abrir("la frase del otro equipo").unwrap().bytes(),
        clave.bytes()
    );
    assert!(vault_del_otro.abrir(FRASE).is_err());
}

#[test]
fn tocar_los_parametros_de_coste_invalida_la_ranura() {
    // Sin atar la cabecera a la envoltura, bajar la memoria de Argon2id a mano
    // en el vault.json abarataría atacar la frase por fuerza bruta.
    let (mut vault, _) = Vault::crear(FRASE, "Nicolás").unwrap();
    vault.kdf_params.m = 8;
    assert!(vault.abrir(FRASE).is_err());
}

#[test]
fn un_vault_de_una_version_futura_se_rechaza_con_su_motivo() {
    let (mut vault, _) = Vault::crear(FRASE, "Nicolás").unwrap();
    vault.version = VERSION + 1;
    let e = vault.abrir(FRASE).unwrap_err();
    assert!(e.contains("más nueva"), "{e}");
}

#[test]
fn el_vault_va_y_vuelve_del_disco_sin_llevarse_la_clave() {
    let tmp = tempfile::tempdir().unwrap();
    let (vault, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    vault.escribir(tmp.path()).unwrap();

    let texto = std::fs::read_to_string(tmp.path().join(FILE_NAME)).unwrap();
    let clave_b64 = base64::engine::general_purpose::STANDARD.encode(clave.bytes());
    assert!(
        !texto.contains(&clave_b64),
        "la clave del proyecto no puede aparecer en el vault.json"
    );

    let leido = Vault::leer(tmp.path()).unwrap().unwrap();
    assert_eq!(leido, vault);
    assert_eq!(leido.abrir(FRASE).unwrap().bytes(), clave.bytes());
    assert!(Vault::leer(&tmp.path().join("no-existe")).unwrap().is_none());
}

#[test]
fn la_clave_no_se_imprime_en_un_log() {
    let (_, clave) = Vault::crear(FRASE, "Nicolás").unwrap();
    assert_eq!(format!("{clave:?}"), "ClaveProyecto(…)");
}
