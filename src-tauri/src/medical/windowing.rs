//! Ventaneo window/level de una imagen médica.
//!
//! Un CT guarda unidades Hounsfield entre −1024 y 3071; una pantalla muestra 256
//! grises. Aplastar todo el rango a 8 bits deja una imagen gris uniforme donde no
//! se ve nada: el pulmón y el hueso caben en el mismo gris. El **ventaneo** elige
//! qué tramo del rango se reparte los 256 grises, y es lo que hace la diferencia
//! entre una radiografía que se puede anotar y uninforme borroso.
//!
//! Por eso el DICOM trae su propia ventana (`WindowCenter`/`WindowWidth`): es la
//! que el equipo consideró adecuada para esa adquisición. Se usa esa cuando está,
//! y cuando no, una calculada sobre los percentiles de la propia imagen — que es
//! lo que hace un visor cuando no le dicen nada.

use serde::{Deserialize, Serialize};

/// Con qué ventana se renderizó una imagen.
///
/// Se guarda con la imagen porque **el renderizado es una interpretación**: la
/// misma adquisición con dos ventanas distintas son dos imágenes distintas, y
/// una anotación hecha sobre una puede no tener sentido sobre la otra.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    /// Centro de la ventana, en las unidades del dato (HU en CT).
    pub center: f64,
    /// Anchura de la ventana.
    pub width: f64,
}

impl Window {
    /// Límites del tramo visible.
    pub fn limites(&self) -> (f64, f64) {
        let w = self.width.max(1.0);
        (self.center - w / 2.0, self.center + w / 2.0)
    }
}

/// Ventanas de uso corriente, por si el archivo no trae la suya o el usuario
/// quiere otra. Los valores son los habituales en radiología; se ofrecen como
/// atajo, no como verdad.
pub const PRESETS: &[(&str, f64, f64)] = &[
    ("pulmon", -600.0, 1500.0),
    ("mediastino", 50.0, 350.0),
    ("hueso", 400.0, 1800.0),
    ("cerebro", 40.0, 80.0),
    ("higado", 60.0, 160.0),
    ("angio", 300.0, 600.0),
];

/// Ventana calculada a partir de la propia imagen, cuando el archivo no trae una.
///
/// Recorta el 1 % de cada extremo antes de decidir. Sin ese recorte, un solo
/// píxel saturado —un marcador metálico, un borde quemado— se lleva todo el rango
/// y el resto de la imagen queda plano.
pub fn ventana_automatica(valores: &[f64]) -> Window {
    if valores.is_empty() {
        return Window {
            center: 0.0,
            width: 1.0,
        };
    }
    let mut orden: Vec<f64> = valores.to_vec();
    orden.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let bajo = orden[(orden.len() as f64 * 0.01) as usize];
    let alto = orden[((orden.len() as f64 * 0.99) as usize).min(orden.len() - 1)];

    let width = (alto - bajo).max(1.0);
    Window {
        center: bajo + width / 2.0,
        width,
    }
}

/// Aplica `valor · pendiente + intercepto`, que es lo que convierte el número
/// almacenado en la magnitud física (HU, por ejemplo).
pub fn reescalar(valor: f64, pendiente: f64, intercepto: f64) -> f64 {
    valor * pendiente + intercepto
}

/// Lleva un valor físico a un gris de 8 bits según la ventana.
///
/// Todo lo que cae por debajo del límite inferior es negro y todo lo que cae por
/// encima es blanco: **eso es información que se pierde a propósito**, y es
/// justamente lo que hace visible el tramo que interesa.
pub fn a_gris(valor: f64, w: Window) -> u8 {
    let (bajo, alto) = w.limites();
    if valor <= bajo {
        return 0;
    }
    if valor >= alto {
        return 255;
    }
    (((valor - bajo) / (alto - bajo)) * 255.0)
        .round()
        .clamp(0.0, 255.0) as u8
}

/// Convierte una lámina de valores en píxeles de 8 bits.
pub fn aplicar(valores: &[f64], w: Window) -> Vec<u8> {
    valores.iter().map(|v| a_gris(*v, w)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// El centro de la ventana cae en el gris medio: si no, la ventana estaría
    /// desplazada y todo el ajuste que haga el usuario iría sesgado.
    #[test]
    fn el_centro_de_la_ventana_es_el_gris_medio() {
        let w = Window {
            center: 40.0,
            width: 80.0,
        };
        assert_eq!(a_gris(40.0, w), 128);
        assert_eq!(a_gris(0.0, w), 0);
        assert_eq!(a_gris(80.0, w), 255);
    }

    /// Fuera de la ventana se satura. Es pérdida deliberada: es lo que hace
    /// visible el tramo que interesa.
    #[test]
    fn fuera_de_la_ventana_se_satura() {
        let w = Window {
            center: 0.0,
            width: 100.0,
        };
        assert_eq!(a_gris(-5000.0, w), 0);
        assert_eq!(a_gris(5000.0, w), 255);
    }

    /// Una ventana de anchura cero no puede dividir por cero. Se trata como
    /// anchura 1: el centro sigue cayendo en el gris medio y lo de al lado
    /// satura, que es lo que una ventana degenerada significa.
    #[test]
    fn una_ventana_degenerada_se_trata_como_anchura_uno() {
        let w = Window {
            center: 10.0,
            width: 0.0,
        };
        assert_eq!(a_gris(10.0, w), 128, "el centro dejó de ser el gris medio");
        assert_eq!(a_gris(9.0, w), 0);
        assert_eq!(a_gris(11.0, w), 255);
    }

    /// El reescalado es lo que convierte el número guardado en unidades físicas.
    /// Sin él, un CT con intercepto −1024 se ventanea contra el rango equivocado.
    #[test]
    fn el_reescalado_lleva_a_unidades_fisicas() {
        assert_eq!(reescalar(1024.0, 1.0, -1024.0), 0.0);
        assert_eq!(reescalar(0.0, 1.0, -1024.0), -1024.0);
        assert_eq!(reescalar(100.0, 2.0, 10.0), 210.0);
    }

    /// La ventana automática recorta los extremos: un solo píxel saturado no
    /// puede llevarse todo el rango y dejar el resto plano.
    #[test]
    fn la_ventana_automatica_ignora_el_pixel_saturado() {
        let mut valores: Vec<f64> = (0..1000).map(|i| (i % 100) as f64).collect();
        valores.push(100_000.0); // marcador metálico

        let w = ventana_automatica(&valores);
        assert!(
            w.width < 1000.0,
            "un píxel saturado se llevó el rango: anchura {}",
            w.width
        );

        // Y el grueso de la imagen sigue repartiéndose los grises.
        let (bajo, alto) = w.limites();
        assert!(bajo <= 10.0 && alto >= 90.0, "ventana {bajo}..{alto}");
    }

    /// Sin datos no hay ventana que calcular, y devolver una anchura de cero
    /// haría dividir por cero más adelante.
    #[test]
    fn sin_valores_la_ventana_es_valida_igual() {
        let w = ventana_automatica(&[]);
        assert!(w.width >= 1.0);
    }

    /// Los presets son los valores de uso corriente: si alguno se cuela con una
    /// anchura negativa, la imagen saldría invertida sin que nadie lo note.
    #[test]
    fn los_presets_tienen_anchura_positiva() {
        for (nombre, _, ancho) in PRESETS {
            assert!(*ancho > 0.0, "el preset {nombre} tiene anchura {ancho}");
        }
    }
}
