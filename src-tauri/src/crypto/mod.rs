//! Cifrado en reposo del proyecto (etapa 12).
//!
//! ## Qué promete y qué no
//!
//! Lo que da: **los archivos del proyecto en disco no se leen sin la frase de
//! paso**. Ni el `project.json`, ni las imágenes, ni el registro de auditoría.
//!
//! Lo que **no** da, y hay que decirlo donde se activa: cifrar en reposo no es
//! cumplimiento normativo. HIPAA o el RGPD piden además control de acceso,
//! contratos de encargo de tratamiento, retención y notificación de brechas —
//! cosas que una aplicación de escritorio no puede garantizar por su cuenta.
//! Tampoco protege mientras el proyecto está abierto: ahí la clave está en
//! memoria, que es la única forma de que el canvas pinte algo.
//!
//! ## Dos claves, y por qué
//!
//! - La **clave de proyecto** son 32 bytes aleatorios y es la que cifra los
//!   datos. No se deriva de la frase.
//! - La frase de paso sólo deriva una **clave de envoltura** (Argon2id) con la
//!   que se guarda la clave de proyecto en una ranura del [`Vault`].
//!
//! Esa indirección es la que hace posibles las dos cosas que se pidieron:
//! **cambiar la frase sin volver a cifrar el corpus** (se reescribe la ranura,
//! no los datos), y **compartir el dataset entre varias personas** —cada una con
//! su propia frase sobre la misma clave de proyecto, como las ranuras de LUKS—.
//!
//! ## Punto de no retorno
//!
//! Una frase perdida es un proyecto perdido: no hay recuperación, no hay puerta
//! trasera y no puede haberla, porque una que existiera valdría también para
//! quien copie el disco. Por eso la clave se puede **exportar** como secreto
//! compartido: es la copia de seguridad, y es responsabilidad de quien la
//! guarda.

// El núcleo se construye antes que sus usuarios: hasta que el almacén y los
// comandos lo consuman, nada de esto tiene quien lo llame fuera de sus tests.
// El permiso se retira en ese paso, no antes: sin él, el aviso útil —una
// función que quedó huérfana— se pierde entre quince que sólo dicen «aún no».
#![allow(dead_code, unused_imports)]

pub mod archivo;
pub mod sesion;
pub mod vault;

pub use archivo::{cifrar, descifrar, es_cifrado, CABECERA};
pub use vault::{ClaveProyecto, Vault};
