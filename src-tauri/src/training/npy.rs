//! Escritura de arrays `.npy` (NumPy v1.0), sin dependencias nuevas.
//!
//! Los seis backends de series temporales consumen arrays de NumPy. El formato es
//! lo bastante simple para escribirlo aquí: cabecera de texto con `descr`, orden y
//! forma, y los datos crudos en little-endian.

use std::io::Write;
use std::path::Path;

/// Cabecera NPY v1.0: magia, versión, longitud y diccionario, alineado a 64 bytes.
fn write_header(out: &mut Vec<u8>, descr: &str, shape: &[usize]) {
    let forma = if shape.len() == 1 {
        format!("({},)", shape[0])
    } else {
        let dims: Vec<String> = shape.iter().map(|d| d.to_string()).collect();
        format!("({})", dims.join(", "))
    };
    let mut dict = format!(
        "{{'descr': '{}', 'fortran_order': False, 'shape': {}, }}",
        descr, forma
    );

    // El bloque cabecera (10 bytes de preámbulo + dict + '\n') debe ser múltiplo de 64.
    let base = 10 + dict.len() + 1;
    let relleno = (64 - base % 64) % 64;
    dict.push_str(&" ".repeat(relleno));
    dict.push('\n');

    out.extend_from_slice(b"\x93NUMPY");
    out.push(1); // major
    out.push(0); // minor
    out.extend_from_slice(&(dict.len() as u16).to_le_bytes());
    out.extend_from_slice(dict.as_bytes());
}

fn escribir(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = std::fs::File::create(path)
        .map_err(|e| format!("Error creando {}: {}", path.display(), e))?;
    file.write_all(bytes)
        .map_err(|e| format!("Error escribiendo {}: {}", path.display(), e))
}

/// Guarda un array de `f32` con la forma dada (datos en orden C).
pub fn write_f32(path: &Path, data: &[f32], shape: &[usize]) -> Result<(), String> {
    let esperado: usize = shape.iter().product();
    if esperado != data.len() {
        return Err(format!(
            "forma {:?} no cuadra con {} valores",
            shape,
            data.len()
        ));
    }
    let mut out = Vec::with_capacity(128 + data.len() * 4);
    write_header(&mut out, "<f4", shape);
    for v in data {
        out.extend_from_slice(&v.to_le_bytes());
    }
    escribir(path, &out)
}

/// Guarda un array de enteros de 64 bits (etiquetas de clase).
pub fn write_i64(path: &Path, data: &[i64], shape: &[usize]) -> Result<(), String> {
    let esperado: usize = shape.iter().product();
    if esperado != data.len() {
        return Err(format!(
            "forma {:?} no cuadra con {} valores",
            shape,
            data.len()
        ));
    }
    let mut out = Vec::with_capacity(128 + data.len() * 8);
    write_header(&mut out, "<i8", shape);
    for v in data {
        out.extend_from_slice(&v.to_le_bytes());
    }
    escribir(path, &out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cabecera_alineada_a_64_bytes() {
        let mut out = Vec::new();
        write_header(&mut out, "<f4", &[3, 2, 10]);
        assert_eq!(out.len() % 64, 0, "la cabecera debe alinearse a 64 bytes");
        assert_eq!(&out[..6], b"\x93NUMPY");
        let texto = String::from_utf8_lossy(&out[10..]);
        assert!(texto.contains("'shape': (3, 2, 10)"), "{texto}");
        assert!(texto.ends_with('\n'));
    }

    #[test]
    fn forma_unidimensional_lleva_coma() {
        let mut out = Vec::new();
        write_header(&mut out, "<i8", &[5]);
        let texto = String::from_utf8_lossy(&out[10..]);
        assert!(texto.contains("'shape': (5,)"), "{texto}");
    }

    #[test]
    fn rechaza_forma_que_no_cuadra() {
        let tmp = tempfile::tempdir().unwrap();
        let err = write_f32(&tmp.path().join("x.npy"), &[1.0, 2.0], &[3]).unwrap_err();
        assert!(err.contains("no cuadra"), "{err}");
    }

    #[test]
    fn escribe_datos_en_little_endian() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("x.npy");
        write_f32(&path, &[1.5, -2.0], &[2]).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let datos = &bytes[bytes.len() - 8..];
        assert_eq!(&datos[..4], &1.5f32.to_le_bytes());
        assert_eq!(&datos[4..], &(-2.0f32).to_le_bytes());
    }
}
