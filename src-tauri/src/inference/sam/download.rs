//! Descarga de modelos SAM del catálogo.
//!
//! Baja el par encoder/decodificador y lo registra como si se hubiera subido a
//! mano: a partir de ahí es un modelo más y el resto del subsistema no nota la
//! diferencia.
//!
//! ## Por qué el par y no cada archivo por su lado
//!
//! Encoder y decodificador tienen que venir del **mismo export**: un encoder
//! oficial de SAM con un decodificador de Transformers.js no encajan, y el error
//! aparecería tarde —al intentar segmentar— y sin explicación. Descargarlos
//! juntos hace imposible mezclarlos por accidente.
//!
//! ## Lo que se escribe a medias
//!
//! Se baja a un archivo temporal y se renombra al terminar. Un corte de red a los
//! 300 MB dejaría si no un `.onnx` truncado en el directorio de modelos, que
//! cargaría con un error incomprensible en vez de no estar.

use std::io::Write;
use std::path::Path;

use serde::Serialize;

use super::catalog::{buscar, SamCatalogEntry};

/// Cómo va la descarga, para poder enseñarlo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    /// `encoder` | `decoder`.
    pub part: String,
    pub downloaded_bytes: u64,
    /// Lo que declara el servidor. `None` si no lo dice.
    pub total_bytes: Option<u64>,
}

/// Baja un archivo, informando del avance.
///
/// Escribe a `destino.part` y renombra al final: lo que quede a medias no se
/// confunde nunca con un modelo entero.
fn bajar(
    url: &str,
    destino: &Path,
    model_id: &str,
    part: &str,
    on_progress: &dyn Fn(DownloadProgress),
) -> Result<(), String> {
    // Cliente bloqueante a propósito: la descarga se lee a trozos para poder
    // informar del avance, y con el asíncrono habría que arrastrar un runtime
    // hasta aquí sin ganar nada — esto ya corre fuera del hilo de la UI.
    let cliente = crate::net::blocking(crate::net::Purpose::ModelWeights);
    let mut resp = cliente
        .get(url)
        // Sin tope: son cientos de megas por una red que puede ser lenta, y un
        // tiempo máximo pensado para una petición normal cortaría descargas que
        // iban bien.
        .timeout(std::time::Duration::from_secs(60 * 60))
        .send()
        .map_err(|e| format!("No se pudo empezar la descarga: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "El servidor respondió {} al pedir {}",
            resp.status(),
            url
        ));
    }

    let total = resp.content_length();
    let temporal = destino.with_extension("part");
    let mut archivo = std::fs::File::create(&temporal)
        .map_err(|e| format!("No se pudo crear el archivo temporal: {}", e))?;

    let mut bajados: u64 = 0;
    let mut buffer = [0u8; 256 * 1024];
    loop {
        let n = {
            use std::io::Read;
            resp.read(&mut buffer)
                .map_err(|e| format!("Se cortó la descarga: {}", e))?
        };
        if n == 0 {
            break;
        }
        archivo
            .write_all(&buffer[..n])
            .map_err(|e| format!("Error escribiendo el modelo: {}", e))?;
        bajados += n as u64;
        on_progress(DownloadProgress {
            model_id: model_id.to_string(),
            part: part.to_string(),
            downloaded_bytes: bajados,
            total_bytes: total,
        });
    }

    archivo
        .flush()
        .map_err(|e| format!("Error cerrando el modelo: {}", e))?;
    drop(archivo);

    // Un archivo más corto de lo declarado es una descarga cortada, no un modelo.
    if let Some(t) = total {
        if bajados != t {
            let _ = std::fs::remove_file(&temporal);
            return Err(format!(
                "La descarga quedó incompleta: {} de {} bytes",
                bajados, t
            ));
        }
    }

    std::fs::rename(&temporal, destino)
        .map_err(|e| format!("No se pudo dejar el modelo en su sitio: {}", e))?;
    Ok(())
}

/// Descarga el par de un modelo del catálogo y lo registra.
///
/// Devuelve `(encoder, decoder)` ya registrados, listos para `sam_load_model`.
pub fn descargar_del_catalogo(
    data_dir: &Path,
    model_id: &str,
    on_progress: impl Fn(DownloadProgress),
) -> Result<
    (
        crate::store::sam_models::SamAppModel,
        crate::store::sam_models::SamAppModel,
    ),
    String,
> {
    let entrada: &SamCatalogEntry = buscar(model_id)
        .ok_or_else(|| format!("No hay un modelo «{}» en el catálogo", model_id))?;

    let temporal = tempfile::tempdir()
        .map_err(|e| format!("No se pudo crear el directorio temporal: {}", e))?;

    let enc_tmp = temporal.path().join("encoder.onnx");
    bajar(
        entrada.encoder_url,
        &enc_tmp,
        model_id,
        "encoder",
        &on_progress,
    )?;

    let dec_tmp = temporal.path().join("decoder.onnx");
    bajar(
        entrada.decoder_url,
        &dec_tmp,
        model_id,
        "decoder",
        &on_progress,
    )?;

    // Se registran los dos al final: si la segunda descarga falla, no queda medio
    // par registrado que alguien pueda elegir creyendo que está completo.
    let encoder = crate::store::sam_models::add_model(
        data_dir,
        &enc_tmp,
        &format!("{} — encoder", entrada.name),
        "encoder",
    )?;
    let decoder = crate::store::sam_models::add_model(
        data_dir,
        &dec_tmp,
        &format!("{} — decoder", entrada.name),
        "decoder",
    )?;

    Ok((encoder, decoder))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pedir un modelo que no está en el catálogo tiene que decirlo, no fallar al
    /// intentar bajar una URL vacía.
    #[test]
    fn un_modelo_fuera_del_catalogo_se_rechaza_antes_de_bajar_nada() {
        let tmp = tempfile::tempdir().unwrap();
        let err = descargar_del_catalogo(tmp.path(), "no-existe", |_| {})
            .expect_err("debería rechazarse");
        assert!(err.contains("catálogo"), "{err}");
    }
}
