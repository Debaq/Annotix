pub mod browser_detect;
pub mod browser_session;
pub mod selectors;
pub mod step_engine;
pub mod colab_free;
pub mod llm_chat;
pub mod providers;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// ─── Enums de estado ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StepState {
    Pending,
    Running,
    WaitingUser,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Idle,
    DetectingBrowser,
    LaunchingBrowser,
    WaitingLogin,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BrowserProvider {
    ColabFree,
    Kimi,
    Qwen,
    DeepSeek,
    HuggingChat,
}

// ─── Tipos principales ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationStep {
    pub id: String,
    pub name: String,
    pub state: StepState,
    #[serde(rename = "requiresUser")]
    pub requires_user: bool,
    #[serde(rename = "userInstruction", skip_serializing_if = "Option::is_none")]
    pub user_instruction: Option<String>,
    pub progress: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationSession {
    pub id: String,
    pub state: SessionState,
    pub provider: BrowserProvider,
    pub steps: Vec<AutomationStep>,
    #[serde(rename = "currentStepIndex")]
    pub current_step_index: usize,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AutomationResult {
    ModelDownloaded { path: String },
    LlmResponse { text: String },
}

// ─── Request ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationRequest {
    pub provider: BrowserProvider,
    #[serde(rename = "projectId", skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(rename = "trainingJobId", skip_serializing_if = "Option::is_none")]
    pub training_job_id: Option<String>,
    /// Para Colab: parámetros de training
    #[serde(rename = "trainingParams", skip_serializing_if = "Option::is_none")]
    pub training_params: Option<serde_json::Value>,
    /// Para LLM: prompt a enviar
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// Ruta del dataset zip (para Colab)
    #[serde(rename = "datasetPath", skip_serializing_if = "Option::is_none")]
    pub dataset_path: Option<String>,
    /// Ruta del navegador elegido
    #[serde(rename = "browserPath", skip_serializing_if = "Option::is_none")]
    pub browser_path: Option<String>,
}

// ─── Detección de navegadores ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedBrowser {
    pub name: String,
    pub path: String,
    pub version: Option<String>,
}

// ─── Trait BrowserRunner ────────────────────────────────────────────────────

pub trait BrowserRunner: Send {
    fn define_steps(&self, request: &AutomationRequest) -> Vec<AutomationStep>;

    fn execute_step(
        &mut self,
        step_index: usize,
        session: &AutomationSession,
        tab: &headless_chrome::Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String>;

    fn check_user_step_completed(
        &self,
        step_index: usize,
        tab: &headless_chrome::Tab,
    ) -> Result<bool, String>;

    fn get_result(&self) -> Option<AutomationResult>;
}

// ─── ActiveBrowserSession ───────────────────────────────────────────────────

pub struct ActiveBrowserSession {
    pub session: AutomationSession,
    pub cancelled: Arc<Mutex<bool>>,
    pub paused: Arc<Mutex<bool>>,
    pub browser: Option<headless_chrome::Browser>,
}

// ─── BrowserAutomationManager ───────────────────────────────────────────────

pub struct BrowserAutomationManager {
    pub active_sessions: Arc<Mutex<HashMap<String, ActiveBrowserSession>>>,
}

impl BrowserAutomationManager {
    pub fn new() -> Self {
        Self {
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_automation(
        &self,
        app: &tauri::AppHandle,
        request: AutomationRequest,
        auto_config: crate::store::config::BrowserAutomationConfig,
    ) -> Result<String, String> {
        let session_id = uuid::Uuid::new_v4().to_string();

        // Detectar navegador: request > config > auto-detect
        let browser_path = if let Some(ref path) = request.browser_path {
            path.clone()
        } else if let Some(ref path) = auto_config.preferred_browser_path {
            path.clone()
        } else {
            let browsers = browser_detect::detect_browsers();
            if browsers.is_empty() {
                return Err("No se encontró ningún navegador Chromium instalado".into());
            }
            browsers[0].path.clone()
        };

        // Crear runner según provider
        let runner: Box<dyn BrowserRunner> = match request.provider {
            BrowserProvider::ColabFree => Box::new(colab_free::ColabFreeRunner::new()),
            _ => Box::new(llm_chat::LlmChatRunner::new(request.provider.clone())),
        };

        let steps = runner.define_steps(&request);

        let session = AutomationSession {
            id: session_id.clone(),
            state: SessionState::LaunchingBrowser,
            provider: request.provider.clone(),
            steps,
            current_step_index: 0,
            logs: vec![],
        };

        let cancelled = Arc::new(Mutex::new(false));
        let paused = Arc::new(Mutex::new(false));

        {
            let mut sessions = self.active_sessions.lock().map_err(|e| e.to_string())?;
            sessions.insert(
                session_id.clone(),
                ActiveBrowserSession {
                    session: session.clone(),
                    cancelled: cancelled.clone(),
                    paused: paused.clone(),
                    browser: None,
                },
            );
        }

        // Emitir estado inicial
        let _ = app.emit("automation:session-update", &session);

        // Lanzar thread de ejecución
        let app_handle = app.clone();
        let sessions_ref = self.active_sessions.clone();
        let sid = session_id.clone();

        std::thread::spawn(move || {
            step_engine::run_automation(
                app_handle,
                sessions_ref,
                sid,
                browser_path,
                request,
                runner,
                cancelled,
                paused,
                auto_config,
            );
        });

        Ok(session_id)
    }

    pub fn pause(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.active_sessions.lock().map_err(|e| e.to_string())?;
        if let Some(s) = sessions.get(session_id) {
            *s.paused.lock().map_err(|e| e.to_string())? = true;
            Ok(())
        } else {
            Err("Sesión no encontrada".into())
        }
    }

    pub fn resume(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.active_sessions.lock().map_err(|e| e.to_string())?;
        if let Some(s) = sessions.get(session_id) {
            *s.paused.lock().map_err(|e| e.to_string())? = false;
            Ok(())
        } else {
            Err("Sesión no encontrada".into())
        }
    }

    pub fn cancel(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.active_sessions.lock().map_err(|e| e.to_string())?;
        if let Some(s) = sessions.get(session_id) {
            *s.cancelled.lock().map_err(|e| e.to_string())? = true;
            Ok(())
        } else {
            Err("Sesión no encontrada".into())
        }
    }

    pub fn get_session(&self, session_id: &str) -> Option<AutomationSession> {
        let sessions = self.active_sessions.lock().ok()?;
        sessions.get(session_id).map(|s| s.session.clone())
    }
}

use tauri::Emitter;
