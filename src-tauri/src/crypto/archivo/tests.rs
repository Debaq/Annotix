//! Un descifrado que degrada en silencio entrega píxeles inventados como si
//! fueran el corpus. Todo lo que se prueba aquí es que falle cuando tiene que
//! fallar.

use super::*;
use crate::crypto::vault::Vault;

fn clave() -> ClaveProyecto {
    Vault::crear("una frase de paso larga y tonta", "test").unwrap().1
}

#[test]
fn un_archivo_va_y_vuelve() {
    let k = clave();
    let plano = b"project.json con cosas dentro".to_vec();
    let cifrado = cifrar(&k, "project.json", &plano).unwrap();
    assert!(es_cifrado(&cifrado));
    assert!(!es_cifrado(&plano));
    assert_eq!(descifrar(&k, "project.json", &cifrado).unwrap(), plano);
}

#[test]
fn el_cifrado_no_deja_ver_el_contenido() {
    let k = clave();
    let plano = b"PatientName=Juan Perez".to_vec();
    let cifrado = cifrar(&k, "images/a.png", &plano).unwrap();
    assert!(
        !cifrado.windows(4).any(|w| w == b"Juan"),
        "el texto plano asoma en el archivo cifrado"
    );
}

#[test]
fn dos_archivos_iguales_no_dan_el_mismo_cifrado() {
    // El tamaño ya delata bastante; no hace falta regalar también la igualdad.
    let k = clave();
    let plano = vec![7u8; 2048];
    let a = cifrar(&k, "images/a.png", &plano).unwrap();
    let b = cifrar(&k, "images/b.png", &plano).unwrap();
    assert_ne!(a, b);
    // Y el mismo archivo cifrado dos veces tampoco, porque la sal es aleatoria.
    let a2 = cifrar(&k, "images/a.png", &plano).unwrap();
    assert_ne!(a, a2);
}

#[test]
fn un_archivo_movido_de_sitio_deja_de_descifrar() {
    // Es lo que impide cambiar la imagen de un sujeto por la de otro dentro del
    // mismo proyecto sin que nada lo note.
    let k = clave();
    let cifrado = cifrar(&k, "images/a.png", b"radiografia de A").unwrap();
    assert!(descifrar(&k, "images/b.png", &cifrado).is_err());
    assert!(descifrar(&k, "images/a.png", &cifrado).is_ok());
}

#[test]
fn otra_clave_no_abre() {
    let cifrado = cifrar(&clave(), "project.json", b"datos").unwrap();
    assert!(descifrar(&clave(), "project.json", &cifrado).is_err());
}

#[test]
fn un_byte_cambiado_se_detecta() {
    let k = clave();
    let mut cifrado = cifrar(&k, "project.json", b"datos importantes").unwrap();
    let ultimo = cifrado.len() - 1;
    cifrado[ultimo] ^= 0x01;
    assert!(descifrar(&k, "project.json", &cifrado).is_err());
}

#[test]
fn truncar_el_archivo_se_detecta() {
    // Sin marca de bloque final, cada bloque seguiría validando por su cuenta y
    // el proyecto se abriría con medio video sin decir nada.
    let k = clave();
    let plano = vec![3u8; BLOQUE * 2 + 10];
    let cifrado = cifrar(&k, "videos/v.mp4", &plano).unwrap();
    let cortado = &cifrado[..cifrado.len() - (BLOQUE / 2)];
    assert!(descifrar(&k, "videos/v.mp4", cortado).is_err());
    // Quitarle el último bloque entero tampoco cuela.
    let sin_ultimo = &cifrado[..CABECERA.len() + 16 + (BLOQUE + 16) * 2];
    assert!(descifrar(&k, "videos/v.mp4", sin_ultimo).is_err());
}

#[test]
fn varios_bloques_van_y_vuelven_en_orden() {
    let k = clave();
    // Tres bloques y pico: los índices tienen que respetarse.
    let plano: Vec<u8> = (0..(BLOQUE * 3 + 12345)).map(|i| (i % 251) as u8).collect();
    let cifrado = cifrar(&k, "videos/v.mp4", &plano).unwrap();
    assert_eq!(descifrar(&k, "videos/v.mp4", &cifrado).unwrap(), plano);
}

#[test]
fn intercambiar_dos_bloques_se_detecta() {
    let k = clave();
    let plano = vec![9u8; BLOQUE * 2];
    let mut cifrado = cifrar(&k, "videos/v.mp4", &plano).unwrap();
    let inicio = CABECERA.len() + 16;
    let tam = BLOQUE + 16;
    let (a, b) = (inicio, inicio + tam);
    let primero: Vec<u8> = cifrado[a..a + tam].to_vec();
    let segundo: Vec<u8> = cifrado[b..b + tam].to_vec();
    cifrado[a..a + tam].copy_from_slice(&segundo);
    cifrado[b..b + tam].copy_from_slice(&primero);
    assert!(descifrar(&k, "videos/v.mp4", &cifrado).is_err());
}

#[test]
fn un_archivo_vacio_tambien_se_cifra() {
    let k = clave();
    let cifrado = cifrar(&k, "vacio.txt", b"").unwrap();
    assert!(es_cifrado(&cifrado));
    assert_eq!(descifrar(&k, "vacio.txt", &cifrado).unwrap(), Vec::<u8>::new());
}

#[test]
fn un_archivo_en_claro_se_reconoce_como_tal() {
    // Es lo que permite convivir con proyectos a medio cifrar: la lectura mira
    // la marca en vez de fiarse de una bandera guardada en otro sitio.
    let k = clave();
    assert!(!es_cifrado(b"{\"version\": 11}"));
    assert!(descifrar(&k, "project.json", b"{\"version\": 11}").is_err());
    assert!(!es_cifrado(b""));
}
