//! Modo estudio: registro local de eventos de uso para un estudio experimental.
//!
//! Ver `docs/study-mode.md`. Garantías del subsistema:
//! - Con el modo desactivado no se abre ni se escribe ningún archivo.
//! - No se registra contenido: ni rutas, ni nombres de archivo, ni texto del
//!   usuario, ni capturas.
//! - Ningún punto de instrumentación altera el comportamiento de la app: los
//!   errores del registro se anotan en el log y se descartan.

pub mod events;
pub mod export;
pub mod hardware;
pub mod log;
pub mod verify;

#[cfg(test)]
mod tests;

pub use log::{emit_quiet, is_active};
