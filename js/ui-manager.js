/**
 * UI MANAGER - Toasts and Modals
 * Manages user interface notifications and dialogs
 */

class UIManager {
    constructor() {
        this.toastContainer = null;
        this.init();
    }

    init() {
        // Create toast container
        this.toastContainer = document.createElement('div');
        this.toastContainer.className = 'toast-container';
        document.body.appendChild(this.toastContainer);
    }

    showToast(message, type = 'info', duration = 2000) {
        // Prevent duplicate toasts - check if same message already exists
        const existingToasts = this.toastContainer.querySelectorAll('.toast');
        for (const existing of existingToasts) {
            const existingMessage = existing.querySelector('.toast-message')?.textContent;
            if (existingMessage === message) {
                return; // Don't show duplicate
            }
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.innerHTML = `
            <i class="toast-icon ${icons[type]}"></i>
            <div class="toast-message">${message}</div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.onclick = () => this.removeToast(toast);

        this.toastContainer.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => this.removeToast(toast), duration);
        }
    }

    removeToast(toast) {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    confirm(message, onConfirm, onCancel) {
        return window.confirm(message);
    }

    showModal(title, content, buttons = []) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';

        modal.innerHTML = `
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
            <div class="modal-footer">
                ${buttons.map(btn => `
                    <button class="btn btn-${btn.type || 'secondary'}" data-action="${btn.action}">
                        ${btn.icon ? `<i class="${btn.icon}"></i>` : ''}
                        ${btn.text}
                    </button>
                `).join('')}
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close handlers
        const close = () => {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 200);
        };

        modal.querySelector('.modal-close').onclick = close;
        overlay.onclick = (e) => {
            if (e.target === overlay) close();
        };

        // Button handlers
        buttons.forEach(btn => {
            if (btn.handler) {
                modal.querySelector(`[data-action="${btn.action}"]`).onclick = () => {
                    btn.handler(modal, close);
                };
            }
        });

        return { modal, overlay, close };
    }
}