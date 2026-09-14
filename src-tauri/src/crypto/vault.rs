//! La clave del proyecto y las ranuras que la guardan.
//!
//! El `vault.json` vive en el directorio del proyecto **en claro**: contiene
//! sales, parámetros del derivador y la clave envuelta, y ninguna de esas cosas
//! es un secreto. Lo que no está ahí es la clave.

use std::path::Path;

use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

/// Nombre del archivo de cabecera dentro del directorio del proyecto.
pub const FILE_NAME: &str = "vault.json";

/// Versión del formato del vault.
pub const VERSION: u32 = 1;

/// Coste de Argon2id.
///
/// 64 MiB y tres pasadas es la recomendación de OWASP para Argon2id de un solo
/// hilo. En un portátil son unas décimas de segundo, que se pagan **una vez al
/// abrir el proyecto** y no por archivo: la clave de proyecto no se deriva de la
/// frase, sólo se desenvuelve con ella.
const MEMORIA_KIB: u32 = 64 * 1024;
const PASADAS: u32 = 3;
const PARALELISMO: u32 = 1;

const SAL_LEN: usize = 16;
const NONCE_LEN: usize = 24;
pub const CLAVE_LEN: usize = 32;

/// Prefijo del secreto compartido que se entrega a otro usuario del dataset.
const PREFIJO_COMPARTIDA: &str = "annotix-key-v1:";

/// La clave que cifra los datos. Se borra de la memoria al soltarla.
#[derive(Clone)]
pub struct ClaveProyecto(Zeroizing<[u8; CLAVE_LEN]>);

impl ClaveProyecto {
    /// Una clave nueva, aleatoria. No se deriva de nada: la frase sólo la
    /// envuelve, y por eso cambiarla no obliga a recifrar el corpus.
    pub fn nueva() -> Self {
        let mut bytes = [0u8; CLAVE_LEN];
        rand::thread_rng().fill_bytes(&mut bytes);
        ClaveProyecto(Zeroizing::new(bytes))
    }

    pub fn bytes(&self) -> &[u8; CLAVE_LEN] {
        &self.0
    }

    /// El secreto que se entrega a otra persona que trabaja el mismo dataset.
    ///
    /// Es **la clave entera**: quien la tiene puede leer el proyecto y montarse
    /// su propia frase. Es también la única copia de seguridad posible frente a
    /// una frase olvidada, y por eso existe: la alternativa —una puerta trasera
    /// para recuperar— valdría igual para quien copie el disco.
    pub fn exportar_compartida(&self) -> String {
        format!(
            "{PREFIJO_COMPARTIDA}{}",
            base64::engine::general_purpose::STANDARD.encode(self.0.as_ref())
        )
    }

    pub fn importar_compartida(texto: &str) -> Result<Self, String> {
        let cuerpo = texto
            .trim()
            .strip_prefix(PREFIJO_COMPARTIDA)
            .ok_or("Eso no es una clave de proyecto de Annotix")?;
        let mut bytes = base64::engine::general_purpose::STANDARD
            .decode(cuerpo.trim())
            .map_err(|_| "La clave está mal copiada".to_string())?;
        if bytes.len() != CLAVE_LEN {
            bytes.zeroize();
            return Err("La clave no tiene el tamaño que debería".into());
        }
        let mut clave = [0u8; CLAVE_LEN];
        clave.copy_from_slice(&bytes);
        bytes.zeroize();
        Ok(ClaveProyecto(Zeroizing::new(clave)))
    }
}

impl std::fmt::Debug for ClaveProyecto {
    /// Sin esto, un `{:?}` en un log escribiría la clave en el disco.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ClaveProyecto(…)")
    }
}

/// Una frase de paso que abre el proyecto. Como las ranuras de LUKS: varias
/// personas, varias frases, una sola clave debajo.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ranura {
    pub id: String,
    /// Para quién es. Texto libre; sirve para poder retirar la de alguien que
    /// deja el equipo sin tener que adivinar cuál era.
    pub label: String,
    /// Sal de Argon2id, base64.
    pub salt: String,
    /// `nonce || clave envuelta`, base64.
    pub wrapped: String,
    pub created_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    /// Memoria en KiB.
    pub m: u32,
    /// Pasadas.
    pub t: u32,
    /// Paralelismo.
    pub p: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        KdfParams {
            m: MEMORIA_KIB,
            t: PASADAS,
            p: PARALELISMO,
        }
    }
}

/// La cabecera del proyecto cifrado. Se guarda en claro y no contiene secretos.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
    pub version: u32,
    /// Algoritmo de los datos. Se declara para poder cambiarlo algún día sin
    /// dejar ilegibles los proyectos de hoy.
    pub alg: String,
    pub kdf: String,
    pub kdf_params: KdfParams,
    pub slots: Vec<Ranura>,
    /// Cómo se llama el proyecto **en la lista**, mientras está cerrado.
    ///
    /// Opcional y vacío por defecto. «Sarcoma paciente Pérez» es un nombre de
    /// proyecto perfectamente normal, y dejarlo legible en un portátil perdido
    /// sólo para que la lista se vea bonita sería tirar por tierra la mitad de
    /// esta etapa. Quien quiera reconocer el suyo de un vistazo pone aquí algo
    /// que no diga nada de más.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub public_label: Option<String>,
}

impl Vault {
    /// Crea el vault y la clave del proyecto, con una primera ranura.
    pub fn crear(frase: &str, etiqueta: &str) -> Result<(Vault, ClaveProyecto), String> {
        let clave = ClaveProyecto::nueva();
        let mut vault = Vault {
            version: VERSION,
            alg: "xchacha20poly1305".into(),
            kdf: "argon2id".into(),
            kdf_params: KdfParams::default(),
            slots: Vec::new(),
            public_label: None,
        };
        vault.anadir_ranura(&clave, frase, etiqueta)?;
        Ok((vault, clave))
    }

    /// Envuelve una clave de proyecto **ya existente** con una frase nueva.
    ///
    /// Es lo que usa quien recibe el dataset de otra persona: la misma clave
    /// debajo, su propia frase encima.
    pub fn para_clave(
        clave: &ClaveProyecto,
        frase: &str,
        etiqueta: &str,
    ) -> Result<Vault, String> {
        let mut vault = Vault {
            version: VERSION,
            alg: "xchacha20poly1305".into(),
            kdf: "argon2id".into(),
            kdf_params: KdfParams::default(),
            slots: Vec::new(),
            public_label: None,
        };
        vault.anadir_ranura(clave, frase, etiqueta)?;
        Ok(vault)
    }

    /// Abre el proyecto probando la frase contra cada ranura.
    ///
    /// El error no dice **qué** ranura falló ni si alguna existe para esa
    /// persona: una respuesta distinta por ranura convertiría el vault en un
    /// oráculo de quién tiene acceso.
    pub fn abrir(&self, frase: &str) -> Result<ClaveProyecto, String> {
        if self.version > VERSION {
            return Err(format!(
                "Este proyecto se cifró con una versión más nueva de Annotix (formato {})",
                self.version
            ));
        }
        for ranura in &self.slots {
            if let Ok(clave) = self.desenvolver(ranura, frase) {
                return Ok(clave);
            }
        }
        Err("La frase de paso no abre este proyecto".into())
    }

    pub fn anadir_ranura(
        &mut self,
        clave: &ClaveProyecto,
        frase: &str,
        etiqueta: &str,
    ) -> Result<String, String> {
        if frase.is_empty() {
            return Err("La frase de paso no puede estar vacía".into());
        }
        let mut sal = [0u8; SAL_LEN];
        rand::thread_rng().fill_bytes(&mut sal);
        let envoltura = self.derivar(frase, &sal)?;
        let cifrador = XChaCha20Poly1305::new(envoltura.as_ref().into());

        let mut nonce = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce);
        let envuelta = cifrador
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: clave.bytes(),
                    // La cabecera entra como datos asociados: cambiarle los
                    // parámetros del derivador a mano invalida la ranura en vez
                    // de rebajar el coste de atacarla.
                    aad: self.aad().as_bytes(),
                },
            )
            .map_err(|_| "No se pudo envolver la clave del proyecto".to_string())?;

        let mut payload = nonce.to_vec();
        payload.extend_from_slice(&envuelta);

        let id = uuid::Uuid::new_v4().to_string();
        self.slots.push(Ranura {
            id: id.clone(),
            label: etiqueta.to_string(),
            salt: base64::engine::general_purpose::STANDARD.encode(sal),
            wrapped: base64::engine::general_purpose::STANDARD.encode(&payload),
            created_at: ahora(),
        });
        Ok(id)
    }

    /// Retira una ranura. Nunca la última: un vault sin ranuras es un proyecto
    /// que nadie puede volver a abrir, y eso no puede ser el resultado de pulsar
    /// un botón de «quitar».
    pub fn quitar_ranura(&mut self, id: &str) -> Result<(), String> {
        if self.slots.len() <= 1 {
            return Err(
                "Es la única frase de paso que abre el proyecto: quitarla lo dejaría ilegible"
                    .into(),
            );
        }
        let antes = self.slots.len();
        self.slots.retain(|r| r.id != id);
        if self.slots.len() == antes {
            return Err("Esa frase de paso no existe en el proyecto".into());
        }
        Ok(())
    }

    /// Cambia la frase de una ranura sin tocar los datos: se reescribe la
    /// envoltura, no el corpus.
    pub fn cambiar_frase(&mut self, actual: &str, nueva: &str) -> Result<(), String> {
        let clave = self.abrir(actual)?;
        let etiqueta = self
            .slots
            .iter()
            .find(|r| self.desenvolver(r, actual).is_ok())
            .map(|r| r.label.clone())
            .unwrap_or_default();
        let id_vieja = self
            .slots
            .iter()
            .find(|r| self.desenvolver(r, actual).is_ok())
            .map(|r| r.id.clone());
        self.anadir_ranura(&clave, nueva, &etiqueta)?;
        if let Some(id) = id_vieja {
            self.slots.retain(|r| r.id != id);
        }
        Ok(())
    }

    fn desenvolver(&self, ranura: &Ranura, frase: &str) -> Result<ClaveProyecto, String> {
        let sal = base64::engine::general_purpose::STANDARD
            .decode(&ranura.salt)
            .map_err(|_| "Ranura ilegible".to_string())?;
        let payload = base64::engine::general_purpose::STANDARD
            .decode(&ranura.wrapped)
            .map_err(|_| "Ranura ilegible".to_string())?;
        if payload.len() <= NONCE_LEN {
            return Err("Ranura ilegible".into());
        }
        let envoltura = self.derivar(frase, &sal)?;
        let cifrador = XChaCha20Poly1305::new(envoltura.as_ref().into());
        let abierta = cifrador
            .decrypt(
                XNonce::from_slice(&payload[..NONCE_LEN]),
                Payload {
                    msg: &payload[NONCE_LEN..],
                    aad: self.aad().as_bytes(),
                },
            )
            .map_err(|_| "La frase de paso no abre este proyecto".to_string())?;
        if abierta.len() != CLAVE_LEN {
            return Err("Ranura ilegible".into());
        }
        let mut bytes = [0u8; CLAVE_LEN];
        bytes.copy_from_slice(&abierta);
        Ok(ClaveProyecto(Zeroizing::new(bytes)))
    }

    fn derivar(&self, frase: &str, sal: &[u8]) -> Result<Zeroizing<[u8; CLAVE_LEN]>, String> {
        let params = Params::new(
            self.kdf_params.m,
            self.kdf_params.t,
            self.kdf_params.p,
            Some(CLAVE_LEN),
        )
        .map_err(|e| format!("Parámetros de derivación inválidos: {e}"))?;
        let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let mut salida = Zeroizing::new([0u8; CLAVE_LEN]);
        argon
            .hash_password_into(frase.as_bytes(), sal, salida.as_mut())
            .map_err(|e| format!("No se pudo derivar la clave: {e}"))?;
        Ok(salida)
    }

    /// Datos asociados de la envoltura: atan la ranura a la cabecera que dice
    /// con qué coste se derivó.
    fn aad(&self) -> String {
        format!(
            "annotix-vault:{}:{}:{}:{}:{}",
            self.version, self.alg, self.kdf, self.kdf_params.m, self.kdf_params.t
        )
    }

    // ─── Persistencia ───────────────────────────────────────────────────────

    pub fn leer(dir: &Path) -> Result<Option<Vault>, String> {
        let ruta = dir.join(FILE_NAME);
        if !ruta.exists() {
            return Ok(None);
        }
        let texto = std::fs::read_to_string(&ruta)
            .map_err(|e| format!("Error leyendo {FILE_NAME}: {e}"))?;
        serde_json::from_str(&texto)
            .map(Some)
            .map_err(|e| format!("El {FILE_NAME} del proyecto está corrupto: {e}"))
    }

    /// Escribe con `.tmp` y renombrado: un corte de luz a mitad de un cambio de
    /// frase dejaría el proyecto sin cabecera, y sin cabecera no hay proyecto.
    pub fn escribir(&self, dir: &Path) -> Result<(), String> {
        let ruta = dir.join(FILE_NAME);
        let tmp = dir.join(format!("{FILE_NAME}.tmp"));
        let texto = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Error serializando {FILE_NAME}: {e}"))?;
        std::fs::write(&tmp, texto).map_err(|e| format!("Error escribiendo {FILE_NAME}: {e}"))?;
        std::fs::rename(&tmp, &ruta).map_err(|e| format!("Error guardando {FILE_NAME}: {e}"))
    }
}

fn ahora() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests;
