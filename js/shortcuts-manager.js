/**
 * SHORTCUTS MANAGER
 * Handles keyboard shortcuts display and help/tour functionality
 */

class ShortcutsManager {
    constructor(ui) {
        this.ui = ui;
    }

    /**
     * Shows a modal with all keyboard shortcuts
     */
    showShortcutsModal() {
        const content = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-height: 400px; overflow-y: auto;">
                <div class="shortcut-item">
                    <span><strong>Guardar</strong></span>
                    <span class="shortcut-key">Ctrl+S</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Deshacer</strong></span>
                    <span class="shortcut-key">Ctrl+Z</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Eliminar</strong></span>
                    <span class="shortcut-key">Del/Backspace</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Deseleccionar</strong></span>
                    <span class="shortcut-key">Esc</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Navegación imágenes</strong></span>
                    <span class="shortcut-key">← →</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Rotar imagen</strong></span>
                    <span class="shortcut-key">A / D</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Herramienta Box</strong></span>
                    <span class="shortcut-key">B</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Herramienta OBB</strong></span>
                    <span class="shortcut-key">O</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Herramienta Mask</strong></span>
                    <span class="shortcut-key">M</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Herramienta Select</strong></span>
                    <span class="shortcut-key">V</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Herramienta Pan</strong></span>
                    <span class="shortcut-key">H</span>
                </div>
                <div class="shortcut-item">
                    <span><strong>Seleccionar Clase</strong></span>
                    <span class="shortcut-key">1-9</span>
                </div>
            </div>
            <style>
                .shortcut-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: var(--gray-light);
                    border-radius: 6px;
                }
                .shortcut-key {
                    background: var(--primary);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 0.9em;
                    font-weight: 600;
                }
            </style>
        `;

        this.ui.showModal('⌨️ Atajos de Teclado', content, [
            {
                text: 'Cerrar',
                type: 'primary',
                action: 'close',
                handler: (modal, close) => close()
            }
        ]);
    }

    /**
     * Starts the interactive application tour (intro.js)
     */
    startTour() {
        if (window.startAppTour) {
            window.startAppTour();
        } else {
            this.ui.showToast('Tour no disponible', 'info');
        }
    }
}
