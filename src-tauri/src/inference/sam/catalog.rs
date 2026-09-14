//! Catálogo de modelos SAM que la app sabe descargar.
//!
//! Existe porque hoy los modelos se suben a mano: hay que saber cuál buscar,
//! encontrar un export ONNX que hable la firma correcta, y bajarlo por fuera. Eso
//! deja el asistente de segmentación fuera del alcance de quien no sabe qué es un
//! `.onnx` — que es casi todo el mundo que anotaría un corpus clínico.
//!
//! ## La regla que gobierna este archivo
//!
//! **Aquí no entra un modelo que no se haya ejecutado.** Es el mismo aprendizaje
//! que en entrenamiento (`docs/roadmap_train.md`): un backend que no corre de
//! verdad cuesta más retirarlo que no haberlo agregado. Cada entrada tiene un
//! `verificado` que dice si alguien corrió el smoke test
//! (`sam::smoke_tests`) contra esos pesos, y la UI lo enseña.
//!
//! ## Licencias
//!
//! Van en la entrada, no en la documentación: quien descarga un modelo tiene que
//! ver bajo qué licencia lo hace **antes** de bajarlo, sobre todo si el corpus es
//! clínico y el modelo acabará en un informe.

use serde::Serialize;

/// Un modelo descargable: encoder y decodificador van juntos porque tienen que
/// venir del mismo export —mezclarlos no funciona y el error aparecería tarde—.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SamCatalogEntry {
    pub id: &'static str,
    pub name: &'static str,
    /// `general` | `radiologia` | `microscopia`.
    pub domain: &'static str,
    /// Para qué sirve, en una frase que se pueda leer sin saber de modelos.
    pub description: &'static str,
    pub license: &'static str,
    /// De dónde sale, para poder comprobarlo.
    pub source: &'static str,
    pub encoder_url: &'static str,
    pub decoder_url: &'static str,
    /// Tamaño aproximado en MB, para avisar antes de bajar.
    pub encoder_mb: u32,
    pub decoder_mb: u32,
    /// Si alguien corrió el smoke test contra estos pesos. `false` significa «se
    /// puede bajar, pero nadie ha comprobado que funcione».
    pub verified: bool,
    /// Lo que hay que saber antes de usarlo.
    pub caveats: &'static [&'static str],
}

/// Los modelos del catálogo.
pub const CATALOG: &[SamCatalogEntry] = &[SamCatalogEntry {
    id: "medsam-vit-base",
    name: "MedSAM (ViT-B)",
    domain: "radiologia",
    description:
        "SAM reentrenado sobre un millón de imágenes médicas: CT, MRI, rayos X, \
         ecografía, endoscopia y patología. Segmenta estructuras anatómicas con un \
         clic, donde el SAM original —entrenado con fotos— falla.",
    license: "Apache-2.0",
    source: "https://huggingface.co/Xenova/medsam-vit-base",
    encoder_url:
        "https://huggingface.co/Xenova/medsam-vit-base/resolve/main/onnx/vision_encoder_quantized.onnx",
    decoder_url:
        "https://huggingface.co/Xenova/medsam-vit-base/resolve/main/onnx/prompt_encoder_mask_decoder.onnx",
    encoder_mb: 96,
    decoder_mb: 16,
    verified: true,
    caveats: &[
        "El encoder es la versión cuantizada: ocupa 96 MB en vez de 342 y corre en \
         CPU, a cambio de algo de precisión en el borde de la máscara.",
        "MedSAM está entrenado para responder a **cajas**, no a puntos sueltos: con \
         un clic solo puede dar máscaras peores que marcando la región.",
        "Sobre imágenes que no son médicas rinde peor que el SAM original. No es un \
         reemplazo: es otro modelo para otro dominio.",
    ],
}];

/// Una entrada por id.
pub fn buscar(id: &str) -> Option<&'static SamCatalogEntry> {
    CATALOG.iter().find(|m| m.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La regla del módulo, como test: nada se publica sin haberse ejecutado.
    ///
    /// Si alguien añade una entrada con `verified: false`, este test la obliga a
    /// declarar en `caveats` que nadie la ha probado — para que la UI pueda
    /// decirlo y nadie descargue 400 MB creyendo que funciona.
    #[test]
    fn lo_no_verificado_tiene_que_decirlo() {
        for m in CATALOG {
            if !m.verified {
                assert!(
                    m.caveats.iter().any(|c| c.contains("no se ha comprobado")),
                    "{} no está verificado y no lo declara en sus advertencias",
                    m.id
                );
            }
        }
    }

    /// Cada entrada tiene que decir bajo qué licencia se descarga y de dónde sale:
    /// sin eso, quien la use no puede responder por lo que metió en su corpus.
    #[test]
    fn toda_entrada_declara_licencia_y_origen() {
        for m in CATALOG {
            assert!(!m.license.is_empty(), "{} sin licencia", m.id);
            assert!(
                m.source.starts_with("https://"),
                "{} sin origen comprobable",
                m.id
            );
            assert!(!m.description.is_empty(), "{} sin descripción", m.id);
        }
    }

    /// Encoder y decodificador tienen que venir del mismo sitio: mezclar exports
    /// no funciona, y el error aparecería tarde y sin explicación.
    #[test]
    fn el_par_viene_del_mismo_export() {
        for m in CATALOG {
            let base = |u: &str| u.rsplit_once('/').map(|x| x.0).unwrap_or("").to_string();
            assert_eq!(
                base(m.encoder_url),
                base(m.decoder_url),
                "{}: el encoder y el decodificador no salen del mismo export",
                m.id
            );
        }
    }

    #[test]
    fn los_ids_no_se_repiten() {
        let mut vistos = std::collections::HashSet::new();
        for m in CATALOG {
            assert!(vistos.insert(m.id), "id repetido: {}", m.id);
        }
    }
}
