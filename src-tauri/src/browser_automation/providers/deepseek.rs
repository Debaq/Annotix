/// Particularidades de DeepSeek Chat.
/// El flujo genérico de LlmChatRunner debería funcionar.
/// Este archivo queda reservado para extensiones futuras.

use headless_chrome::Tab;
use std::time::Duration;

/// DeepSeek puede mostrar un diálogo de modelo (DeepSeek-V3 vs DeepSeek-R1).
#[allow(dead_code)]
pub fn select_model(tab: &Tab, use_reasoning: bool) -> Result<(), String> {
    let model = if use_reasoning {
        "DeepSeek-R1"
    } else {
        "DeepSeek-V3"
    };

    let js = format!(
        r#"
        (function() {{
            const items = document.querySelectorAll('.model-item, [data-testid="model-option"]');
            for (const item of items) {{
                if (item.textContent.includes('{}')) {{
                    item.click();
                    return 'selected';
                }}
            }}
            return 'not_found';
        }})()
        "#,
        model
    );

    let _ = tab.evaluate(&js, false);
    std::thread::sleep(Duration::from_millis(300));
    Ok(())
}
