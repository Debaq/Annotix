/// Particularidades de HuggingChat.
/// HuggingChat permite seleccionar entre varios modelos open-source.

use headless_chrome::Tab;
use std::time::Duration;

/// Selecciona un modelo específico en HuggingChat.
#[allow(dead_code)]
pub fn select_model(tab: &Tab, model_name: &str) -> Result<(), String> {
    let selector = "button[data-testid='model-selector'], .model-selector";
    if let Ok(el) =
        tab.wait_for_element_with_custom_timeout(selector, Duration::from_millis(2000))
    {
        el.click()
            .map_err(|e| format!("Error abriendo selector de modelo: {}", e))?;
        std::thread::sleep(Duration::from_millis(500));

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
            model_name.replace('\'', "\\'")
        );

        tab.evaluate(&js, false)
            .map_err(|e| format!("Error seleccionando modelo: {}", e))?;
        std::thread::sleep(Duration::from_millis(300));
    }

    Ok(())
}
