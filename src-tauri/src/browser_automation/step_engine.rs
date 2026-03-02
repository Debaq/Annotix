use super::{
    browser_session, ActiveBrowserSession, AutomationRequest,
    BrowserRunner, SessionState, StepState,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

/// Motor principal que ejecuta los pasos de un runner de automatización.
pub fn run_automation(
    app: tauri::AppHandle,
    sessions: Arc<Mutex<HashMap<String, ActiveBrowserSession>>>,
    session_id: String,
    browser_path: String,
    request: AutomationRequest,
    mut runner: Box<dyn BrowserRunner>,
    cancelled: Arc<Mutex<bool>>,
    paused: Arc<Mutex<bool>>,
) {
    let emitter = |msg: &str| {
        let _ = app.emit(
            "automation:log",
            serde_json::json!({
                "sessionId": &session_id,
                "message": msg.to_string(),
            }),
        );
    };

    emitter("Lanzando navegador...");
    update_session_state(&sessions, &session_id, SessionState::LaunchingBrowser);
    emit_session_update(&app, &sessions, &session_id);

    // Lanzar navegador visible
    let browser = match browser_session::launch_visible_browser(&browser_path) {
        Ok(b) => b,
        Err(e) => {
            emitter(&format!("Error: {}", e));
            update_session_state(&sessions, &session_id, SessionState::Failed);
            emit_session_update(&app, &sessions, &session_id);
            let _ = app.emit(
                "automation:error",
                serde_json::json!({ "sessionId": &session_id, "error": e }),
            );
            return;
        }
    };

    let tab = match browser.new_tab() {
        Ok(t) => t,
        Err(e) => {
            let msg = format!("Error abriendo pestaña: {}", e);
            emitter(&msg);
            update_session_state(&sessions, &session_id, SessionState::Failed);
            emit_session_update(&app, &sessions, &session_id);
            return;
        }
    };

    // Guardar referencia al browser
    if let Ok(mut sess) = sessions.lock() {
        if let Some(active) = sess.get_mut(&session_id) {
            active.browser = Some(browser);
        }
    }

    update_session_state(&sessions, &session_id, SessionState::Running);
    emit_session_update(&app, &sessions, &session_id);
    emitter("Navegador lanzado. Iniciando automatización...");

    // Ejecutar pasos
    let step_count = runner.define_steps(&request).len();

    for step_idx in 0..step_count {
        // Comprobar cancelación
        if is_cancelled(&cancelled) {
            emitter("Automatización cancelada por el usuario.");
            update_session_state(&sessions, &session_id, SessionState::Cancelled);
            emit_session_update(&app, &sessions, &session_id);
            let _ = app.emit(
                "automation:cancelled",
                serde_json::json!({ "sessionId": &session_id }),
            );
            return;
        }

        // Comprobar pausa
        while is_paused(&paused) {
            if is_cancelled(&cancelled) {
                break;
            }
            update_session_state(&sessions, &session_id, SessionState::Paused);
            emit_session_update(&app, &sessions, &session_id);
            std::thread::sleep(Duration::from_millis(500));
        }

        // Re-check cancel after pause
        if is_cancelled(&cancelled) {
            emitter("Automatización cancelada por el usuario.");
            update_session_state(&sessions, &session_id, SessionState::Cancelled);
            emit_session_update(&app, &sessions, &session_id);
            return;
        }

        update_session_state(&sessions, &session_id, SessionState::Running);

        // Actualizar paso actual
        update_current_step(&sessions, &session_id, step_idx, StepState::Running);
        emit_session_update(&app, &sessions, &session_id);

        let step_name = {
            let sess = sessions.lock().ok();
            sess.and_then(|s| {
                s.get(&session_id)
                    .map(|a| a.session.steps[step_idx].name.clone())
            })
            .unwrap_or_default()
        };

        emitter(&format!("Paso {}/{}: {}", step_idx + 1, step_count, step_name));

        // Verificar si hay CAPTCHA antes de cada paso
        if detect_captcha(&tab) {
            emitter("CAPTCHA detectado. Por favor, resuélvelo manualmente.");
            update_current_step(&sessions, &session_id, step_idx, StepState::WaitingUser);
            update_user_instruction(
                &sessions,
                &session_id,
                step_idx,
                "Se ha detectado un CAPTCHA. Por favor, resuélvelo en el navegador.",
            );
            emit_session_update(&app, &sessions, &session_id);

            // Esperar a que el CAPTCHA desaparezca
            let mut captcha_timeout = 0;
            while detect_captcha(&tab) && captcha_timeout < 120 {
                if is_cancelled(&cancelled) {
                    break;
                }
                std::thread::sleep(Duration::from_secs(2));
                captcha_timeout += 2;
            }

            if is_cancelled(&cancelled) {
                continue;
            }
        }

        // Ejecutar el paso
        let mut retries = 0;
        let max_retries = 2;

        loop {
            // Obtener sesión actualizada para pasarla al runner
            let current_session = {
                sessions
                    .lock()
                    .ok()
                    .and_then(|s| s.get(&session_id).map(|a| a.session.clone()))
            };

            let session_ref = match current_session {
                Some(ref s) => s,
                None => break,
            };

            match runner.execute_step(step_idx, session_ref, &tab, &emitter) {
                Ok(true) => {
                    // Paso completado con éxito
                    update_current_step(
                        &sessions,
                        &session_id,
                        step_idx,
                        StepState::Completed,
                    );
                    emit_session_update(&app, &sessions, &session_id);
                    break;
                }
                Ok(false) => {
                    // Paso requiere acción del usuario (login, CAPTCHA, etc.)
                    update_current_step(
                        &sessions,
                        &session_id,
                        step_idx,
                        StepState::WaitingUser,
                    );
                    update_session_state(
                        &sessions,
                        &session_id,
                        SessionState::WaitingLogin,
                    );
                    emit_session_update(&app, &sessions, &session_id);

                    // Polling hasta que el usuario complete la acción
                    let mut poll_timeout = 0;
                    let max_poll_timeout = 300; // 5 minutos
                    loop {
                        if is_cancelled(&cancelled) {
                            break;
                        }

                        std::thread::sleep(Duration::from_secs(2));
                        poll_timeout += 2;

                        match runner.check_user_step_completed(step_idx, &tab) {
                            Ok(true) => {
                                emitter("Acción del usuario completada.");
                                update_current_step(
                                    &sessions,
                                    &session_id,
                                    step_idx,
                                    StepState::Completed,
                                );
                                update_session_state(
                                    &sessions,
                                    &session_id,
                                    SessionState::Running,
                                );
                                emit_session_update(&app, &sessions, &session_id);
                                break;
                            }
                            Ok(false) => {
                                if poll_timeout >= max_poll_timeout {
                                    emitter("Timeout esperando acción del usuario.");
                                    update_current_step(
                                        &sessions,
                                        &session_id,
                                        step_idx,
                                        StepState::Failed,
                                    );
                                    emit_session_update(&app, &sessions, &session_id);
                                    break;
                                }
                            }
                            Err(e) => {
                                emitter(&format!("Error verificando acción: {}", e));
                            }
                        }
                    }
                    break;
                }
                Err(e) => {
                    retries += 1;
                    if retries > max_retries {
                        emitter(&format!("Error en paso {} (tras {} reintentos): {}", step_name, max_retries, e));
                        update_current_step(
                            &sessions,
                            &session_id,
                            step_idx,
                            StepState::Failed,
                        );
                        update_session_state(&sessions, &session_id, SessionState::Failed);
                        emit_session_update(&app, &sessions, &session_id);
                        let _ = app.emit(
                            "automation:error",
                            serde_json::json!({
                                "sessionId": &session_id,
                                "error": e,
                                "step": step_idx,
                            }),
                        );
                        return;
                    }
                    emitter(&format!(
                        "Error en paso {} (reintento {}/{}): {}",
                        step_name, retries, max_retries, e
                    ));
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        }
    }

    // Completado
    if !is_cancelled(&cancelled) {
        update_session_state(&sessions, &session_id, SessionState::Completed);
        emit_session_update(&app, &sessions, &session_id);

        if let Some(result) = runner.get_result() {
            let _ = app.emit(
                "automation:completed",
                serde_json::json!({
                    "sessionId": &session_id,
                    "result": result,
                }),
            );
        } else {
            let _ = app.emit(
                "automation:completed",
                serde_json::json!({ "sessionId": &session_id }),
            );
        }

        emitter("Automatización completada.");
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn is_cancelled(flag: &Arc<Mutex<bool>>) -> bool {
    flag.lock().map(|v| *v).unwrap_or(false)
}

fn is_paused(flag: &Arc<Mutex<bool>>) -> bool {
    flag.lock().map(|v| *v).unwrap_or(false)
}

fn update_session_state(
    sessions: &Arc<Mutex<HashMap<String, ActiveBrowserSession>>>,
    session_id: &str,
    state: SessionState,
) {
    if let Ok(mut sess) = sessions.lock() {
        if let Some(active) = sess.get_mut(session_id) {
            active.session.state = state;
        }
    }
}

fn update_current_step(
    sessions: &Arc<Mutex<HashMap<String, ActiveBrowserSession>>>,
    session_id: &str,
    step_index: usize,
    state: StepState,
) {
    if let Ok(mut sess) = sessions.lock() {
        if let Some(active) = sess.get_mut(session_id) {
            active.session.current_step_index = step_index;
            if step_index < active.session.steps.len() {
                active.session.steps[step_index].state = state;
            }
        }
    }
}

fn update_user_instruction(
    sessions: &Arc<Mutex<HashMap<String, ActiveBrowserSession>>>,
    session_id: &str,
    step_index: usize,
    instruction: &str,
) {
    if let Ok(mut sess) = sessions.lock() {
        if let Some(active) = sess.get_mut(session_id) {
            if step_index < active.session.steps.len() {
                active.session.steps[step_index].user_instruction =
                    Some(instruction.to_string());
            }
        }
    }
}

fn emit_session_update(
    app: &tauri::AppHandle,
    sessions: &Arc<Mutex<HashMap<String, ActiveBrowserSession>>>,
    session_id: &str,
) {
    if let Ok(sess) = sessions.lock() {
        if let Some(active) = sess.get(session_id) {
            let _ = app.emit("automation:session-update", &active.session);
        }
    }
}

/// Detecta la presencia de CAPTCHA en la página.
fn detect_captcha(tab: &headless_chrome::Tab) -> bool {
    let captcha_selectors = [
        "iframe[src*='recaptcha']",
        "iframe[src*='hcaptcha']",
        ".g-recaptcha",
        ".h-captcha",
        "#captcha",
        "[data-captcha]",
    ];

    for selector in &captcha_selectors {
        if tab
            .wait_for_element_with_custom_timeout(selector, Duration::from_millis(500))
            .is_ok()
        {
            return true;
        }
    }

    false
}
