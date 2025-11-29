/**
 * TIME SERIES WIZARD MANAGER
 * Manages the CSV import wizard for time series data
 */

class TimeSeriesWizardManager {
    constructor(ui) {
        this.ui = ui;
        this.parser = new CSVParser();
        this.files = [];
        this.parsedData = [];
        this.configurations = [];
        this.currentFileIndex = 0;
        this.applyToAll = false;
    }

    /**
     * Start the wizard with CSV files
     * Returns a Promise that resolves with processed data when wizard completes
     */
    async startWizard(files) {
        this.files = Array.from(files);
        this.parsedData = [];
        this.configurations = [];
        this.currentFileIndex = 0;
        this.applyToAll = false;

        // Create a promise that will resolve when wizard completes
        return new Promise(async (resolve, reject) => {
            this.resolveCallback = resolve;
            this.rejectCallback = reject;

            try {
                // Parse all files first
                this.ui.showToast('Analizando archivos CSV...', 'info');

                for (const file of this.files) {
                    const parsed = await this.parser.parseFile(file);
                    this.parsedData.push(parsed);

                    // Initialize default configuration
                    const timeColumn = this.guessTimeColumn(parsed.headers, parsed.columnTypes);
                    this.configurations.push({
                        hasHeaders: parsed.hasHeaders,
                        timeColumn: timeColumn,
                        delimiter: parsed.delimiter
                    });
                }

                // Show wizard modal
                this.showWizardModal();

            } catch (error) {
                console.error('Error parsing CSV files:', error);
                this.ui.showToast(`Error al analizar CSV: ${error.message}`, 'error');
                reject(error);
            }
        });
    }

    /**
     * Guess which column is the time column
     */
    guessTimeColumn(headers, columnTypes) {
        // Look for common time column names
        const timeKeywords = ['time', 'timestamp', 'date', 'datetime', 'fecha', 'hora', 't', 'ts'];

        for (const header of headers) {
            const lowerHeader = header.toLowerCase();
            if (timeKeywords.some(kw => lowerHeader.includes(kw))) {
                return header;
            }
        }

        // Look for date type columns
        for (const [header, type] of Object.entries(columnTypes)) {
            if (type === 'date') {
                return header;
            }
        }

        // Default: no time column
        return null;
    }

    /**
     * Show wizard modal
     */
    showWizardModal() {
        const currentFile = this.files[this.currentFileIndex];
        const currentParsed = this.parsedData[this.currentFileIndex];
        const currentConfig = this.configurations[this.currentFileIndex];

        const previewData = this.parser.getPreviewData(currentParsed, 10);

        const content = `
            <div class="timeseries-wizard">
                <!-- File Progress -->
                <div class="wizard-progress">
                    <span class="wizard-progress-text">
                        Archivo ${this.currentFileIndex + 1} de ${this.files.length}:
                        <strong>${currentFile.name}</strong>
                    </span>
                    <div class="wizard-progress-bar">
                        <div class="wizard-progress-fill" style="width: ${((this.currentFileIndex + 1) / this.files.length) * 100}%"></div>
                    </div>
                </div>

                <!-- Configuration Options -->
                <div class="wizard-config">
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input type="checkbox" id="hasHeaders" ${currentConfig.hasHeaders ? 'checked' : ''}>
                            <span>Primera fila contiene nombres de columnas</span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Columna de tiempo (opcional)</label>
                        <select id="timeColumn" class="form-control form-select">
                            <option value="">Ninguna (usar índice secuencial)</option>
                            ${previewData.headers.map((header, idx) => `
                                <option value="${header}" ${currentConfig.timeColumn === header ? 'selected' : ''}>
                                    ${header} ${currentParsed.columnTypes[header] === 'date' ? '(fecha)' : currentParsed.columnTypes[header] === 'number' ? '(numérico)' : ''}
                                </option>
                            `).join('')}
                        </select>
                        <small class="text-muted">
                            Si no se especifica, se usará el índice de fila como tiempo
                        </small>
                    </div>

                    ${this.files.length > 1 ? `
                        <div class="form-group">
                            <label class="form-checkbox">
                                <input type="checkbox" id="applyToAll" ${this.applyToAll ? 'checked' : ''}>
                                <span><strong>Aplicar esta configuración a todos los archivos</strong></span>
                            </label>
                            <small class="text-muted">
                                Útil cuando todos los CSV tienen la misma estructura
                            </small>
                        </div>
                    ` : ''}
                </div>

                <!-- Data Preview -->
                <div class="wizard-preview">
                    <h4 class="wizard-preview-title">
                        <i class="fas fa-table"></i>
                        Vista previa de datos (${previewData.totalRows} filas totales)
                    </h4>
                    ${this.renderPreviewTable(previewData)}
                </div>

                <!-- Metadata Info -->
                <div class="wizard-metadata">
                    <span><i class="fas fa-database"></i> ${previewData.totalRows} filas</span>
                    <span><i class="fas fa-columns"></i> ${previewData.headers.length} columnas</span>
                    <span><i class="fas fa-file"></i> ${this.formatFileSize(currentFile.size)}</span>
                    <span><i class="fas fa-grip-lines"></i> Delimitador: "${currentParsed.delimiter === '\t' ? '\\t (TAB)' : currentParsed.delimiter}"</span>
                </div>
            </div>
        `;

        const buttons = [
            {
                text: 'Cancelar',
                type: 'secondary',
                action: 'cancel',
                handler: (modal, close) => {
                    close();
                    if (this.resolveCallback) {
                        this.resolveCallback(null); // Return null on cancel
                    }
                }
            }
        ];

        // Add navigation buttons
        if (this.currentFileIndex > 0) {
            buttons.push({
                text: '← Anterior',
                type: 'secondary',
                action: 'prev',
                handler: (modal, close) => {
                    this.saveCurrentConfig(modal);
                    this.currentFileIndex--;
                    close();
                    this.showWizardModal();
                }
            });
        }

        if (this.currentFileIndex < this.files.length - 1) {
            buttons.push({
                text: 'Siguiente →',
                type: 'primary',
                action: 'next',
                handler: (modal, close) => {
                    this.saveCurrentConfig(modal);

                    if (this.applyToAll) {
                        // Apply current config to all remaining files
                        this.applyConfigToAll();
                        this.currentFileIndex = this.files.length - 1;
                    } else {
                        this.currentFileIndex++;
                    }

                    close();
                    this.showWizardModal();
                }
            });
        } else {
            buttons.push({
                text: 'Importar',
                type: 'primary',
                icon: 'fas fa-check',
                action: 'import',
                handler: async (modal, close) => {
                    this.saveCurrentConfig(modal);
                    close();
                    const result = await this.completeImport();
                    if (this.resolveCallback) {
                        this.resolveCallback(result);
                    }
                }
            });
        }

        this.ui.showModal(
            '<i class="fas fa-file-csv"></i> Configurar importación de CSV',
            content,
            buttons
        );

        // Setup event listeners
        setTimeout(() => {
            this.setupWizardListeners();
        }, 100);
    }

    /**
     * Render preview table HTML
     */
    renderPreviewTable(previewData) {
        return `
            <div class="preview-table-container">
                <table class="preview-table">
                    <thead>
                        <tr>
                            <th class="preview-row-num">#</th>
                            ${previewData.headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${previewData.rows.map((row, idx) => `
                            <tr>
                                <td class="preview-row-num">${idx + 1}</td>
                                ${row.map(cell => `<td>${this.escapeHtml(cell)}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Setup wizard event listeners
     */
    setupWizardListeners() {
        const modal = document.querySelector('.modal');
        if (!modal) return;

        // Track changes
        const hasHeadersCheckbox = modal.querySelector('#hasHeaders');
        const timeColumnSelect = modal.querySelector('#timeColumn');
        const applyToAllCheckbox = modal.querySelector('#applyToAll');

        if (hasHeadersCheckbox) {
            hasHeadersCheckbox.addEventListener('change', (e) => {
                // Update preview when headers setting changes
                // We would need to re-render, but for now just save the state
            });
        }

        if (applyToAllCheckbox) {
            applyToAllCheckbox.addEventListener('change', (e) => {
                this.applyToAll = e.target.checked;
            });
        }
    }

    /**
     * Save current configuration from modal
     */
    saveCurrentConfig(modal) {
        const hasHeaders = modal.querySelector('#hasHeaders')?.checked || false;
        const timeColumn = modal.querySelector('#timeColumn')?.value || null;
        const applyToAll = modal.querySelector('#applyToAll')?.checked || false;

        this.configurations[this.currentFileIndex] = {
            hasHeaders,
            timeColumn,
            delimiter: this.parsedData[this.currentFileIndex].delimiter
        };

        this.applyToAll = applyToAll;
    }

    /**
     * Apply current configuration to all remaining files
     */
    applyConfigToAll() {
        const currentConfig = this.configurations[this.currentFileIndex];

        for (let i = this.currentFileIndex + 1; i < this.files.length; i++) {
            this.configurations[i] = { ...currentConfig };
        }
    }

    /**
     * Complete the import and return processed data
     */
    async completeImport() {
        const processedFiles = [];

        for (let i = 0; i < this.files.length; i++) {
            const file = this.files[i];
            const parsed = this.parsedData[i];
            const config = this.configurations[i];

            processedFiles.push({
                file: file,
                name: file.name,
                data: parsed.data,
                headers: parsed.headers,
                rowCount: parsed.rowCount,
                columnCount: parsed.columnCount,
                columnTypes: parsed.columnTypes,
                timeColumn: config.timeColumn,
                hasHeaders: config.hasHeaders,
                delimiter: config.delimiter,
                metadata: {
                    filename: file.name,
                    filesize: file.size,
                    lastModified: file.lastModified,
                    importDate: Date.now()
                }
            });
        }

        this.ui.showToast(`${processedFiles.length} archivo(s) CSV importados correctamente`, 'success');

        // Return processed files to the app
        return processedFiles;
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    /**
     * Escape HTML entities
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeSeriesWizardManager;
}
