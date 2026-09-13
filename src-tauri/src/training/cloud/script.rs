//! Entrypoint común para todos los proveedores cloud.
//!
//! Antes cada runner escribía su propio Python con `from ultralytics import YOLO`
//! incrustado: ninguno miraba `request.backend`, así que elegir SMP, timm o tsai y
//! ejecutar en la nube entrenaba un YOLO (o fallaba por dataset incompatible). Y
//! cada uno inventaba sus rutas: cuatro buscaban `dataset.yaml` cuando el paquete
//! genera `data.yaml`.
//!
//! Ahora la nube ejecuta exactamente el mismo paquete de entrenamiento que el modo
//! "descargar paquete": un zip autocontenido con `train.py` (generado desde el
//! `TrainingRequest`), su dataset y su `requirements.txt`. Este módulo sólo genera
//! el envoltorio que lo descomprime, instala dependencias, lo ejecuta reenviando su
//! salida —con ella los `ANNOTIX_EVENT` que lee el poller— y publica los
//! resultados.

/// Cómo encaja el entrypoint en un proveedor concreto.
pub struct Entrypoint<'a> {
    /// Ruta donde el proveedor deja el paquete: el `.zip`, o un directorio que lo
    /// contiene (Kaggle descomprime sus datasets al montarlos).
    pub package_location: &'a str,
    /// Directorio de trabajo donde extraer y entrenar.
    pub workdir: &'a str,
    /// Comando shell que publica `results.zip`, con `{src}` y `{dest}`.
    /// `None` cuando el propio proveedor conserva el directorio de salida.
    pub upload_cmd: Option<&'a str>,
    /// URI final de los resultados, para reportarla al terminar.
    pub results_uri: Option<&'a str>,
}

/// Python que ejecuta el paquete de entrenamiento y publica sus resultados.
pub fn entrypoint_python(e: &Entrypoint<'_>) -> String {
    let upload = match (e.upload_cmd, e.results_uri) {
        (Some(cmd), Some(uri)) => format!(
            r#"
    destino = r"{uri}"
    comando = r"{cmd}".replace("{{src}}", zip_resultados).replace("{{dest}}", destino)
    print(f"Publicando resultados: {{comando}}", flush=True)
    codigo = subprocess.call(comando, shell=True)
    if codigo == 0:
        emitir({{"type": "artifact", "uri": destino}})
    else:
        print(f"Aviso: la publicación de resultados salió con {{codigo}}", file=sys.stderr)
"#,
            uri = uri,
            cmd = cmd
        ),
        _ => "\n    emitir({\"type\": \"artifact\", \"uri\": zip_resultados})\n".to_string(),
    };

    format!(
        r#"#!/usr/bin/env python3
"""Ejecuta el paquete de entrenamiento de Annotix. Generado automáticamente."""
import glob
import json
import os
import shutil
import subprocess
import sys
import zipfile

PAQUETE = r"{package}"
WORKDIR = r"{workdir}"


def emitir(evento):
    print("ANNOTIX_EVENT:" + json.dumps(evento), flush=True)


def localizar_paquete():
    """Devuelve el directorio con el paquete ya extraído."""
    os.makedirs(WORKDIR, exist_ok=True)

    zips = []
    if os.path.isfile(PAQUETE) and PAQUETE.lower().endswith(".zip"):
        zips = [PAQUETE]
    elif os.path.isdir(PAQUETE):
        zips = sorted(glob.glob(os.path.join(PAQUETE, "**", "*.zip"), recursive=True))

    for archivo in zips:
        with zipfile.ZipFile(archivo) as z:
            z.extractall(WORKDIR)

    if not zips and os.path.isdir(PAQUETE):
        # Algunos proveedores montan el paquete ya descomprimido.
        shutil.copytree(PAQUETE, WORKDIR, dirs_exist_ok=True)

    return WORKDIR


def main():
    raiz = localizar_paquete()

    # El paquete trae su train.py generado desde la configuración del proyecto: la
    # nube no reimplementa el entrenamiento, lo ejecuta.
    candidatos = sorted(glob.glob(os.path.join(raiz, "**", "train.py"), recursive=True))
    if not candidatos:
        emitir({{
            "type": "error",
            "message": f"No se encontró train.py bajo {{raiz}}: el paquete subido no es un paquete de entrenamiento de Annotix",
        }})
        sys.exit(1)

    script = candidatos[0]
    base = os.path.dirname(script)
    print(f"Paquete en {{base}}", flush=True)

    requisitos = os.path.join(base, "requirements.txt")
    if os.path.exists(requisitos):
        print("Instalando dependencias del backend...", flush=True)
        subprocess.call([sys.executable, "-m", "pip", "install", "-q", "-r", requisitos])

    # -u y reenvío línea a línea: así los ANNOTIX_EVENT del entrenamiento llegan a
    # los logs del proveedor, que es de donde el poller lee el progreso.
    proceso = subprocess.Popen(
        [sys.executable, "-u", os.path.basename(script)],
        cwd=base,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    for linea in proceso.stdout:
        print(linea, end="", flush=True)
    codigo = proceso.wait()

    # Resultados: los scripts escriben en `train/` o en `train_output/` según el
    # backend; ambos cuelgan del directorio del paquete.
    salidas = []
    for patron in ("**/train/**/*", "**/train_output/**/*"):
        salidas.extend(
            p for p in glob.glob(os.path.join(base, patron), recursive=True) if os.path.isfile(p)
        )

    zip_resultados = os.path.join(WORKDIR, "results.zip")
    with zipfile.ZipFile(zip_resultados, "w", zipfile.ZIP_DEFLATED) as z:
        for archivo in sorted(set(salidas)):
            z.write(archivo, os.path.relpath(archivo, base))
    print(f"Resultados empaquetados: {{zip_resultados}} ({{len(set(salidas))}} archivos)", flush=True)
{upload}
    if codigo != 0:
        emitir({{"type": "error", "message": f"El entrenamiento salió con código {{codigo}}"}})
        sys.exit(codigo)


if __name__ == "__main__":
    main()
"#,
        package = e.package_location.replace('\\', "/"),
        workdir = e.workdir.replace('\\', "/"),
        upload = upload,
    )
}

/// Intérprete de pruebas, si el entorno de Annotix está instalado.
#[cfg(test)]
pub fn tests_python() -> Option<std::path::PathBuf> {
    if let Ok(p) = std::env::var("ANNOTIX_TEST_PYTHON") {
        let p = std::path::PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from)?;
    let venv = home.join(".local/share/annotix/python-env/bin/python");
    venv.exists().then_some(venv)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base<'a>() -> Entrypoint<'a> {
        Entrypoint {
            package_location: "/kaggle/input/ds",
            workdir: "/kaggle/working/pkg",
            upload_cmd: None,
            results_uri: None,
        }
    }

    #[test]
    fn el_entrypoint_no_menciona_ningun_backend() {
        // El objetivo del módulo: la nube ya no sabe de YOLO ni de ningún otro.
        let script = entrypoint_python(&base());
        for prohibido in ["ultralytics", "YOLO(", "yolov8", "data.yaml"] {
            assert!(
                !script.contains(prohibido),
                "el entrypoint no debe mencionar {prohibido}"
            );
        }
    }

    #[test]
    fn ejecuta_el_train_py_del_paquete() {
        let script = entrypoint_python(&base());
        assert!(script.contains("train.py"));
        assert!(script.contains("requirements.txt"));
        assert!(script.contains("/kaggle/input/ds"));
    }

    #[test]
    fn sin_destino_reporta_el_zip_local() {
        let script = entrypoint_python(&base());
        assert!(script.contains(r#"emitir({"type": "artifact", "uri": zip_resultados})"#));
    }

    #[test]
    fn con_destino_publica_y_reporta_la_uri() {
        let ep = Entrypoint {
            package_location: "/content/paquete.zip",
            workdir: "/content/pkg",
            upload_cmd: Some("gsutil cp {src} {dest}"),
            results_uri: Some("gs://bucket/results/abc/results.zip"),
        };
        let script = entrypoint_python(&ep);
        assert!(script.contains("gsutil cp {src} {dest}"));
        assert!(script.contains("gs://bucket/results/abc/results.zip"));
    }

    #[test]
    fn es_python_valido() {
        // Sin intérprete disponible la comprobación se salta; con él, cubre que las
        // llaves de los format! quedaron bien escapadas.
        let Some(python) = crate::training::cloud::script::tests_python() else {
            return;
        };
        let tmp = tempfile::tempdir().unwrap();
        let archivo = tmp.path().join("entrypoint.py");
        std::fs::write(&archivo, entrypoint_python(&base())).unwrap();
        let salida = std::process::Command::new(python)
            .args(["-m", "py_compile"])
            .arg(&archivo)
            .output()
            .expect("py_compile");
        assert!(
            salida.status.success(),
            "{}",
            String::from_utf8_lossy(&salida.stderr)
        );
    }
}
