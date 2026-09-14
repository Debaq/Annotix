//! El formato de un archivo cifrado del proyecto.
//!
//! ## Por bloques, y no de una vez
//!
//! Un video de dos gigas no cabe en memoria dos veces, así que el contenido va
//! en bloques de 1 MiB, cada uno autenticado por separado. El último lleva una
//! marca: sin ella, **truncar el archivo sería indetectable** —cada bloque
//! seguiría validando— y el proyecto se abriría con medio video sin decir nada.
//!
//! ## Una clave por archivo
//!
//! La clave de proyecto no cifra nada directamente: de ella sale una clave por
//! archivo con HKDF, usando como `info` la **ruta relativa dentro del proyecto**
//! y como sal 16 bytes aleatorios que van en la cabecera. Eso da dos cosas: dos
//! archivos idénticos no producen el mismo cifrado —el tamaño ya delata
//! bastante, no hace falta regalar también la igualdad—, y un archivo movido de
//! sitio deja de descifrar, que es lo que impide cambiar la imagen de un sujeto
//! por la de otro dentro del mismo proyecto.
//!
//! ## Qué no esconde
//!
//! El tamaño de cada archivo y su nombre. Los nombres de archivo del proyecto
//! son UUID, así que no dicen nada del contenido; el tamaño sí es un canal
//! lateral y se declara en vez de fingir que no está.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;
use zeroize::Zeroizing;

use super::vault::{ClaveProyecto, CLAVE_LEN};

/// Marca de archivo cifrado de Annotix, versión 1.
pub const CABECERA: &[u8; 8] = b"ANXENC01";

const SAL_LEN: usize = 16;
const TAG_LEN: usize = 16;
const NONCE_LEN: usize = 24;
/// Texto plano por bloque. 1 MiB es el compromiso de siempre: bastante grande
/// para que el coste por bloque no se note, bastante pequeño para poder
/// descifrar en flujo sin reservar el archivo entero.
pub const BLOQUE: usize = 1024 * 1024;

/// `true` si los bytes empiezan por la marca de archivo cifrado.
///
/// Es lo que permite convivir con proyectos a medio cifrar y con los que no lo
/// están: la lectura mira la marca en vez de fiarse de una bandera guardada en
/// otro sitio, que es justo la que se queda desincronizada.
pub fn es_cifrado(bytes: &[u8]) -> bool {
    bytes.len() >= CABECERA.len() && &bytes[..CABECERA.len()] == CABECERA
}

fn clave_de_archivo(
    clave: &ClaveProyecto,
    ruta_rel: &str,
    sal: &[u8],
) -> Result<Zeroizing<[u8; CLAVE_LEN]>, String> {
    let hk = Hkdf::<Sha256>::new(Some(sal), clave.bytes());
    let mut salida = Zeroizing::new([0u8; CLAVE_LEN]);
    hk.expand(
        format!("annotix-file:{ruta_rel}").as_bytes(),
        salida.as_mut(),
    )
    .map_err(|_| "No se pudo derivar la clave del archivo".to_string())?;
    Ok(salida)
}

/// Nonce de un bloque: contador y marca de final.
///
/// El contador impide reordenar bloques y la marca impide truncar el archivo.
/// Se puede usar un nonce determinista porque la clave es única por archivo: la
/// sal aleatoria de la cabecera ya garantiza que el par (clave, nonce) no se
/// repite entre archivos.
fn nonce_de_bloque(indice: u32, ultimo: bool) -> [u8; NONCE_LEN] {
    let mut nonce = [0u8; NONCE_LEN];
    nonce[19..23].copy_from_slice(&indice.to_be_bytes());
    nonce[23] = u8::from(ultimo);
    nonce
}

/// Cifra el contenido de un archivo del proyecto.
pub fn cifrar(clave: &ClaveProyecto, ruta_rel: &str, plano: &[u8]) -> Result<Vec<u8>, String> {
    let mut sal = [0u8; SAL_LEN];
    rand::thread_rng().fill_bytes(&mut sal);
    let clave_archivo = clave_de_archivo(clave, ruta_rel, &sal)?;
    let cifrador = XChaCha20Poly1305::new(clave_archivo.as_ref().into());

    let mut salida = Vec::with_capacity(plano.len() + SAL_LEN + CABECERA.len() + TAG_LEN * 2);
    salida.extend_from_slice(CABECERA);
    salida.extend_from_slice(&sal);

    // Un archivo vacío también se cifra: si no, su tamaño cero lo delataría y
    // además no habría nada que autenticar.
    let total = plano.len().div_ceil(BLOQUE).max(1);
    for (i, trozo) in plano
        .chunks(BLOQUE)
        .chain(std::iter::once(&[][..]).filter(|_| plano.is_empty()))
        .enumerate()
    {
        let ultimo = i + 1 == total;
        let bloque = cifrador
            .encrypt(
                XNonce::from_slice(&nonce_de_bloque(i as u32, ultimo)),
                Payload {
                    msg: trozo,
                    aad: CABECERA,
                },
            )
            .map_err(|_| "No se pudo cifrar el archivo".to_string())?;
        salida.extend_from_slice(&bloque);
    }
    Ok(salida)
}

/// Descifra el contenido de un archivo del proyecto.
///
/// Falla —en vez de devolver lo que pueda— si el archivo se manipuló, se movió
/// de ruta, se truncó o la clave no es la suya. Un descifrado que degrada en
/// silencio entrega píxeles inventados como si fueran el corpus.
pub fn descifrar(clave: &ClaveProyecto, ruta_rel: &str, cifrado: &[u8]) -> Result<Vec<u8>, String> {
    if !es_cifrado(cifrado) {
        return Err("El archivo no está cifrado por Annotix".into());
    }
    let cuerpo = &cifrado[CABECERA.len()..];
    if cuerpo.len() < SAL_LEN {
        return Err("El archivo cifrado está truncado".into());
    }
    let (sal, mut resto) = cuerpo.split_at(SAL_LEN);
    let clave_archivo = clave_de_archivo(clave, ruta_rel, sal)?;
    let cifrador = XChaCha20Poly1305::new(clave_archivo.as_ref().into());

    let cifrado_bloque = BLOQUE + TAG_LEN;
    let mut salida = Vec::with_capacity(resto.len());
    let mut indice: u32 = 0;
    loop {
        if resto.is_empty() {
            return Err("El archivo cifrado está truncado: no tiene bloque final".into());
        }
        let corte = resto.len().min(cifrado_bloque);
        let (bloque, siguiente) = resto.split_at(corte);
        let ultimo = siguiente.is_empty();
        let abierto = cifrador
            .decrypt(
                XNonce::from_slice(&nonce_de_bloque(indice, ultimo)),
                Payload {
                    msg: bloque,
                    aad: CABECERA,
                },
            )
            .map_err(|_| {
                "No se pudo descifrar el archivo: frase equivocada, archivo movido o manipulado"
                    .to_string()
            })?;
        salida.extend_from_slice(&abierto);
        if ultimo {
            return Ok(salida);
        }
        resto = siguiente;
        indice = indice
            .checked_add(1)
            .ok_or("El archivo cifrado tiene demasiados bloques")?;
    }
}

#[cfg(test)]
mod tests;
