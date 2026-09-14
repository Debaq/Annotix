//! Lecturas por evaluador: qué se hace con lo que cada par escribió.
//!
//! El sustrato ya guardaba una entrada por autor bajo la misma clave
//! (`images/{id}/annots`), pero al reconstruir el proyecto todas caían en el mismo
//! `HashMap` y ganaba la última del stream: la segunda lectura pisaba a la primera
//! y el desacuerdo —que es el dato que justifica leer dos veces— desaparecía sin
//! dejar rastro.
//!
//! Aquí se agrupan por autor en vez de colapsarlas.
//!
//! ## Qué significa `annotations` en una sesión de lectura múltiple
//!
//! La capa **consolidada** (`ImageEntry::annotations`) es la que usan la galería,
//! el entrenamiento y la exportación. Con una sola lectura es la lectura, y nada
//! de esto se nota. Con varias, en la máquina de cada evaluador la consolidada es
//! **su propia capa**: es sobre lo que anota, y no puede ser la de otro. La
//! consolidada de verdad —la que sale de adjudicar las discrepancias— la escribe
//! la etapa 7 en el proyecto de quien adjudica.

use std::collections::HashMap;

use crate::store::project_file::{AnnotationEntry, ReadingLayer};

/// Cómo queda una imagen tras leer lo que escribió cada evaluador.
#[derive(Debug, Default)]
pub struct LecturasDeImagen {
    /// Lo que va a `ImageEntry::annotations`.
    pub consolidada: Vec<AnnotationEntry>,
    /// Lo que va a `ImageEntry::readings`. Vacío cuando sólo hay una lectura: un
    /// proyecto de una sola lectura no necesita capas y no debe verlas aparecer.
    pub capas: Vec<ReadingLayer>,
}

/// Agrupa por autor las anotaciones que llegaron del documento.
///
/// `entradas` son pares `(id de autor, JSON de la lista de anotaciones)`, una por
/// autor que haya escrito sobre esa imagen. `yo` es el autor de este par.
///
/// En modo **cegado** las capas ajenas no se devuelven: no llegan a la UI ni se
/// escriben en el `project.json` local. El documento replicado sigue
/// conteniéndolas —el cegado es de la aplicación, no del sustrato—, y eso está
/// dicho en la propia regla de sesión para no prometer de más.
pub fn agrupar_lecturas(
    entradas: &[(String, Vec<u8>)],
    nombres: &HashMap<String, String>,
    yo: &str,
    cegado: bool,
    now: f64,
) -> LecturasDeImagen {
    let mut parsed: Vec<(String, Vec<AnnotationEntry>)> = Vec::new();
    for (autor, bytes) in entradas {
        match serde_json::from_slice::<Vec<AnnotationEntry>>(bytes) {
            Ok(anns) => parsed.push((autor.clone(), anns)),
            Err(e) => log::warn!("lecturas: capa de {} ilegible: {}", autor, e),
        }
    }

    if parsed.is_empty() {
        return LecturasDeImagen::default();
    }

    // Una sola lectura: es el caso normal y tiene que comportarse como antes de
    // que las capas existieran.
    if parsed.len() == 1 {
        return LecturasDeImagen {
            consolidada: parsed.remove(0).1,
            capas: Vec::new(),
        };
    }

    let mia = parsed
        .iter()
        .find(|(autor, _)| autor == yo)
        .map(|(_, anns)| anns.clone());

    let capas = parsed
        .iter()
        .filter(|(autor, _)| !cegado || autor == yo)
        .map(|(autor, anns)| ReadingLayer {
            author_id: autor.clone(),
            author_name: nombres.get(autor).cloned(),
            annotations: anns.clone(),
            status: "in_progress".to_string(),
            submitted_at: None,
            updated_at: Some(now),
        })
        .collect();

    LecturasDeImagen {
        // Sobre lo que este par anota es lo suyo. Si todavía no escribió nada, la
        // consolidada queda vacía: poner la de otro sería darle por bueno un
        // trabajo ajeno y, en modo cegado, enseñárselo.
        consolidada: mia.unwrap_or_default(),
        capas,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn anotacion(id: &str, clase: i64) -> AnnotationEntry {
        AnnotationEntry {
            id: id.to_string(),
            annotation_type: "bbox".into(),
            class_id: clase,
            data: serde_json::json!({ "x": 1.0, "y": 1.0, "width": 5.0, "height": 5.0 }),
            source: "user".into(),
            confidence: None,
            model_class_name: None,
            created_by: None,
            track_id: None,
            origin: Some("manual".into()),
            model_id: None,
            review: None,
            reviewed_by: None,
            reviewed_at: None,
            created_at: None,
            updated_at: None,
        }
    }

    fn capa(autor: &str, anns: &[AnnotationEntry]) -> (String, Vec<u8>) {
        (autor.to_string(), serde_json::to_vec(anns).unwrap())
    }

    /// El caso normal: una sola lectura se comporta como antes de que las capas
    /// existieran. Ni un proyecto de una persona ve nada de esto.
    #[test]
    fn una_sola_lectura_no_crea_capas() {
        let anns = vec![anotacion("a1", 0)];
        let r = agrupar_lecturas(&[capa("ana", &anns)], &HashMap::new(), "ana", false, 1.0);

        assert_eq!(r.consolidada.len(), 1);
        assert!(r.capas.is_empty(), "apareció una capa sin lectura múltiple");
    }

    /// La regresión que justifica todo esto: dos lecturas ya no se pisan.
    #[test]
    fn dos_lecturas_no_se_colapsan_en_una() {
        let de_ana = vec![anotacion("a1", 0), anotacion("a2", 1)];
        let de_beto = vec![anotacion("b1", 0)];
        let nombres = HashMap::from([
            ("ana".to_string(), "Ana".to_string()),
            ("beto".to_string(), "Beto".to_string()),
        ]);

        let r = agrupar_lecturas(
            &[capa("ana", &de_ana), capa("beto", &de_beto)],
            &nombres,
            "ana",
            false,
            1.0,
        );

        assert_eq!(r.capas.len(), 2, "una lectura pisó a la otra");
        let ana = r.capas.iter().find(|c| c.author_id == "ana").unwrap();
        let beto = r.capas.iter().find(|c| c.author_id == "beto").unwrap();
        assert_eq!(ana.annotations.len(), 2);
        assert_eq!(beto.annotations.len(), 1);
        assert_eq!(ana.author_name.as_deref(), Some("Ana"));
        // Y lo que este par tiene delante es lo suyo, no lo del otro.
        assert_eq!(r.consolidada.len(), 2);
    }

    /// En modo cegado, la capa del otro no llega ni a la UI ni al `project.json`
    /// local. Si llegara, el acuerdo que se midiera después no diría nada: dos
    /// personas que ven lo mismo coinciden porque lo vieron.
    #[test]
    fn en_modo_cegado_no_llega_la_capa_ajena() {
        let de_ana = vec![anotacion("a1", 0)];
        let de_beto = vec![anotacion("b1", 0)];

        let r = agrupar_lecturas(
            &[capa("ana", &de_ana), capa("beto", &de_beto)],
            &HashMap::new(),
            "ana",
            true,
            1.0,
        );

        assert_eq!(r.capas.len(), 1);
        assert_eq!(r.capas[0].author_id, "ana");
        assert_eq!(r.consolidada.len(), 1);
        assert_eq!(r.consolidada[0].id, "a1");
    }

    /// Quien todavía no anotó nada no hereda el trabajo de otro: en cegado sería
    /// además enseñárselo.
    #[test]
    fn sin_capa_propia_la_consolidada_queda_vacia() {
        let de_ana = vec![anotacion("a1", 0)];
        let de_beto = vec![anotacion("b1", 0)];

        let r = agrupar_lecturas(
            &[capa("ana", &de_ana), capa("beto", &de_beto)],
            &HashMap::new(),
            "carla",
            false,
            1.0,
        );

        assert!(r.consolidada.is_empty());
        assert_eq!(
            r.capas.len(),
            2,
            "carla debería ver las dos capas sin cegado"
        );
    }

    /// Una capa ilegible no puede tirar las demás: es el caso de un par con una
    /// versión distinta o de un blob a medio llegar.
    #[test]
    fn una_capa_ilegible_no_se_lleva_a_las_demas() {
        let de_ana = vec![anotacion("a1", 0)];
        let rota = ("beto".to_string(), b"{no es json".to_vec());

        let r = agrupar_lecturas(
            &[capa("ana", &de_ana), rota],
            &HashMap::new(),
            "ana",
            false,
            1.0,
        );

        assert_eq!(r.consolidada.len(), 1);
        assert!(
            r.capas.is_empty(),
            "quedó una sola lectura legible: sin capas"
        );
    }
}
