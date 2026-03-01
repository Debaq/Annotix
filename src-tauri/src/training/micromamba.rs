use std::path::PathBuf;
use std::process::Command;
use std::fs;
use std::io::Write;

pub struct Micromamba {
    bin_path: PathBuf,
    root_prefix: PathBuf,
}

impl Micromamba {
    pub fn new() -> Result<Self, String> {
        let base_dir = directories::ProjectDirs::from("com", "tecmedhub", "annotix")
            .ok_or("No se pudo determinar el directorio de datos")?;
        
        let data_dir = base_dir.data_dir();
        let bin_dir = data_dir.join("bin");
        let root_prefix = data_dir.join("micromamba");
        
        if !bin_dir.exists() { fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?; }
        if !root_prefix.exists() { fs::create_dir_all(&root_prefix).map_err(|e| e.to_string())?; }

        let bin_name = if cfg!(target_os = "windows") { "micromamba.exe" } else { "micromamba" };
        let bin_path = bin_dir.join(bin_name);

        Ok(Self { bin_path, root_prefix })
    }

    pub fn is_installed(&self) -> bool {
        self.bin_path.exists()
    }

    pub async fn download<F: Fn(&str, f64)>(&self, emit_progress: F) -> Result<(), String> {
        emit_progress("Descargando Micromamba...", 10.0);

        let arch = if cfg!(target_arch = "x86_64") { "64" } else { "arm64" };
        let os = if cfg!(target_os = "windows") { "win" } 
                 else if cfg!(target_os = "macos") { "osx" } 
                 else { "linux" };
        
        let url = format!("https://micro.mamba.pm/api/micromamba/{}-{}/latest", os, arch);
        
        let response = reqwest::get(url).await.map_err(|e| format!("Fallo al descargar: {}", e))?;
        let bytes = response.bytes().await.map_err(|e| format!("Error de red: {}", e))?;

        let mut file = fs::File::create(&self.bin_path).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&self.bin_path).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&self.bin_path, perms).map_err(|e| e.to_string())?;
        }

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
        cmd.args([
            "create", 
            "-y", 
            "-p", &env_path.to_string_lossy(),
            "-r", &self.root_prefix.to_string_lossy(),
            &format!("python={}", python_version),
            "pip",
        ]);

        crate::training::python_env::run_with_feedback(
            cmd, 
            &format!("Creando entorno (Python {})", python_version), 
            10.0, 80.0, emit_feedback
        )
    }
}
