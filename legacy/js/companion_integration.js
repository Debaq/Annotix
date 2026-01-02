/**
 * Connector Integration Module
 * Manages communication with the local Python training server (Annotix Connector)
 */

const AnnotixConnector = {
    SERVER_URL: localStorage.getItem('annotix_connector_url') || 'http://127.0.0.1:5000',
    DOWNLOAD_URL: 'http://tmeduca.org/annotix/download/connector/',
    isConnected: false,
    checkInterval: null,

    /**
     * Verifica el estado del connector
     * @returns {Promise<boolean>} true si está conectado
     */
    async checkStatus() {
        // Helper function to try a specific URL
        const tryConnect = async (url) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout per attempt

                console.log(`[Connector] Checking status at ${url}/status...`);
                const response = await fetch(`${url}/status`, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    if (data.online === true) {
                        return true;
                    }
                }
                return false;
            } catch (e) {
                return false;
            }
        };

        // 1. Try current configured URL
        let success = await tryConnect(this.SERVER_URL);

        // 2. If failed and using default 127.0.0.1, try localhost as fallback
        if (!success && this.SERVER_URL.includes('127.0.0.1')) {
            const fallbackUrl = this.SERVER_URL.replace('127.0.0.1', 'localhost');
            console.log(`[Connector] Retrying with fallback: ${fallbackUrl}`);
            if (await tryConnect(fallbackUrl)) {
                this.SERVER_URL = fallbackUrl;
                localStorage.setItem('annotix_connector_url', this.SERVER_URL);
                success = true;
            }
        }

        this.isConnected = success;

        if (this.isConnected) {
            console.log(`[Connector] Connected to ${this.SERVER_URL}`);
        } else {
            console.warn(`[Connector] Connection failed to ${this.SERVER_URL}`);
        }

        return this.isConnected;
    },

    /**
     * Inicia verificación periódica del estado
     * @param {Function} callback - Función a llamar cuando cambie el estado
     */
    startStatusCheck(callback) {
        // Primera verificación inmediata
        this.checkStatus().then(callback);

        // Verificar cada 5 segundos
        this.checkInterval = setInterval(async () => {
            await this.checkStatus();
            if (callback) callback(this.isConnected);
        }, 5000);
    },

    /**
     * Detiene la verificación periódica
     */
    stopStatusCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    },

    /**
     * Configura manualmente la URL del servidor
     * @param {string} ip - Dirección IP (ej: 192.168.1.50)
     * @param {string} port - Puerto (ej: 5000)
     */
    setServerUrl(ip, port = '5000') {
        // Basic validation
        if (!ip) return;

        // Remove protocol if present
        ip = ip.replace('http://', '').replace('https://', '').replace('/', '');

        this.SERVER_URL = `http://${ip}:${port}`;
        localStorage.setItem('annotix_connector_url', this.SERVER_URL);
        console.log(`[Connector] URL updated to: ${this.SERVER_URL}`);

        // Force check
        this.checkStatus().then(isConnected => {
            // Update UI if available
            if (window.app && window.app.updateConnectorStatus) {
                window.app.updateConnectorStatus(isConnected);
            }
        });
    },

    /**
     * Conecta con el Motor Acompañante local y envía la orden de entrenamiento.
     * @param {Object} config - Configuración del entrenamiento (epochs, lr, etc.)
     * @returns {Promise<Object>} Resultado del entrenamiento
     */
    async entrenar(config) {
        try {
            // Verificar conexión primero
            const isOnline = await this.checkStatus();
            if (!isOnline) {
                throw new Error('CONNECTOR_OFFLINE');
            }

            console.log("Motor Acompañante detectado. Enviando configuración...");

            // Enviar orden de entrenamiento
            const trainResponse = await fetch(`${this.SERVER_URL}/entrenar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const trainData = await trainResponse.json();

            if (trainResponse.ok) {
                return {
                    success: true,
                    message: trainData.message,
                    dataset: trainData.dataset
                };
            } else {
                return {
                    success: false,
                    error: trainData.error || 'Desconocido'
                };
            }

        } catch (error) {
            console.error("Error de conexión:", error);

            if (error.message === 'CONNECTOR_OFFLINE') {
                return {
                    success: false,
                    error: 'CONNECTOR_OFFLINE'
                };
            }

            return {
                success: false,
                error: error.message || 'Error de conexión'
            };
        }
    }
};

// Función de compatibilidad con el código anterior
async function conectarYEntrenar(config) {
    const result = await AnnotixConnector.entrenar(config);

    if (result.success) {
        alert(`✅ Éxito: ${result.message}\nCarpeta: ${result.dataset}`);
    } else if (result.error === 'CONNECTOR_OFFLINE') {
        const mensaje = window.i18n
            ? window.i18n.t('connector.offlineMessage')
            : "No se pudo conectar con el Motor Acompañante.\n\n¿Has descargado y ejecutado la aplicación de escritorio?\nAsegúrate de que 'motor_server.exe' esté corriendo en tu PC.";
        alert(mensaje);
    } else {
        alert(`❌ Error del motor: ${result.error}`);
    }
}

// Exportar para uso global
window.AnnotixConnector = AnnotixConnector;
window.conectarYEntrenar = conectarYEntrenar;
