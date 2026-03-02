/// Particularidades de Kimi: requiere seleccionar modelo antes de chatear.
/// Si el LlmChatRunner genérico no funciona para Kimi, se puede extender aquí.

use headless_chrome::Tab;
use std::time::Duration;

/// Selecciona un modelo específico en Kimi si el selector está disponible.
#[allow(dead_code)]
pub fn select_model(tab: &Tab, model_name: &str) -> Result<(), String> {
    // Intentar abrir el selector de modelo
    let selector = ".model-selector, button[data-testid='model-select']";
    if let Ok(el) =
        tab.wait_for_element_with_custom_timeout(selector, Duration::from_millis(2000))
    {
        el.click()
            .map_err(|e| format!("Error abriendo selector de modelo: {}", e))?;
        std::thread::sleep(Duration::from_millis(500));

        // Buscar el modelo deseado
        let js = format!(
            r#"
            (function() {{
                const items = document.querySelectorAll('.model-option, [data-testid="model-item"]');
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
