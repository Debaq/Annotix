//! Ingesta de imagen médica: DICOM y NIfTI.
//!
//! Entrega de la etapa 9a del plan biomédico. Desbloquea CT, MRI y rayos X, que
//! hasta ahora sólo entraban si alguien los había exportado antes a PNG — y al
//! exportarlos perdía el rango dinámico, el espaciado de píxel y los parámetros
//! de adquisición, que son justo lo que permite decir para qué equipos vale un
//! modelo.
//!
//! Tres piezas:
//!
//! - [`deident`]: qué se quita al importar, y el informe de lo que se quitó. Es
//!   lo que decide si esto se le puede acercar a un corpus clínico.
//! - [`windowing`]: qué tramo del rango se reparte los 256 grises. Sin ventaneo,
//!   un CT es una imagen gris uniforme donde no se ve nada.
//! - [`dicom`] y [`nifti`]: la lectura de cada formato.

pub mod deident;
pub mod dicom;
pub mod import;
pub mod nifti;
pub mod windowing;

#[cfg(test)]
mod tests;
