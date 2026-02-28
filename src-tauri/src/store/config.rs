use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub projects_dir: Option<PathBuf>,
}

impl AppConfig {
    pub fn config_path(data_dir: &PathBuf) -> PathBuf {
        data_dir.join("config.json")
    }

    pub fn load(data_dir: &PathBuf) -> Self {
        let path = Self::config_path(data_dir);
        if path.exists() {
            match std::fs::read_to_string(&path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => Self::default(),
            }
        } else {
            Self::default()
        }
    }

    pub fn save(&self, data_dir: &PathBuf) -> Result<(), String> {
        let path = Self::config_path(data_dir);
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Error serializando config: {}", e))?;
        std::fs::write(&path, content)
            .map_err(|e| format!("Error escribiendo config: {}", e))?;
        Ok(())
    }
}
