use std::path::PathBuf;
use std::process::Command;
use std::fs;
use std::io::Write;

/// Tipo de gestor de entornos conda detectado
#[derive(Clone, Copy, PartialEq)]
enum CondaBackend {
    /// micromamba del sistema o descargado
    Micromamba,
    /// mamba del sistema
    Mamba,
    /// conda del sistema
    Conda,
}

pub struct Micromamba {
    bin_path: PathBuf,
    root_prefix: PathBuf,
    /// true si usamos un binario del sistema (no necesita descarga ni -r)
    system: bool,
    backend: CondaBackend,
}

impl Micromamba {
    pub fn new() -> Result<Self, String> {
        // 1. Buscar en el sistema: micromamba > mamba > conda
        if let Some((path, backend)) = find_system_conda() {
            let base_dir = directories::ProjectDirs::from("com", "tecmedhub", "annotix")
                .ok_or("No se pudo determinar el directorio de datos")?;
            let root_prefix = base_dir.data_dir().join("micromamba");
            if !root_prefix.exists() {
                fs::create_dir_all(&root_prefix).map_err(|e| e.to_string())?;
            }
            return Ok(Self {
                bin_path: PathBuf::from(path),
                root_prefix,
                system: true,
                backend,
            });
        }

        // 2. Fallback: micromamba descargado por nosotros
        let base_dir = directories::ProjectDirs::from("com", "tecmedhub", "annotix")
            .ok_or("No se pudo determinar el directorio de datos")?;

        let data_dir = base_dir.data_dir();
        let bin_dir = data_dir.join("bin");
        let root_prefix = data_dir.join("micromamba");

        if !bin_dir.exists() { fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?; }
        if !root_prefix.exists() { fs::create_dir_all(&root_prefix).map_err(|e| e.to_string())?; }

        let bin_name = if cfg!(target_os = "windows") { "micromamba.exe" } else { "micromamba" };
        let bin_path = bin_dir.join(bin_name);

        Ok(Self { bin_path, root_prefix, system: false, backend: CondaBackend::Micromamba })
    }

    pub fn is_installed(&self) -> bool {
        if self.system {
            return true;
        }
        self.bin_path.exists()
    }

    pub async fn download<F: Fn(&str, f64)>(&self, emit_progress: F) -> Result<(), String> {
        if self.system {
            return Ok(()); // nada que descargar
        }

        emit_progress("Descargando Micromamba...", 10.0);

        let arch = if cfg!(target_arch = "x86_64") { "64" } else { "arm64" };
        let os = if cfg!(target_os = "windows") { "win" }
                 else if cfg!(target_os = "macos") { "osx" }
                 else { "linux" };

        let url = format!("https://micro.mamba.pm/api/micromamba/{}-{}/latest", os, arch);

        let response = reqwest::get(&url).await.map_err(|e| format!("Fallo al descargar: {}", e))?;
        let bytes = response.bytes().await.map_err(|e| format!("Error de red: {}", e))?;

        emit_progress("Extrayendo binario...", 60.0);

        // La API devuelve un .tar.bz2 — hay que extraer bin/micromamba del tarball
        let bin_dir = self.bin_path.parent()
            .ok_or("No se pudo determinar directorio del binario")?;
        let tarball_path = bin_dir.join("micromamba.tar.bz2");

        // Guardar tarball temporal
        {
            let mut file = fs::File::create(&tarball_path).map_err(|e| e.to_string())?;
            file.write_all(&bytes).map_err(|e| e.to_string())?;
        }

        // Extraer el binario del tarball
        #[cfg(unix)]
        {
            let output = Command::new("tar")
                .args(["xjf", &tarball_path.to_string_lossy(), "-C", &bin_dir.to_string_lossy(), "bin/micromamba"])
                .output()
                .map_err(|e| format!("Error ejecutando tar: {}", e))?;

            if !output.status.success() {
                let _ = fs::remove_file(&tarball_path);
                return Err(format!(
                    "Error extrayendo micromamba: {}",
                    String::from_utf8_lossy(&output.stderr)
                ));
            }

            // tar extrae a bin_dir/bin/micromamba, mover a bin_dir/micromamba
            let extracted = bin_dir.join("bin").join("micromamba");
            if extracted.exists() {
                fs::rename(&extracted, &self.bin_path).map_err(|e| e.to_string())?;
                let _ = fs::remove_dir(bin_dir.join("bin"));
            }

            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&self.bin_path).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&self.bin_path, perms).map_err(|e| e.to_string())?;
        }

        #[cfg(windows)]
        {
            let output = Command::new("tar")
                .args(["xjf", &tarball_path.to_string_lossy(), "-C", &bin_dir.to_string_lossy(), "Library/bin/micromamba.exe"])
                .output()
                .map_err(|e| format!("Error ejecutando tar: {}", e))?;

            if !output.status.success() {
                let _ = fs::remove_file(&tarball_path);
                return Err(format!(
                    "Error extrayendo micromamba: {}",
                    String::from_utf8_lossy(&output.stderr)
                ));
            }

            let extracted = bin_dir.join("Library").join("bin").join("micromamba.exe");
            if extracted.exists() {
                fs::rename(&extracted, &self.bin_path).map_err(|e| e.to_string())?;
                let _ = fs::remove_dir_all(bin_dir.join("Library"));
            }
        }

        let _ = fs::remove_file(&tarball_path);

        emit_progress("Micromamba listo", 100.0);
        Ok(())
    }

    pub fn create_env<F: Fn(&str, f64, Option<String>)>(
        &self,
        env_path: &PathBuf,
        python_version: &str,
        emit_feedback: &F
    ) -> Result<(), String> {
        let mut cmd = Command::new(&self.bin_path);

        match self.backend {
            CondaBackend::Micromamba => {
                cmd.args([
                    "create",
                    "-y",
                    "-c", "conda-forge",
                    "-p", &env_path.to_string_lossy(),
                    "-r", &self.root_prefix.to_string_lossy(),
                    &format!("python={}", python_version),
                    "pip",
                ]);
            }
            CondaBackend::Mamba | CondaBackend::Conda => {
                cmd.args([
                    "create",
                    "-y",
                    "-c", "conda-forge",
                    "-p", &env_path.to_string_lossy(),
                    &format!("python={}", python_version),
                    "pip",
                ]);
            }
        }

        crate::training::python_env::run_with_feedback(
            cmd,
            &format!("Creando entorno (Python {})", python_version),
            10.0, 80.0, emit_feedback
        )
    }
}

/// Busca micromamba, mamba o conda — primero en PATH, luego en rutas comunes
fn find_system_conda() -> Option<(String, CondaBackend)> {
    let candidates: &[(&str, CondaBackend)] = &[
        ("micromamba", CondaBackend::Micromamba),
        ("mamba", CondaBackend::Mamba),
        ("conda", CondaBackend::Conda),
    ];

    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };

    // 1. Buscar en PATH
    for &(name, backend) in candidates {
        let cmd_name = format!("{}{}", name, ext);
        let mut cmd = Command::new(&cmd_name);
        cmd.args(["--version"]);
        super::hide_console_window(&mut cmd);
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                return Some((cmd_name, backend));
            }
        }
    }

    // 2. Apps GUI no heredan el PATH completo — buscar en rutas comunes
    let home = if cfg!(target_os = "windows") {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    } else {
        std::env::var_os("HOME").map(PathBuf::from)
    }?;
    #[cfg(not(windows))]
    let well_known: Vec<(PathBuf, CondaBackend)> = vec![
        // micromamba
        (home.join(".local/bin/micromamba"), CondaBackend::Micromamba),
        (home.join("micromamba/bin/micromamba"), CondaBackend::Micromamba),
        (home.join("bin/micromamba"), CondaBackend::Micromamba),
        // mamba (mambaforge / miniforge)
        (home.join("mambaforge/bin/mamba"), CondaBackend::Mamba),
        (home.join("miniforge3/bin/mamba"), CondaBackend::Mamba),
        (home.join("miniforge/bin/mamba"), CondaBackend::Mamba),
        // conda (miniconda / anaconda)
        (home.join("miniconda3/bin/conda"), CondaBackend::Conda),
        (home.join("miniconda/bin/conda"), CondaBackend::Conda),
        (home.join("anaconda3/bin/conda"), CondaBackend::Conda),
        (home.join("anaconda/bin/conda"), CondaBackend::Conda),
        // rutas comunes en macOS (brew)
        (PathBuf::from("/opt/homebrew/bin/micromamba"), CondaBackend::Micromamba),
        (PathBuf::from("/usr/local/bin/micromamba"), CondaBackend::Micromamba),
    ];

    #[cfg(windows)]
    let well_known: Vec<(PathBuf, CondaBackend)> = {
        let mut paths = vec![];
        if let Some(userprofile) = std::env::var_os("USERPROFILE") {
            let u = PathBuf::from(userprofile);
            paths.push((u.join("micromamba/micromamba.exe"), CondaBackend::Micromamba));
            paths.push((u.join("mambaforge/Scripts/mamba.exe"), CondaBackend::Mamba));
            paths.push((u.join("miniforge3/Scripts/mamba.exe"), CondaBackend::Mamba));
            paths.push((u.join("miniconda3/Scripts/conda.exe"), CondaBackend::Conda));
            paths.push((u.join("anaconda3/Scripts/conda.exe"), CondaBackend::Conda));
        }
        if let Some(localappdata) = std::env::var_os("LOCALAPPDATA") {
            let l = PathBuf::from(localappdata);
            paths.push((l.join("micromamba/micromamba.exe"), CondaBackend::Micromamba));
        }
        paths
    };

    for (path, backend) in &well_known {
        if path.is_file() {
            let mut cmd = Command::new(path);
            cmd.args(["--version"]);
            super::hide_console_window(&mut cmd);
            if let Ok(output) = cmd.output() {
                if output.status.success() {
                    return Some((path.to_string_lossy().to_string(), *backend));
                }
            }
        }
    }

    None
}
