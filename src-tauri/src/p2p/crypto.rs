//! Cifrado en reposo para secretos P2P (host_secret).
//!
//! El host_secret se guardaba en texto plano en project.json, que puede ser
//! copiado/sincronizado a la nube junto con la carpeta del proyecto. Aquí lo
//! ciframos con ChaCha20-Poly1305 usando una clave local guardada en el
//! directorio de datos de la app (fuera de la carpeta del proyecto), de modo
//! que copiar la carpeta del proyecto no filtra el secreto.

use std::path::{Path, PathBuf};

use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use rand::RngCore;

use base64::Engine;

/// Marcador que distingue un valor cifrado de uno legacy en texto plano.
const ENC_PREFIX: &str = "enc:";
const NONCE_LEN: usize = 12;

fn key_path(data_dir: &Path) -> PathBuf {
    data_dir.join("secret.key")
}

/// Carga la clave local de 32 bytes, creándola si no existe.
fn load_or_create_key(data_dir: &Path) -> Result<[u8; 32], String> {
    let path = key_path(data_dir);
    if let Ok(bytes) = std::fs::read(&path) {
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
        // Archivo corrupto: se regenera (los secretos viejos quedarán ilegibles,
        // pero se re-derivan al recrear la sesión).
        log::warn!("Clave P2P corrupta ({} bytes), regenerando", bytes.len());
    }

    let _ = std::fs::create_dir_all(data_dir);
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    std::fs::write(&path, key)
        .map_err(|e| format!("Error escribiendo clave P2P: {}", e))?;
    set_owner_only(&path);
    Ok(key)
}

#[cfg(unix)]
fn set_owner_only(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_owner_only(_path: &Path) {}

/// Cifra `plaintext` y devuelve "enc:<base64(nonce||ciphertext)>".
/// Si algo falla, devuelve el texto plano (mejor degradar que perder el secreto).
pub fn encrypt(data_dir: &Path, plaintext: &str) -> String {
    let key = match load_or_create_key(data_dir) {
        Ok(k) => k,
        Err(e) => {
            log::warn!("No se pudo cargar clave P2P, guardando secreto sin cifrar: {}", e);
            return plaintext.to_string();
        }
    };
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    match cipher.encrypt(nonce, plaintext.as_bytes()) {
        Ok(ciphertext) => {
            let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
            blob.extend_from_slice(&nonce_bytes);
            blob.extend_from_slice(&ciphertext);
            format!("{}{}", ENC_PREFIX, base64::engine::general_purpose::STANDARD.encode(&blob))
        }
        Err(e) => {
            log::warn!("Error cifrando secreto P2P, guardando sin cifrar: {}", e);
            plaintext.to_string()
        }
    }
}

/// Descifra un valor producido por [`encrypt`]. Si no tiene el prefijo `enc:`,
/// se asume legacy en texto plano y se devuelve tal cual (migración suave).
pub fn decrypt(data_dir: &Path, stored: &str) -> String {
    let b64 = match stored.strip_prefix(ENC_PREFIX) {
        Some(rest) => rest,
        None => return stored.to_string(), // legacy plaintext
    };

    let key = match load_or_create_key(data_dir) {
        Ok(k) => k,
        Err(e) => {
            log::warn!("No se pudo cargar clave P2P para descifrar: {}", e);
            return stored.to_string();
        }
    };
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));

    let blob = match base64::engine::general_purpose::STANDARD.decode(b64) {
        Ok(b) if b.len() > NONCE_LEN => b,
        _ => {
            log::warn!("Secreto P2P cifrado con formato inválido");
            return stored.to_string();
        }
    };
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    match cipher.decrypt(nonce, ciphertext) {
        Ok(plain) => String::from_utf8_lossy(&plain).to_string(),
        Err(e) => {
            log::warn!("Error descifrando secreto P2P: {}", e);
            stored.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let dir = std::env::temp_dir().join(format!("annotix_crypto_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let secret = "deadbeef00112233445566778899aabbccddeeff";
        let enc = encrypt(&dir, secret);
        assert!(enc.starts_with(ENC_PREFIX), "debe llevar prefijo enc:");
        assert_ne!(enc, secret, "no debe ser texto plano");
        assert_eq!(decrypt(&dir, &enc), secret, "roundtrip");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn decrypt_passes_through_legacy_plaintext() {
        let dir = std::env::temp_dir().join(format!("annotix_crypto_legacy_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let legacy = "plain_secret_sin_prefijo";
        assert_eq!(decrypt(&dir, legacy), legacy);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
