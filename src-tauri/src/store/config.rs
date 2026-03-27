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
pub struct LightningAiConfig {
    #[serde(default, rename = "apiKey")]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HuggingFaceConfig {
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SaturnCloudConfig {
    #[serde(default, rename = "apiToken")]
    pub api_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudProviderConfig {
    #[serde(default)]
    pub gcp: Option<GcpConfig>,
    #[serde(default)]
    pub kaggle: Option<KaggleConfig>,
    #[serde(default)]
    pub lightning_ai: Option<LightningAiConfig>,
    #[serde(default)]
    pub huggingface: Option<HuggingFaceConfig>,
    #[serde(default)]
    pub saturn_cloud: Option<SaturnCloudConfig>,
}

fn default_step_timeout_ms() -> u64 { 5000 }
fn default_max_retries() -> u32 { 2 }
fn default_user_action_timeout_secs() -> u64 { 300 }
fn default_llm_response_timeout_secs() -> u64 { 120 }
fn default_window_width() -> u32 { 1280 }
fn default_window_height() -> u32 { 900 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAutomationConfig {
    #[serde(default)]
    pub preferred_browser_path: Option<String>,
    #[serde(default)]
    pub preferred_browser_name: Option<String>,
    #[serde(default)]
    pub default_provider: Option<String>,
    #[serde(default = "default_step_timeout_ms")]
    pub step_timeout_ms: u64,
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    #[serde(default = "default_user_action_timeout_secs")]
    pub user_action_timeout_secs: u64,
    #[serde(default = "default_llm_response_timeout_secs")]
    pub llm_response_timeout_secs: u64,
    #[serde(default)]
    pub user_data_dir: Option<String>,
    #[serde(default = "default_window_width")]
    pub window_width: u32,
    #[serde(default = "default_window_height")]
    pub window_height: u32,
}

impl Default for BrowserAutomationConfig {
    fn default() -> Self {
        Self {
            preferred_browser_path: None,
            preferred_browser_name: None,
            default_provider: None,
            step_timeout_ms: default_step_timeout_ms(),
            max_retries: default_max_retries(),
            user_action_timeout_secs: default_user_action_timeout_secs(),
            llm_response_timeout_secs: default_llm_response_timeout_secs(),
            user_data_dir: None,
            window_width: default_window_width(),
            window_height: default_window_height(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LlmConfig {
    /// "openai" | "anthropic" | "openai-compatible"
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    /// Solo para openai-compatible: URL base del servidor
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub projects_dir: Option<PathBuf>,
    #[serde(default)]
    pub cloud_providers: CloudProviderConfig,
    #[serde(default)]
    pub browser_automation: BrowserAutomationConfig,
    #[serde(default)]
    pub llm: Option<LlmConfig>,
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
