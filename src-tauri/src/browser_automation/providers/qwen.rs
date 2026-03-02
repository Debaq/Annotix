/// Particularidades de Qwen Chat.
/// El flujo genérico de LlmChatRunner debería funcionar para Qwen.
/// Este archivo queda reservado para extensiones futuras.

use headless_chrome::Tab;
use std::time::Duration;

/// Qwen puede requerir aceptar términos de uso en el primer acceso.
#[allow(dead_code)]
pub fn accept_terms_if_present(tab: &Tab) -> Result<(), String> {
    let js = r#"
        (function() {
            const btn = document.querySelector('button[data-testid="accept-terms"], .terms-accept-btn');
            if (btn) {
                btn.click();
                return 'accepted';
            }
            return 'none';
        })()
    "#;

    let _ = tab.evaluate(js, false);
    std::thread::sleep(Duration::from_millis(300));
    Ok(())
}
