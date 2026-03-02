use super::{
    AutomationRequest, AutomationResult, AutomationSession, AutomationStep, BrowserProvider,
    BrowserRunner, StepState,
};
use headless_chrome::Tab;
use std::time::Duration;

pub struct LlmChatRunner {
    provider: BrowserProvider,
    result: Option<AutomationResult>,
    selectors: super::selectors::SelectorRegistry,
}

impl LlmChatRunner {
    pub fn new(provider: BrowserProvider) -> Self {
        let selectors_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default()
            .join("selectors");

        let selectors_dir = if selectors_dir.exists() {
            selectors_dir
        } else {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("selectors")
        };

        Self {
            provider,
            result: None,
            selectors: super::selectors::SelectorRegistry::load(&selectors_dir),
        }
    }
}

impl BrowserRunner for LlmChatRunner {
    fn define_steps(&self, _request: &AutomationRequest) -> Vec<AutomationStep> {
        vec![
            AutomationStep {
                id: "open_llm".into(),
                name: "automation.llm.steps.openLlm".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "login".into(),
                name: "automation.llm.steps.login".into(),
                state: StepState::Pending,
                requires_user: true,
                user_instruction: Some("automation.instructions.login".into()),
                progress: 0.0,
            },
            AutomationStep {
                id: "new_conversation".into(),
                name: "automation.llm.steps.newConversation".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "send_prompt".into(),
                name: "automation.llm.steps.sendPrompt".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "wait_response".into(),
                name: "automation.llm.steps.waitResponse".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "extract_response".into(),
                name: "automation.llm.steps.extractResponse".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
        ]
    }

    fn execute_step(
        &mut self,
        step_index: usize,
        session: &AutomationSession,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        match step_index {
            0 => self.step_open_llm(tab, emitter),
            1 => {
                emitter("Esperando que el usuario inicie sesión...");
                Ok(false)
            }
            2 => self.step_new_conversation(tab, emitter),
            3 => self.step_send_prompt(tab, session, emitter),
            4 => self.step_wait_response(tab, emitter),
            5 => self.step_extract_response(tab, emitter),
            _ => Err("Paso no válido".into()),
        }
    }

    fn check_user_step_completed(
        &self,
        step_index: usize,
        tab: &Tab,
    ) -> Result<bool, String> {
        match step_index {
            1 => {
                // Verificar login: buscar el selector de login_check
                if let Some(check) = self.selectors.get_login_check(&self.provider) {
                    match tab.wait_for_element_with_custom_timeout(
                        check,
                        Duration::from_millis(1000),
                    ) {
                        Ok(_) => Ok(true),
                        Err(_) => Ok(false),
                    }
                } else {
                    // Si no hay login_check, asumir que el login no es necesario
                    Ok(true)
                }
            }
            _ => Ok(true),
        }
    }

    fn get_result(&self) -> Option<AutomationResult> {
        self.result.clone()
    }
}

// ─── Implementación de pasos ────────────────────────────────────────────────

impl LlmChatRunner {
    fn step_open_llm(
        &self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        let url = self
            .selectors
            .get_url(&self.provider)
            .unwrap_or(match self.provider {
                BrowserProvider::Kimi => "https://kimi.moonshot.cn/",
                BrowserProvider::Qwen => "https://chat.qwen.ai/",
                BrowserProvider::DeepSeek => "https://chat.deepseek.com/",
                BrowserProvider::HuggingChat => "https://huggingface.co/chat/",
                _ => return Err("Proveedor no soportado para LLM".into()),
            });

        emitter(&format!("Navegando a {}...", url));
        tab.navigate_to(url)
            .map_err(|e| format!("Error navegando: {}", e))?;
        std::thread::sleep(Duration::from_secs(3));
        emitter("Página cargada.");
        Ok(true)
    }

    fn step_new_conversation(
        &self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Creando nueva conversación...");

        if let Some(selector) = self.selectors.get(&self.provider, "new_chat") {
            match super::selectors::find_element_with_fallback(tab, selector) {
                Ok(el) => {
                    el.click()
                        .map_err(|e| format!("Error click new chat: {}", e))?;
                    std::thread::sleep(Duration::from_secs(1));
                    emitter("Nueva conversación creada.");
                    return Ok(true);
                }
                Err(_) => {
                    emitter("No se encontró botón de nueva conversación. Continuando con la actual.");
                }
            }
        }

        Ok(true)
    }

    fn step_send_prompt(
        &self,
        tab: &Tab,
        _session: &AutomationSession,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Enviando prompt...");

        // Buscar el textarea del chat
        let chat_input = self
            .selectors
            .get(&self.provider, "chat_input")
            .ok_or("No se encontró selector de chat_input")?;

        let _input_el = super::selectors::find_element_with_fallback(tab, chat_input)
            .map_err(|e| format!("No se encontró campo de chat: {}", e))?;

        // TODO: usar el prompt real del AutomationRequest
        // Por ahora usar un placeholder
        let prompt = "Hello, I'm using Annotix for ML dataset annotation. Can you help me?";

        // Escribir el prompt usando JavaScript para manejar textareas React
        let escaped_prompt = prompt.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "\\n");
        let js = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) return 'not_found';
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(el, '{}');
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                return 'ok';
            }})()
            "#,
            chat_input.css.replace('\'', "\\'"),
            escaped_prompt
        );

        tab.evaluate(&js, false)
            .map_err(|e| format!("Error escribiendo prompt: {}", e))?;

        std::thread::sleep(Duration::from_millis(500));

        // Click en botón enviar
        if let Some(send_selector) = self.selectors.get(&self.provider, "send_button") {
            match super::selectors::find_element_with_fallback(tab, send_selector) {
                Ok(el) => {
                    el.click()
                        .map_err(|e| format!("Error click send: {}", e))?;
                }
                Err(_) => {
                    // Fallback: enviar con Enter
                    let enter_js = format!(
                        r#"
                        document.querySelector('{}').dispatchEvent(
                            new KeyboardEvent('keydown', {{ key: 'Enter', code: 'Enter', bubbles: true }})
                        );
                        "#,
                        chat_input.css.replace('\'', "\\'")
                    );
                    tab.evaluate(&enter_js, false)
                        .map_err(|e| format!("Error enviando con Enter: {}", e))?;
                }
            }
        }

        emitter("Prompt enviado.");
        Ok(true)
    }

    fn step_wait_response(
        &self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Esperando respuesta del LLM...");

        let typing_selector = self.selectors.get(&self.provider, "typing_indicator");
        let max_wait = 120; // 2 minutos
        let mut elapsed = 0;

        // Primero esperar a que aparezca el indicador de typing
        std::thread::sleep(Duration::from_secs(2));

        // Luego esperar a que desaparezca
        while elapsed < max_wait {
            std::thread::sleep(Duration::from_secs(2));
            elapsed += 2;

            if let Some(selector) = typing_selector {
                match tab.wait_for_element_with_custom_timeout(
                    &selector.css,
                    Duration::from_millis(500),
                ) {
                    Ok(_) => {
                        // Todavía generando
                        if elapsed % 10 == 0 {
                            emitter("LLM generando respuesta...");
                        }
                        continue;
                    }
                    Err(_) => {
                        // Ya no está generando — verificar si hay respuesta
                        if elapsed > 4 {
                            emitter("Respuesta recibida.");
                            return Ok(true);
                        }
                    }
                }
            } else {
                // Sin typing_indicator, esperar un tiempo fijo
                if elapsed >= 10 {
                    emitter("Respuesta recibida (estimada).");
                    return Ok(true);
                }
            }
        }

        Err("Timeout esperando respuesta del LLM.".into())
    }

    fn step_extract_response(
        &mut self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Extrayendo respuesta...");

        let last_message = self.selectors.get(&self.provider, "last_message");

        let response = if let Some(selector) = last_message {
            // Intentar selector principal
            let js = format!(
                r#"
                (function() {{
                    const el = document.querySelector('{}');
                    if (el) return el.innerText;
                    const fallback = document.querySelector('{}');
                    if (fallback) return fallback.innerText;
                    return '';
                }})()
                "#,
                selector.css.replace('\'', "\\'"),
                selector.fallback.as_deref().unwrap_or("").replace('\'', "\\'")
            );

            tab.evaluate(&js, false)
                .map_err(|e| format!("Error extrayendo respuesta: {}", e))?
                .value
                .as_ref()
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            // Fallback genérico: último elemento con clase de mensaje
            let js = r#"
                (function() {
                    const msgs = document.querySelectorAll('[class*="message"]');
                    if (msgs.length > 0) return msgs[msgs.length - 1].innerText;
                    return '';
                })()
            "#;

            tab.evaluate(js, false)
                .map_err(|e| format!("Error extrayendo respuesta: {}", e))?
                .value
                .as_ref()
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        };

        if response.is_empty() {
            return Err("No se pudo extraer la respuesta del LLM.".into());
        }

        emitter(&format!(
            "Respuesta extraída ({} caracteres).",
            response.len()
        ));

        self.result = Some(AutomationResult::LlmResponse { text: response });
        Ok(true)
    }
}
