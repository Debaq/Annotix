use super::*;

const FRASE: &str = "una frase de paso suficientemente larga";

#[test]
fn un_proyecto_sin_vault_no_esta_cifrado() {
    let tmp = tempfile::tempdir().unwrap();
    assert!(!hay_vault(tmp.path()));
    assert!(!esta_bloqueado(tmp.path()));
    assert!(clave(tmp.path()).is_none());
}

#[test]
fn abrir_con_la_frase_deja_el_proyecto_desbloqueado() {
    let tmp = tempfile::tempdir().unwrap();
    let (vault, original) = Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();

    assert!(esta_bloqueado(tmp.path()));
    assert!(abrir_con_frase(tmp.path(), "otra cosa").is_err());
    assert!(esta_bloqueado(tmp.path()), "una frase mala no abre nada");

    let abierta = abrir_con_frase(tmp.path(), FRASE).unwrap();
    assert_eq!(abierta.bytes(), original.bytes());
    assert!(esta_desbloqueado(tmp.path()));
    assert!(!esta_bloqueado(tmp.path()));

    bloquear(tmp.path());
    assert!(esta_bloqueado(tmp.path()));
}

#[test]
fn cada_proyecto_lleva_su_clave() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    Vault::crear(FRASE, "a").unwrap().0.escribir(a.path()).unwrap();
    Vault::crear(FRASE, "b").unwrap().0.escribir(b.path()).unwrap();

    let ka = abrir_con_frase(a.path(), FRASE).unwrap();
    let kb = abrir_con_frase(b.path(), FRASE).unwrap();
    assert_ne!(ka.bytes(), kb.bytes());

    bloquear(a.path());
    assert!(esta_bloqueado(a.path()));
    assert!(esta_desbloqueado(b.path()), "cerrar uno no cierra el otro");
    bloquear(b.path());
}
