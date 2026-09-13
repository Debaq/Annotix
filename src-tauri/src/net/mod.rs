//! Punto único de salida HTTP de la aplicación (sección 3.7 del modo estudio).
//!
//! Ningún módulo construye ya un `reqwest::Client` por su cuenta: todos pasan
//! por [`blocking`] o [`client`], que exigen declarar un [`Purpose`]. Eso es lo
//! que permite registrar `net.request` con dominio y propósito para *todo* el
//! tráfico, y que una prueba pueda comprobar que no queda ningún cliente sin
//! clasificar.
//!
//! Del registro sale solo el dominio: nunca la ruta, los parámetros ni el
//! cuerpo. `bytes_in` es el `Content-Length` declarado por el servidor cuando
//! existe (0 si la respuesta llega en trozos sin declararlo).

// El shim replica la superficie del builder de reqwest aunque hoy no se use
// entera: así migrar una llamada nueva no obliga a tocar este módulo.
#![allow(dead_code)]

use serde_json::json;

use crate::study::{emit_quiet, events};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Purpose {
    /// Consulta de nuevas versiones de Annotix.
    UpdateCheck,
    /// Descarga de pesos, modelos o entornos de ejecución.
    ModelWeights,
    /// Entrenamiento en un proveedor de nube.
    RemoteTraining,
    /// Colaboración entre pares.
    CollabP2p,
    /// Consulta a un modelo de lenguaje remoto (generación de frases para
    /// grabación guiada, automatización del navegador). No está en la lista
    /// original de la sección 3.7: se agregó porque la app tiene este tráfico
    /// y clasificarlo como `other` haría fallar la auditoría, que es justo lo
    /// que la sección pide evitar.
    RemoteLlm,
    /// Sin clasificar. No debe usarse: existe para que la prueba falle.
    Other,
}

impl Purpose {
    pub fn as_str(self) -> &'static str {
        match self {
            Purpose::UpdateCheck => "update_check",
            Purpose::ModelWeights => "model_weights",
            Purpose::RemoteTraining => "remote_training",
            Purpose::CollabP2p => "collab_p2p",
            Purpose::RemoteLlm => "remote_llm",
            Purpose::Other => "other",
        }
    }
}

/// Dominio de una URL, sin esquema, puerto, ruta ni parámetros.
pub fn host_of(url: &str) -> String {
    let sin_esquema = url
        .split_once("://")
        .map(|(_, r)| r)
        .unwrap_or(url);
    let autoridad = sin_esquema
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    let sin_credenciales = autoridad.rsplit('@').next().unwrap_or(autoridad);
    sin_credenciales
        .split(':')
        .next()
        .unwrap_or(sin_credenciales)
        .to_ascii_lowercase()
}

/// Registra una petición ya realizada. Público para el tráfico que no es HTTP
/// (la capa P2P) y para los tests.
pub fn record(purpose: Purpose, host: &str, bytes_out: u64, bytes_in: u64, ok: bool) {
    emit_quiet(
        events::NET_REQUEST,
        json!({
            "host": host,
            "purpose": purpose.as_str(),
            "bytes_out": bytes_out,
            "bytes_in": bytes_in,
            "ok": ok,
        }),
    );
}

// ─── Cliente bloqueante ─────────────────────────────────────────────────────

#[derive(Clone)]
pub struct BlockingClient {
    inner: reqwest::blocking::Client,
    purpose: Purpose,
}

/// Cliente bloqueante con propósito declarado.
pub fn blocking(purpose: Purpose) -> BlockingClient {
    BlockingClient {
        inner: reqwest::blocking::Client::new(),
        purpose,
    }
}

/// Igual que [`blocking`], pero partiendo de un cliente ya configurado.
pub fn blocking_from(inner: reqwest::blocking::Client, purpose: Purpose) -> BlockingClient {
    BlockingClient { inner, purpose }
}

macro_rules! blocking_verb {
    ($($name:ident),+) => {
        $(pub fn $name(&self, url: impl reqwest::IntoUrl + ToString) -> BlockingRequest {
            let shown = url.to_string();
            BlockingRequest {
                inner: self.inner.$name(url),
                purpose: self.purpose,
                host: host_of(&shown),
                bytes_out: 0,
            }
        })+
    };
}

impl BlockingClient {
    blocking_verb!(get, post, put, delete);
}

pub struct BlockingRequest {
    inner: reqwest::blocking::RequestBuilder,
    purpose: Purpose,
    host: String,
    bytes_out: u64,
}

impl BlockingRequest {
    pub fn header(mut self, key: impl AsRef<str>, value: impl AsRef<str>) -> Self {
        self.inner = self.inner.header(key.as_ref(), value.as_ref());
        self
    }

    pub fn headers(mut self, headers: reqwest::header::HeaderMap) -> Self {
        self.inner = self.inner.headers(headers);
        self
    }

    pub fn bearer_auth<T: std::fmt::Display>(mut self, token: T) -> Self {
        self.inner = self.inner.bearer_auth(token);
        self
    }

    pub fn basic_auth<U, P>(mut self, user: U, pass: Option<P>) -> Self
    where
        U: std::fmt::Display,
        P: std::fmt::Display,
    {
        self.inner = self.inner.basic_auth(user, pass);
        self
    }

    pub fn json<T: serde::Serialize + ?Sized>(mut self, value: &T) -> Self {
        self.bytes_out = serde_json::to_vec(value).map(|v| v.len() as u64).unwrap_or(0);
        self.inner = self.inner.json(value);
        self
    }

    /// `bytes_out` no se puede medir aquí sin consumir el cuerpo, así que
    /// queda en 0 salvo que la petición use `json`.
    pub fn body<T: Into<reqwest::blocking::Body>>(mut self, body: T) -> Self {
        self.inner = self.inner.body(body);
        self
    }

    pub fn query<T: serde::Serialize + ?Sized>(mut self, query: &T) -> Self {
        self.inner = self.inner.query(query);
        self
    }

    pub fn form<T: serde::Serialize + ?Sized>(mut self, form: &T) -> Self {
        self.inner = self.inner.form(form);
        self
    }

    pub fn multipart(mut self, form: reqwest::blocking::multipart::Form) -> Self {
        self.inner = self.inner.multipart(form);
        self
    }

    pub fn timeout(mut self, timeout: std::time::Duration) -> Self {
        self.inner = self.inner.timeout(timeout);
        self
    }

    pub fn send(self) -> reqwest::Result<reqwest::blocking::Response> {
        let res = self.inner.send();
        let (ok, bytes_in) = match res.as_ref() {
            Ok(r) => (r.status().is_success(), r.content_length().unwrap_or(0)),
            Err(_) => (false, 0),
        };
        record(self.purpose, &self.host, self.bytes_out, bytes_in, ok);
        res
    }
}

// ─── Cliente asíncrono ──────────────────────────────────────────────────────

#[derive(Clone)]
pub struct Client {
    inner: reqwest::Client,
    purpose: Purpose,
}

pub fn client(purpose: Purpose) -> Client {
    Client {
        inner: reqwest::Client::new(),
        purpose,
    }
}

pub fn from_client(inner: reqwest::Client, purpose: Purpose) -> Client {
    Client { inner, purpose }
}

/// Cliente asíncrono con un `User-Agent` propio. Existe aquí para que ningún
/// módulo necesite el builder de reqwest por su cuenta.
pub fn client_with_user_agent(purpose: Purpose, user_agent: &str) -> Result<Client, String> {
    let inner = reqwest::Client::builder()
        .user_agent(user_agent)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(Client { inner, purpose })
}

macro_rules! async_verb {
    ($($name:ident),+) => {
        $(pub fn $name(&self, url: impl reqwest::IntoUrl + ToString) -> Request {
            let shown = url.to_string();
            Request {
                inner: self.inner.$name(url),
                purpose: self.purpose,
                host: host_of(&shown),
                bytes_out: 0,
            }
        })+
    };
}

impl Client {
    async_verb!(get, post);
}

pub struct Request {
    inner: reqwest::RequestBuilder,
    purpose: Purpose,
    host: String,
    bytes_out: u64,
}

impl Request {
    pub fn header(mut self, key: impl AsRef<str>, value: impl AsRef<str>) -> Self {
        self.inner = self.inner.header(key.as_ref(), value.as_ref());
        self
    }

    pub fn headers(mut self, headers: reqwest::header::HeaderMap) -> Self {
        self.inner = self.inner.headers(headers);
        self
    }

    pub fn bearer_auth<T: std::fmt::Display>(mut self, token: T) -> Self {
        self.inner = self.inner.bearer_auth(token);
        self
    }

    pub fn json<T: serde::Serialize + ?Sized>(mut self, value: &T) -> Self {
        self.bytes_out = serde_json::to_vec(value).map(|v| v.len() as u64).unwrap_or(0);
        self.inner = self.inner.json(value);
        self
    }

    pub fn body<T: Into<reqwest::Body>>(mut self, body: T) -> Self {
        self.inner = self.inner.body(body);
        self
    }

    pub fn query<T: serde::Serialize + ?Sized>(mut self, query: &T) -> Self {
        self.inner = self.inner.query(query);
        self
    }

    pub fn form<T: serde::Serialize + ?Sized>(mut self, form: &T) -> Self {
        self.inner = self.inner.form(form);
        self
    }

    pub fn multipart(mut self, form: reqwest::multipart::Form) -> Self {
        self.inner = self.inner.multipart(form);
        self
    }

    pub fn timeout(mut self, timeout: std::time::Duration) -> Self {
        self.inner = self.inner.timeout(timeout);
        self
    }

    pub async fn send(self) -> reqwest::Result<reqwest::Response> {
        let res = self.inner.send().await;
        let (ok, bytes_in) = match res.as_ref() {
            Ok(r) => (r.status().is_success(), r.content_length().unwrap_or(0)),
            Err(_) => (false, 0),
        };
        record(self.purpose, &self.host, self.bytes_out, bytes_in, ok);
        res
    }
}

#[cfg(test)]
mod tests;
