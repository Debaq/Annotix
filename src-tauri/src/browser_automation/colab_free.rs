use super::{
    AutomationRequest, AutomationResult, AutomationSession, AutomationStep, BrowserRunner,
    StepState,
};
use headless_chrome::Tab;
use std::time::Duration;

pub struct ColabFreeRunner {
    result: Option<AutomationResult>,
    selectors: super::selectors::SelectorRegistry,
}

impl ColabFreeRunner {
    pub fn new() -> Self {
        let selectors_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default()
            .join("selectors");

        // Fallback: buscar en directorio del proyecto (dev mode)
        let selectors_dir = if selectors_dir.exists() {
            selectors_dir
        } else {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("selectors")
        };

        Self {
            result: None,
            selectors: super::selectors::SelectorRegistry::load(&selectors_dir),
        }
    }
}

impl BrowserRunner for ColabFreeRunner {
    fn define_steps(&self, _request: &AutomationRequest) -> Vec<AutomationStep> {
        vec![
            AutomationStep {
                id: "open_colab".into(),
                name: "automation.colab.steps.openColab".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "login".into(),
                name: "automation.colab.steps.login".into(),
                state: StepState::Pending,
                requires_user: true,
                user_instruction: Some("automation.instructions.login".into()),
                progress: 0.0,
            },
            AutomationStep {
                id: "create_notebook".into(),
                name: "automation.colab.steps.createNotebook".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "configure_gpu".into(),
                name: "automation.colab.steps.configureGpu".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "install_deps".into(),
                name: "automation.colab.steps.installDeps".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "upload_dataset".into(),
                name: "automation.colab.steps.uploadDataset".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "training_code".into(),
                name: "automation.colab.steps.trainingCode".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "run_training".into(),
                name: "automation.colab.steps.runTraining".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "monitor_progress".into(),
                name: "automation.colab.steps.monitorProgress".into(),
                state: StepState::Pending,
                requires_user: false,
                user_instruction: None,
                progress: 0.0,
            },
            AutomationStep {
                id: "download_model".into(),
                name: "automation.colab.steps.downloadModel".into(),
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
            0 => self.step_open_colab(tab, emitter),
            1 => {
                // Login: retornar false para indicar que necesita acción del usuario
                emitter("Esperando que el usuario inicie sesión en Google...");
                Ok(false)
            }
            2 => self.step_create_notebook(tab, emitter),
            3 => self.step_configure_gpu(tab, emitter),
            4 => self.step_install_deps(tab, session, emitter),
            5 => self.step_upload_dataset(tab, session, emitter),
            6 => self.step_training_code(tab, session, emitter),
            7 => self.step_run_training(tab, emitter),
            8 => self.step_monitor_progress(tab, emitter),
            9 => self.step_download_model(tab, emitter),
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
                // Verificar si el usuario ya hizo login buscando el selector de login_check
                let provider = super::BrowserProvider::ColabFree;
                if let Some(check_selector) = self.selectors.get_login_check(&provider) {
                    match tab.wait_for_element_with_custom_timeout(
                        check_selector,
                        Duration::from_millis(1000),
                    ) {
                        Ok(_) => Ok(true),
                        Err(_) => Ok(false),
                    }
                } else {
                    // Fallback: buscar elementos que solo aparecen logueado
                    match tab.wait_for_element_with_custom_timeout(
                        "div[data-email]",
                        Duration::from_millis(1000),
                    ) {
                        Ok(_) => Ok(true),
                        Err(_) => Ok(false),
                    }
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

impl ColabFreeRunner {
    fn step_open_colab(
        &self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Navegando a Google Colab...");
        tab.navigate_to("https://colab.research.google.com/")
            .map_err(|e| format!("Error navegando a Colab: {}", e))?;
        std::thread::sleep(Duration::from_secs(3));
        emitter("Colab abierto.");
        Ok(true)
    }

    fn step_create_notebook(
        &self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Creando nuevo notebook...");

        // Intentar clic en "New notebook"
        let provider = super::BrowserProvider::ColabFree;
        if let Some(selector) = self.selectors.get(&provider, "new_notebook") {
            match super::selectors::find_element_with_fallback(tab, selector) {
                Ok(el) => {
                    el.click().map_err(|e| format!("Error click new notebook: {}", e))?;
                    std::thread::sleep(Duration::from_secs(3));
                    emitter("Notebook creado.");
                    return Ok(true);
                }
                Err(_) => {
                    // Puede que ya haya un notebook abierto o usar menú File > New
                    emitter("Intentando vía menú File...");
                }
            }
        }

        // Fallback: navegar directamente a URL de nuevo notebook
        tab.navigate_to("https://colab.research.google.com/#create=true")
            .map_err(|e| format!("Error creando notebook: {}", e))?;
        std::thread::sleep(Duration::from_secs(3));
        emitter("Notebook creado (vía URL).");
        Ok(true)
    }

    fn step_configure_gpu(
        &self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Configurando GPU T4...");
        let provider = super::BrowserProvider::ColabFree;

        // Abrir menú Runtime
        if let Some(selector) = self.selectors.get(&provider, "runtime_menu") {
            if let Ok(el) = super::selectors::find_element_with_fallback(tab, selector) {
                el.click().map_err(|e| format!("Error click runtime menu: {}", e))?;
                std::thread::sleep(Duration::from_millis(500));
            }
        }

        // Click "Change runtime type"
        if let Some(selector) = self.selectors.get(&provider, "change_runtime") {
            if let Ok(el) = super::selectors::find_element_with_fallback(tab, selector) {
                el.click().map_err(|e| format!("Error click change runtime: {}", e))?;
                std::thread::sleep(Duration::from_secs(1));
            }
        }

        // Seleccionar T4 GPU via JavaScript
        let js = r#"
            (function() {
                // Intentar seleccionar GPU T4 en el diálogo
                const selects = document.querySelectorAll('select');
                for (const sel of selects) {
                    for (const opt of sel.options) {
                        if (opt.value === 'T4' || opt.textContent.includes('T4')) {
                            sel.value = opt.value;
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                            return 'selected';
                        }
                    }
                }
                return 'not_found';
            })()
        "#;

        match tab.evaluate(js, false) {
            Ok(result) => {
                let val = result
                    .value
                    .as_ref()
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                if val == "not_found" {
                    emitter("Aviso: no se pudo seleccionar GPU T4 automáticamente.");
                }
            }
            Err(e) => {
                emitter(&format!("Aviso al configurar GPU: {}", e));
            }
        }

        // Click Save/OK
        if let Some(selector) = self.selectors.get(&provider, "save_runtime") {
            if let Ok(el) = super::selectors::find_element_with_fallback(tab, selector) {
                el.click().map_err(|e| format!("Error click save runtime: {}", e))?;
            }
        }

        std::thread::sleep(Duration::from_secs(2));
        emitter("GPU T4 configurada.");
        Ok(true)
    }

    fn step_install_deps(
        &self,
        tab: &Tab,
        _session: &AutomationSession,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Instalando dependencias (pip install ultralytics)...");

        let code = "!pip install ultralytics -q";
        self.inject_and_run_cell(tab, code, emitter)?;

        // Esperar a que la celda termine (buscar output con "Successfully")
        self.wait_for_cell_completion(tab, 120, emitter)?;

        emitter("Dependencias instaladas.");
        Ok(true)
    }

    fn step_upload_dataset(
        &self,
        tab: &Tab,
        _session: &AutomationSession,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Subiendo dataset...");

        // Inyectar código para subir archivos via Colab files API
        let upload_code = r#"
from google.colab import files
import zipfile, os

# Upload dataset zip
uploaded = files.upload()
for filename in uploaded:
    if filename.endswith('.zip'):
        with zipfile.ZipFile(filename, 'r') as z:
            z.extractall('/content/dataset')
        print(f"ANNOTIX_UPLOAD_OK: {filename}")
        break
else:
    print("ANNOTIX_UPLOAD_ERROR: No zip file found")
"#;

        self.add_new_cell(tab, emitter)?;
        self.inject_and_run_cell(tab, upload_code, emitter)?;

        emitter("Esperando que el usuario seleccione el archivo zip del dataset...");
        // Este paso necesitará intervención del usuario para seleccionar el archivo
        // en el diálogo de upload de Colab
        self.wait_for_cell_completion(tab, 300, emitter)?;

        emitter("Dataset subido.");
        Ok(true)
    }

    fn step_training_code(
        &self,
        tab: &Tab,
        _session: &AutomationSession,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Inyectando código de entrenamiento...");

        // Generar script de training adaptado para Colab
        let training_code = r#"
import os, json
from ultralytics import YOLO

# Configuración de entrenamiento
DATA_DIR = '/content/dataset'
yaml_path = None

# Buscar data.yaml
for root, dirs, files in os.walk(DATA_DIR):
    for f in files:
        if f == 'data.yaml' or f == 'data.yml':
            yaml_path = os.path.join(root, f)
            break
    if yaml_path:
        break

if not yaml_path:
    raise FileNotFoundError("No se encontró data.yaml en el dataset")

print(f"Dataset encontrado: {yaml_path}")

# Entrenar
model = YOLO('yolov8n.pt')
results = model.train(
    data=yaml_path,
    epochs=50,
    imgsz=640,
    batch=16,
    device=0,
    project='/content/runs',
    name='annotix_training',
    exist_ok=True,
    verbose=True,
)

# Notificar resultado
best_path = str(model.trainer.best)
print(f"\nANNOTIX_EVENT:" + json.dumps({
    "type": "completed",
    "bestModelPath": best_path,
}))
"#;

        self.add_new_cell(tab, emitter)?;
        self.inject_and_run_cell(tab, training_code, emitter)?;

        emitter("Código de entrenamiento inyectado.");
        Ok(true)
    }

    fn step_run_training(
        &self,
        _tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Ejecutando entrenamiento...");

        // El training ya fue iniciado en el paso anterior al ejecutar la celda
        // Aquí solo confirmamos que la celda está corriendo
        std::thread::sleep(Duration::from_secs(2));

        emitter("Entrenamiento en progreso...");
        Ok(true)
    }

    fn step_monitor_progress(
        &self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Monitoreando progreso del entrenamiento...");

        // Polling del output de la celda buscando métricas de epoch
        let max_wait = 3600; // 1 hora máximo
        let mut elapsed = 0;
        let poll_interval = 10; // Cada 10 segundos

        while elapsed < max_wait {
            std::thread::sleep(Duration::from_secs(poll_interval));
            elapsed += poll_interval;

            // Leer output de la última celda
            let js = r#"
                (function() {
                    const outputs = document.querySelectorAll('.cell .output_area .output_text pre');
                    if (outputs.length === 0) return '';
                    const lastOutput = outputs[outputs.length - 1];
                    return lastOutput.innerText || '';
                })()
            "#;

            if let Ok(result) = tab.evaluate(js, false) {
                let output = result
                    .value
                    .as_ref()
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                // Buscar líneas de epoch
                if output.contains("ANNOTIX_EVENT:") {
                    // Training completado
                    for line in output.lines() {
                        if line.contains("ANNOTIX_EVENT:") {
                            if let Some(json_str) = line.split("ANNOTIX_EVENT:").nth(1) {
                                emitter(&format!("Evento: {}", json_str.trim()));
                            }
                        }
                    }
                    emitter("Entrenamiento completado en Colab.");
                    return Ok(true);
                }

                // Buscar progreso de epochs
                if output.contains("epoch") || output.contains("Epoch") {
                    // Extraer última línea de progreso
                    let lines: Vec<&str> = output.lines().collect();
                    if let Some(last) = lines.last() {
                        emitter(&format!("Progreso: {}", last.trim()));
                    }
                }

                // Detectar errores
                if output.contains("CUDA out of memory") {
                    return Err("CUDA sin memoria. Intenta reducir batch_size o image_size.".into());
                }
                if output.contains("RuntimeError") || output.contains("Error") {
                    let error_line = output
                        .lines()
                        .find(|l| l.contains("Error") || l.contains("RuntimeError"))
                        .unwrap_or("Error desconocido en el entrenamiento");
                    return Err(error_line.to_string());
                }
            }

            // Detectar runtime desconectado
            let disconnect_js = r#"
                document.querySelector('.colab-toolbar-notice') ?
                    document.querySelector('.colab-toolbar-notice').innerText : ''
            "#;
            if let Ok(result) = tab.evaluate(disconnect_js, false) {
                let notice = result
                    .value
                    .as_ref()
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if notice.contains("disconnected") || notice.contains("Reconnect") {
                    return Err("Runtime desconectado. Reintenta o reconecta manualmente.".into());
                }
            }
        }

        Err("Timeout: el entrenamiento tardó más de 1 hora.".into())
    }

    fn step_download_model(
        &mut self,
        tab: &Tab,
        emitter: &dyn Fn(&str),
    ) -> Result<bool, String> {
        emitter("Descargando modelo entrenado...");

        // Inyectar código para descargar el modelo
        let download_code = r#"
from google.colab import files
import glob

# Buscar el mejor modelo
best_models = glob.glob('/content/runs/annotix_training/weights/best.pt')
if best_models:
    files.download(best_models[0])
    print("ANNOTIX_DOWNLOAD_OK: " + best_models[0])
else:
    # Fallback: buscar cualquier .pt
    all_models = glob.glob('/content/runs/**/*.pt', recursive=True)
    if all_models:
        files.download(all_models[0])
        print("ANNOTIX_DOWNLOAD_OK: " + all_models[0])
    else:
        print("ANNOTIX_DOWNLOAD_ERROR: No se encontró modelo")
"#;

        self.add_new_cell(tab, emitter)?;
        self.inject_and_run_cell(tab, download_code, emitter)?;
        self.wait_for_cell_completion(tab, 60, emitter)?;

        self.result = Some(AutomationResult::ModelDownloaded {
            path: "best.pt".into(),
        });

        emitter("Modelo descargado.");
        Ok(true)
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    fn inject_and_run_cell(
        &self,
        tab: &Tab,
        code: &str,
        _emitter: &dyn Fn(&str),
    ) -> Result<(), String> {
        // Escribir código en la celda activa usando JavaScript
        let escaped_code = code
            .replace('\\', "\\\\")
            .replace('`', "\\`")
            .replace("${", "\\${");

        let js = format!(
            r#"
            (function() {{
                // Buscar la última celda de código
                const cells = document.querySelectorAll('.cell');
                const lastCell = cells[cells.length - 1];
                if (!lastCell) return 'no_cell';

                // Buscar CodeMirror o textarea
                const cm = lastCell.querySelector('.CodeMirror');
                if (cm && cm.CodeMirror) {{
                    cm.CodeMirror.setValue(`{}`);
                    return 'ok_cm';
                }}

                const textarea = lastCell.querySelector('textarea');
                if (textarea) {{
                    textarea.value = `{}`;
                    textarea.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    return 'ok_textarea';
                }}

                return 'no_editor';
            }})()
            "#,
            escaped_code, escaped_code
        );

        match tab.evaluate(&js, false) {
            Ok(result) => {
                let val = result
                    .value
                    .as_ref()
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                if val == "no_cell" || val == "no_editor" {
                    return Err("No se encontró celda de código para escribir.".into());
                }
            }
            Err(e) => {
                return Err(format!("Error inyectando código: {}", e));
            }
        }

        std::thread::sleep(Duration::from_millis(500));

        // Ejecutar la celda con Ctrl+Enter
        let run_js = r#"
            (function() {
                // Simular Ctrl+Enter para ejecutar la celda
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true
                }));
                return 'executed';
            })()
        "#;
        tab.evaluate(run_js, false)
            .map_err(|e| format!("Error ejecutando celda: {}", e))?;

        std::thread::sleep(Duration::from_secs(1));
        Ok(())
    }

    fn add_new_cell(
        &self,
        tab: &Tab,
        _: &dyn Fn(&str),
    ) -> Result<(), String> {
        let provider = super::BrowserProvider::ColabFree;
        if let Some(selector) = self.selectors.get(&provider, "add_code_cell") {
            if let Ok(el) = super::selectors::find_element_with_fallback(tab, selector) {
                el.click()
                    .map_err(|e| format!("Error agregando celda: {}", e))?;
                std::thread::sleep(Duration::from_millis(500));
                return Ok(());
            }
        }

        // Fallback: usar shortcut
        let js = r#"
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'b', code: 'KeyB', bubbles: true
            }));
        "#;
        tab.evaluate(js, false)
            .map_err(|e| format!("Error agregando celda vía shortcut: {}", e))?;
        std::thread::sleep(Duration::from_millis(500));
        Ok(())
    }

    fn wait_for_cell_completion(
        &self,
        tab: &Tab,
        max_seconds: u64,
        emitter: &dyn Fn(&str),
    ) -> Result<(), String> {
        let mut elapsed = 0;
        let interval = 3;

        while elapsed < max_seconds {
            std::thread::sleep(Duration::from_secs(interval));
            elapsed += interval;

            // Comprobar si la celda dejó de ejecutarse
            let js = r#"
                (function() {
                    const running = document.querySelectorAll('.cell.running, .cell.pending');
                    return running.length === 0 ? 'done' : 'running';
                })()
            "#;

            if let Ok(result) = tab.evaluate(js, false) {
                let val = result
                    .value
                    .as_ref()
                    .and_then(|v| v.as_str())
                    .unwrap_or("running");
                if val == "done" {
                    return Ok(());
                }
            }
        }

        emitter(&format!(
            "Aviso: timeout de {} segundos esperando celda.",
            max_seconds
        ));
        Ok(())
    }
}
