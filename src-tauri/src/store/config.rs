use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GcpConfig {
    #[serde(default, rename = "serviceAccountPath")]
    pub service_account_path: Option<String>,
    #[serde(default, rename = "projectId")]
    pub project_id: Option<String>,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default, rename = "gcsBucket")]
    pub gcs_bucket: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KaggleConfig {
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default, rename = "apiKey")]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudProviderConfig {
    #[serde(default)]
    pub gcp: Option<GcpConfig>,
    #[serde(default)]
    pub kaggle: Option<KaggleConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub projects_dir: Option<PathBuf>,
    #[serde(default)]
    pub cloud_providers: CloudProviderConfig,
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
