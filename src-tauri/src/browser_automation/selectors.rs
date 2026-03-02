use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

use super::BrowserProvider;

// ─── Tipos TOML ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderConfig {
    #[allow(dead_code)]
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub login_check: Option<String>,
    #[serde(default)]
    pub selectors: HashMap<String, SelectorEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SelectorEntry {
    pub css: String,
    #[serde(default)]
    pub fallback: Option<String>,
    #[serde(default = "default_timeout")]
    pub wait_timeout_ms: u64,
    #[serde(default)]
    pub description: Option<String>,
}

fn default_timeout() -> u64 {
    5000
}

// ─── SelectorRegistry ───────────────────────────────────────────────────────

pub struct SelectorRegistry {
    providers: HashMap<String, ProviderConfig>,
}

impl SelectorRegistry {
    /// Carga todos los archivos TOML de selectores desde el directorio dado.
    pub fn load(selectors_dir: &Path) -> Self {
        let mut providers = HashMap::new();

        let files = [
            ("colab_free", "colab_free.toml"),
            ("kimi", "kimi.toml"),
            ("qwen", "qwen.toml"),
            ("deepseek", "deepseek.toml"),
            ("huggingchat", "huggingchat.toml"),
        ];

        for (key, filename) in &files {
            let path = selectors_dir.join(filename);
            if let Ok(contents) = std::fs::read_to_string(&path) {
                match toml::from_str::<ProviderConfig>(&contents) {
                    Ok(config) => {
                        providers.insert(key.to_string(), config);
                    }
                    Err(e) => {
                        log::warn!("Error parseando {}: {}", filename, e);
                    }
                }
            }
        }

        Self { providers }
    }

    /// Obtiene un selector específico para un proveedor.
    pub fn get(&self, provider: &BrowserProvider, key: &str) -> Option<&SelectorEntry> {
        let provider_key = provider_to_key(provider);
        self.providers
            .get(provider_key)
            .and_then(|config| config.selectors.get(key))
    }

    /// Obtiene la configuración completa de un proveedor.
    pub fn get_provider(&self, provider: &BrowserProvider) -> Option<&ProviderConfig> {
        let provider_key = provider_to_key(provider);
        self.providers.get(provider_key)
    }

    /// Obtiene la URL principal del proveedor.
    pub fn get_url(&self, provider: &BrowserProvider) -> Option<&str> {
        self.get_provider(provider).map(|c| c.url.as_str())
    }

    /// Obtiene el selector de verificación de login.
    pub fn get_login_check(&self, provider: &BrowserProvider) -> Option<&str> {
        self.get_provider(provider)
            .and_then(|c| c.login_check.as_deref())
    }
}

fn provider_to_key(provider: &BrowserProvider) -> &str {
    match provider {
        BrowserProvider::ColabFree => "colab_free",
        BrowserProvider::Kimi => "kimi",
        BrowserProvider::Qwen => "qwen",
        BrowserProvider::DeepSeek => "deepseek",
        BrowserProvider::HuggingChat => "huggingchat",
    }
}

/// Busca el selector CSS con fallback.
pub fn find_element_with_fallback<'a>(
    tab: &'a headless_chrome::Tab,
    entry: &SelectorEntry,
) -> Result<headless_chrome::Element<'a>, String> {
    let timeout = std::time::Duration::from_millis(entry.wait_timeout_ms);

    // Intentar selector principal
    match tab.wait_for_element_with_custom_timeout(&entry.css, timeout) {
        Ok(el) => return Ok(el),
        Err(_) => {}
    }

    // Intentar fallback
    if let Some(ref fallback) = entry.fallback {
        match tab.wait_for_element_with_custom_timeout(fallback, timeout) {
            Ok(el) => return Ok(el),
            Err(_) => {}
        }
    }

    Err(format!(
        "No se encontró elemento: {} ({})",
        entry.css,
        entry.description.as_deref().unwrap_or("sin descripción")
    ))
}
