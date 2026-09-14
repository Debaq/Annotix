//! Registro de auditoría por proyecto.
//!
//! Un `audit.jsonl` dentro del directorio del proyecto con cada cambio que afecta
//! al ground truth: etiquetas creadas, editadas y borradas, predicciones
//! aceptadas o rechazadas, tracks consolidados, clases redefinidas, sujetos
//! asignados, política de partición declarada, importaciones, entrenamientos y
//! exportaciones.
//!
//! Responde una pregunta que hasta ahora no tenía respuesta: **quién cambió qué,
//! cuándo, y en qué estado estaban los datos con los que se entrenó un modelo**.
//! El contrato de modelo (etapa 8) transcribe el tramo correspondiente y su hash.
//!
//! ## Qué guarda, y por qué eso importa
//!
//! Guarda **identificadores en claro** —de proyecto, imagen, anotación, clase,
//! video, modelo— y el nombre de quien hizo el cambio. Es lo contrario del modo
//! estudio (`study/`), que es anónimo por diseño y rechaza rutas y texto largo.
//! Comparten la mecánica de la cadena ([`crate::hashchain`]) y nada más; se
//! mantienen separados para que ninguna instrumentación futura confunda una
//! política con la otra.
//!
//! No guarda el contenido de las etiquetas: ni geometrías ni máscaras. Registrar
//! que la anotación `a1` de la imagen `img7` cambió de clase responde la pregunta;
//! copiar su máscara en base64 haría del registro otra copia del proyecto.

pub mod events;
pub mod log;
pub mod verify;

#[cfg(test)]
mod tests;

pub use log::{record_quiet, set_actor};
pub use verify::{verify_project, AuditReport};
