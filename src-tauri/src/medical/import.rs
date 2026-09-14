//! Importación de archivos médicos a un proyecto.
//!
//! Cada archivo produce una o varias imágenes anotables —una por DICOM, una por
//! corte con señal en NIfTI— más tres cosas que un PNG exportado a mano no
//! llevaría: los metadatos de adquisición, el sujeto seudonimizado, y una copia
//! de 16 bits que permite volver a ventanear.
//!
//! El original no se guarda. Lleva dentro los identificadores que se acaban de
//! quitar.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::deident::DeidentReport;
use super::nifti::Eje;
use super::windowing::{self, Window};
use crate::store::project_file::{ImageEntry, MedicalInfo};
use crate::store::safe_path::sanitize_filename;
use crate::store::state::AppState;

/// Qué pasó al importar un lote.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalImportReport {
    pub files_read: usize,
    pub images_created: usize,
    /// Cortes descartados por no tener señal: aire al principio y al final del
    /// volumen. Se dice cuántos para que nadie crea que se perdieron datos.
    pub slices_skipped: usize,
    /// Sujetos distintos encontrados, ya seudonimizados.
    pub subjects: Vec<String>,
    /// Qué identificadores se quitaron, agregados sobre todo el lote.
    pub removed_tags: Vec<String>,
    /// Qué metadatos de adquisición se conservaron. «Qué se quitó» sólo es media
    /// respuesta.
    pub kept_tags: Vec<String>,
    /// Cuasi-identificadores conservados con reducción (edad en años, sexo).
    pub reduced_tags: Vec<String>,
    pub private_tags_removed: usize,
    /// Lo que esta deidentificación **no** cubre.
    pub warnings: Vec<String>,
    /// Archivos que no se pudieron leer, con el motivo.
    pub failed: Vec<(String, String)>,
}

/// Guarda la copia de 16 bits con la que se puede volver a ventanear.
///
/// Un PNG de 16 bits no admite negativos y un CT los tiene (−1024 HU es aire), así
/// que se guarda desplazado: `físico = guardado · slope + intercept`. Es la misma
/// idea del reescalado de DICOM, al revés.
fn guardar_crudo(
    dir: &Path,
    nombre: &str,
    valores: &[f64],
    ancho: u32,
    alto: u32,
) -> Result<(String, f64, f64), String> {
    let (min, max) = valores
        .iter()
        .fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(*v), hi.max(*v)));
    let rango = (max - min).max(1e-9);
    let slope = rango / 65535.0;

    let datos: Vec<u16> = valores
        .iter()
        .map(|v| (((v - min) / slope).round()).clamp(0.0, 65535.0) as u16)
        .collect();

    let img = image::ImageBuffer::<image::Luma<u16>, Vec<u16>>::from_raw(ancho, alto, datos)
        .ok_or("Las dimensiones no cuadran con los píxeles")?;

    std::fs::create_dir_all(dir)
        .map_err(|e| format!("No se pudo crear el directorio medical/: {}", e))?;
    let ruta = dir.join(nombre);
    image::DynamicImage::ImageLuma16(img)
        .save_with_format(&ruta, image::ImageFormat::Png)
        .map_err(|e| format!("Error escribiendo la copia de 16 bits: {}", e))?;

    Ok((nombre.to_string(), slope, min))
}

/// Acceso a `guardar_crudo` para las pruebas: el ida y vuelta de 16 bits es lo
/// que sostiene el reventaneo, y hay que poder comprobarlo sin montar un proyecto.
#[cfg(test)]
pub fn guardar_crudo_para_test(
    dir: &Path,
    nombre: &str,
    valores: &[f64],
    ancho: u32,
    alto: u32,
) -> Result<(String, f64, f64), String> {
    guardar_crudo(dir, nombre, valores, ancho, alto)
}

/// Lee la copia de 16 bits y devuelve los valores físicos.
pub fn leer_crudo(ruta: &Path, slope: f64, intercept: f64) -> Result<(Vec<f64>, u32, u32), String> {
    let img = image::open(ruta)
        .map_err(|e| format!("No se pudo leer la copia de 16 bits: {}", e))?
        .into_luma16();
    let (w, h) = (img.width(), img.height());
    let valores = img
        .pixels()
        .map(|p| super::windowing::reescalar(p.0[0] as f64, slope, intercept))
        .collect();
    Ok((valores, w, h))
}

impl AppState {
    /// Directorio donde viven las copias de 16 bits de un proyecto.
    pub fn project_medical_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        let dir = self.project_dir(project_id)?.join("medical");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Error creando directorio medical: {}", e))?;
        Ok(dir)
    }

    /// Importa archivos DICOM y NIfTI.
    ///
    /// `eje` y `umbral_senal` sólo afectan a los NIfTI: por qué eje cortar el
    /// volumen y cuánta señal tiene que tener un corte para entrar.
    pub fn import_medical_files(
        &self,
        project_id: &str,
        rutas: &[String],
        eje: Eje,
        umbral_senal: f64,
    ) -> Result<MedicalImportReport, String> {
        let images_dir = self.project_images_dir(project_id)?;
        let medical_dir = self.project_medical_dir(project_id)?;
        let now = crate::store::images::js_timestamp_pub();

        let mut informe = MedicalImportReport::default();
        let mut sujetos: std::collections::BTreeSet<String> = Default::default();
        let mut etiquetas: std::collections::BTreeSet<String> = Default::default();
        let mut conservadas: std::collections::BTreeSet<String> = Default::default();
        let mut reducidas: std::collections::BTreeSet<String> = Default::default();
        let mut entradas: Vec<ImageEntry> = Vec::new();

        for ruta_txt in rutas {
            let ruta = Path::new(ruta_txt);
            let nombre_archivo = ruta
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "archivo".to_string());

            let resultado = if super::dicom::es_dicom(ruta) {
                self.importar_dicom(
                    project_id,
                    ruta,
                    &nombre_archivo,
                    &images_dir,
                    &medical_dir,
                    now,
                )
                .map(|(e, d)| (vec![e], Some(d), 0))
            } else {
                self.importar_nifti(
                    ruta,
                    &nombre_archivo,
                    &images_dir,
                    &medical_dir,
                    eje,
                    umbral_senal,
                    now,
                )
                .map(|(e, saltados)| (e, None, saltados))
            };

            match resultado {
                Ok((nuevas, deident, saltados)) => {
                    informe.files_read += 1;
                    informe.slices_skipped += saltados;
                    if let Some(d) = deident {
                        etiquetas.extend(d.removed.iter().cloned());
                        conservadas.extend(d.kept.iter().cloned());
                        reducidas.extend(d.reduced.iter().cloned());
                        informe.private_tags_removed += d.private_removed;
                        if informe.warnings.is_empty() {
                            informe.warnings = d.warnings.clone();
                        }
                        if let Some(s) = d.subject_pseudonym {
                            sujetos.insert(s);
                        }
                    }
                    entradas.extend(nuevas);
                }
                Err(e) => informe.failed.push((nombre_archivo, e)),
            }
        }

        informe.images_created = entradas.len();
        informe.subjects = sujetos.into_iter().collect();
        informe.removed_tags = etiquetas.into_iter().collect();
        informe.kept_tags = conservadas.into_iter().collect();
        informe.reduced_tags = reducidas.into_iter().collect();

        if !entradas.is_empty() {
            self.with_project_mut(project_id, |pf| {
                pf.images.extend(entradas);
                pf.updated = now;
            })?;
        }

        // El registro de auditoría anota de qué entró el corpus: un corpus que
        // aparece de la nada no se puede defender después.
        self.audit(
            project_id,
            crate::audit::events::DATA_IMPORTED,
            serde_json::json!({
                "source": "medical",
                "n_files": informe.files_read,
                "n_images": informe.images_created,
                "n_subjects": informe.subjects.len(),
                "deidentified_tags": informe.removed_tags.len(),
            }),
        );

        Ok(informe)
    }

    fn importar_dicom(
        &self,
        project_id: &str,
        ruta: &Path,
        nombre: &str,
        images_dir: &Path,
        medical_dir: &Path,
        now: f64,
    ) -> Result<(ImageEntry, DeidentReport), String> {
        let img = super::dicom::leer(ruta, project_id)?;
        let id = uuid::Uuid::new_v4().to_string();

        let png = img.a_png()?;
        let archivo = format!("{}_{}.png", id, sanitize_filename(nombre));
        std::fs::write(images_dir.join(&archivo), &png)
            .map_err(|e| format!("Error escribiendo la imagen: {}", e))?;

        let (raw_file, slope, intercept) = guardar_crudo(
            medical_dir,
            &format!("{}.raw.png", id),
            &img.values,
            img.width,
            img.height,
        )?;

        let m = &img.meta;
        let info = MedicalInfo {
            source_format: "dicom".into(),
            modality: m.modality.clone(),
            manufacturer: m.manufacturer.clone(),
            model_name: m.model_name.clone(),
            body_part: m.body_part.clone(),
            pixel_spacing: m.pixel_spacing.clone(),
            kvp: m.kvp,
            repetition_time: m.repetition_time,
            echo_time: m.echo_time,
            protocol_name: m.protocol_name.clone(),
            patient_sex: m.patient_sex.clone(),
            patient_age_years: m.patient_age_years,
            window_center: m.window.map(|w| w.center),
            window_width: m.window.map(|w| w.width),
            window_from_file: m.window_from_file,
            raw_file: Some(raw_file),
            raw_slope: Some(slope),
            raw_intercept: Some(intercept),
            slice_index: None,
            slice_axis: None,
        };

        let entrada = entrada_de_imagen(
            id,
            nombre.to_string(),
            archivo,
            img.width,
            img.height,
            now,
            // El sujeto sale del `PatientID` ya seudonimizado: es lo que permite
            // agrupar las muestras de la misma persona en el reparto sin sacar
            // del hospital el identificador con el que se vuelve a ella.
            img.deident.subject_pseudonym.clone(),
            Some(info),
        );

        Ok((entrada, img.deident))
    }

    #[allow(clippy::too_many_arguments)]
    fn importar_nifti(
        &self,
        ruta: &Path,
        nombre: &str,
        images_dir: &Path,
        medical_dir: &Path,
        eje: Eje,
        umbral_senal: f64,
        now: f64,
    ) -> Result<(Vec<ImageEntry>, usize), String> {
        let (cortes, meta, saltados) = super::nifti::leer(ruta, eje, umbral_senal)?;
        let mut salida = Vec::with_capacity(cortes.len());

        for corte in cortes {
            let id = uuid::Uuid::new_v4().to_string();
            let base = format!(
                "{}_{}_{:04}",
                sanitize_filename(nombre),
                corte.axis.como_texto(),
                corte.index
            );
            let archivo = format!("{}_{}.png", id, base);

            let gris = image::GrayImage::from_raw(corte.width, corte.height, corte.gray.clone())
                .ok_or("Las dimensiones del corte no cuadran")?;
            gris.save(images_dir.join(&archivo))
                .map_err(|e| format!("Error escribiendo el corte: {}", e))?;

            // El NIfTI no trae identificadores de paciente en sus metadatos —por
            // eso no hay informe de deidentificación— pero el nombre del archivo
            // sí puede traerlos, y eso es cosa de quien lo nombró.
            let valores: Vec<f64> = corte.gray.iter().map(|g| *g as f64).collect();
            let (raw_file, slope, intercept) = guardar_crudo(
                medical_dir,
                &format!("{}.raw.png", id),
                &valores,
                corte.width,
                corte.height,
            )?;

            let info = MedicalInfo {
                source_format: "nifti".into(),
                pixel_spacing: meta
                    .voxel_size
                    .as_ref()
                    .map(|v| v.iter().map(|x| *x as f64).collect()),
                window_center: Some(corte.window.center),
                window_width: Some(corte.window.width),
                window_from_file: false,
                raw_file: Some(raw_file),
                raw_slope: Some(slope),
                raw_intercept: Some(intercept),
                slice_index: Some(corte.index),
                slice_axis: Some(corte.axis.como_texto().to_string()),
                ..Default::default()
            };

            salida.push(entrada_de_imagen(
                id,
                format!("{}#{}", nombre, corte.index),
                archivo,
                corte.width,
                corte.height,
                now,
                None,
                Some(info),
            ));
        }

        Ok((salida, saltados))
    }

    /// Vuelve a renderizar una imagen médica con otra ventana.
    ///
    /// Lee la copia de 16 bits, aplica la ventana nueva y reescribe el PNG que se
    /// anota. Las anotaciones no se tocan: las coordenadas son las mismas, lo que
    /// cambia es qué se ve.
    pub fn rewindow_image(
        &self,
        project_id: &str,
        image_id: &str,
        center: f64,
        width: f64,
    ) -> Result<(), String> {
        let (archivo, info) = self
            .with_project(project_id, |pf| {
                pf.images
                    .iter()
                    .find(|i| i.id == image_id)
                    .map(|i| (i.file.clone(), i.medical.clone()))
            })?
            .ok_or("Imagen no encontrada")?;

        let info = info.ok_or("Esta imagen no vino de un archivo médico")?;
        let raw = info
            .raw_file
            .as_ref()
            .ok_or("No hay copia de 16 bits: esta imagen no se puede volver a ventanear")?;

        let ruta_raw = self.project_medical_dir(project_id)?.join(raw);
        let (valores, w, h) = leer_crudo(
            &ruta_raw,
            info.raw_slope.unwrap_or(1.0),
            info.raw_intercept.unwrap_or(0.0),
        )?;

        let ventana = Window { center, width };
        let gris = windowing::aplicar(&valores, ventana);
        let img = image::GrayImage::from_raw(w, h, gris)
            .ok_or("Las dimensiones no cuadran con la copia de 16 bits")?;
        img.save(self.project_images_dir(project_id)?.join(&archivo))
            .map_err(|e| format!("Error reescribiendo la imagen: {}", e))?;

        self.with_project_mut(project_id, |pf| {
            if let Some(i) = pf.images.iter_mut().find(|i| i.id == image_id) {
                if let Some(m) = i.medical.as_mut() {
                    m.window_center = Some(center);
                    m.window_width = Some(width);
                    m.window_from_file = false;
                }
            }
            pf.updated = crate::store::images::js_timestamp_pub();
        })
    }
}

#[allow(clippy::too_many_arguments)]
fn entrada_de_imagen(
    id: String,
    nombre: String,
    archivo: String,
    width: u32,
    height: u32,
    now: f64,
    subject_id: Option<String>,
    medical: Option<MedicalInfo>,
) -> ImageEntry {
    ImageEntry {
        id,
        name: nombre,
        file: archivo,
        width,
        height,
        uploaded: now,
        annotated: None,
        status: "pending".to_string(),
        annotations: vec![],
        subject_id,
        video_id: None,
        frame_index: None,
        is_background: false,
        locked_by: None,
        lock_expires: None,
        download_status: None,
        predictions: vec![],
        rejected: vec![],
        readings: vec![],
        medical,
    }
}
