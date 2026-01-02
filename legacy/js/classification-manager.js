/**
 * CLASSIFICATION MANAGER
 * Handles image classification (single-label and multi-label)
 * For projects that assign labels to entire images without spatial annotations
 */

class ClassificationManager {
    constructor(container, ui) {
        this.container = container;
        this.ui = ui;

        // State
        this.image = null;
        this.imageName = '';
        this.imageId = null;
        this.labels = []; // Array of class IDs for this image
        this.isMultiLabel = false; // true for multi-label, false for single-label

        // Project configuration
        this.classes = [];
        this.currentClassIndex = 0; // For keyboard navigation (A/D keys)

        // UI Elements
        this.classificationUI = null;
        this.imageDisplay = null;

        // Unsaved changes tracking
        this.hasUnsavedChanges = false;
    }

    // Initialize the classification UI
    init(isMultiLabel = false) {
        this.isMultiLabel = isMultiLabel;
        this.createClassificationUI();
    }

    // Create the classification interface
    createClassificationUI() {
        // Hide canvas if it exists
        const canvas = document.getElementById('canvas');
        if (canvas) canvas.style.display = 'none';

        // Create classification container (just for the image display)
        if (!this.classificationUI) {
            this.classificationUI = document.createElement('div');
            this.classificationUI.id = 'classificationUI';
            this.classificationUI.className = 'classification-ui';
            this.container.appendChild(this.classificationUI);
        }

        this.classificationUI.innerHTML = `
            <div class="classification-image-container">
                <img id="classificationImage" class="classification-image" alt="Image to classify">
                <div class="classification-no-image">
                    <i class="fas fa-image fa-3x"></i>
                    <p data-i18n="images.noImages">No hay imágenes</p>
                </div>
                <div class="classification-labels-overlay" id="classificationLabelsOverlay">
                    <!-- Selected labels will appear here -->
                </div>
            </div>
        `;

        this.imageDisplay = document.getElementById('classificationImage');

        // Update sidebar title
        this.updateSidebarTitle();

        // Render classes in the existing sidebar classList
        this.renderClassList();
    }

    // Update sidebar title based on mode
    updateSidebarTitle() {
        const classesTitle = document.querySelector('.sidebar-section h3');
        if (classesTitle) {
            if (this.isMultiLabel) {
                classesTitle.setAttribute('data-i18n', 'classification.selectMultiple');
                classesTitle.textContent = window.i18n.t('classification.selectMultiple');
            } else {
                classesTitle.setAttribute('data-i18n', 'classification.selectOne');
                classesTitle.textContent = window.i18n.t('classification.selectOne');
            }
        }
    }

    // Render the list of available classes in the sidebar
    renderClassList() {
        const classList = document.getElementById('classList');
        if (!classList) return;

        if (this.classes.length === 0) {
            classList.innerHTML = `
                <div class="empty-message" data-i18n="classes.empty">
                    Crea un proyecto primero
                </div>
            `;
            return;
        }

        classList.innerHTML = this.classes.map((cls, index) => {
            const isSelected = this.labels.includes(cls.id);
            const isCurrent = index === this.currentClassIndex;
            return `
                <div class="class-item ${isSelected ? 'active' : ''} ${isCurrent ? 'highlighted' : ''}" data-class-id="${cls.id}" data-class-index="${index}">
                    <div class="class-color" style="background: ${cls.color}"></div>
                    <span class="class-name">[${index + 1}] ${cls.name}</span>
                    ${isSelected ? '<i class="fas fa-check" style="color: var(--success); margin-left: auto;"></i>' : ''}
                </div>
            `;
        }).join('');

        // Add event listeners
        classList.querySelectorAll('.class-item').forEach(item => {
            item.addEventListener('click', () => {
                const classId = parseInt(item.dataset.classId);
                this.toggleLabel(classId);
            });
        });
    }

    // Toggle a label selection
    toggleLabel(classId) {
        if (this.isMultiLabel) {
            // Multi-label: toggle selection
            const index = this.labels.indexOf(classId);
            if (index > -1) {
                this.labels.splice(index, 1);
            } else {
                this.labels.push(classId);
            }
        } else {
            // Single-label: replace selection
            this.labels = [classId];
        }

        this.markUnsavedChanges();
        this.renderClassList();
        this.updateImageInfo();
        this.updateLabelsOverlay();

        // Emit event for UI updates (classification labels are like annotations)
        if (window.eventBus) {
            window.eventBus.emit('annotationModified', {
                imageId: this.imageId,
                labels: this.labels
            });
        }
    }

    // Cycle to next class (for A/D keyboard navigation)
    cycleClassNext() {
        if (this.classes.length === 0) return;
        this.currentClassIndex = (this.currentClassIndex + 1) % this.classes.length;
        this.renderClassList();
    }

    // Cycle to previous class (for A/D keyboard navigation)
    cycleClassPrevious() {
        if (this.classes.length === 0) return;
        this.currentClassIndex = (this.currentClassIndex - 1 + this.classes.length) % this.classes.length;
        this.renderClassList();
    }

    // Toggle the currently highlighted class
    toggleCurrentClass() {
        if (this.classes.length === 0) return;
        const currentClass = this.classes[this.currentClassIndex];
        if (currentClass) {
            this.toggleLabel(currentClass.id);
        }
    }

    // Update the labels overlay on the image
    updateLabelsOverlay() {
        const imageContainer = document.querySelector('.classification-image-container');
        const overlay = document.getElementById('classificationLabelsOverlay');

        if (!imageContainer || !overlay) return;

        if (this.labels.length === 0) {
            // Remove border when no labels
            imageContainer.style.border = 'none';
            imageContainer.style.boxShadow = 'none';
            overlay.innerHTML = '';
            return;
        }

        // Get class details for selected labels
        const selectedClasses = this.labels.map(classId => {
            const cls = this.classes.find(c => c.id === classId);
            return cls ? { name: cls.name, color: cls.color } : null;
        }).filter(c => c !== null);

        if (selectedClasses.length === 0) {
            imageContainer.style.border = 'none';
            imageContainer.style.boxShadow = 'none';
            overlay.innerHTML = '';
            return;
        }

        if (selectedClasses.length === 1) {
            // Single label: solid border with class color
            const cls = selectedClasses[0];
            imageContainer.style.border = `8px solid ${cls.color}`;
            imageContainer.style.boxShadow = `0 0 0 2px rgba(0,0,0,0.1), inset 0 0 0 2px rgba(255,255,255,0.5)`;

            // Show class name in corner
            overlay.innerHTML = `
                <div class="classification-label-corner" style="background: ${cls.color}">
                    ${cls.name}
                </div>
            `;
        } else {
            // Multiple labels: use multiple box-shadows for layered effect
            const borderWidth = 8;
            const boxShadows = selectedClasses.map((cls, index) => {
                const offset = index * borderWidth;
                return `0 0 0 ${offset + borderWidth}px ${cls.color}`;
            }).join(', ');

            imageContainer.style.border = 'none';
            imageContainer.style.boxShadow = boxShadows + ', inset 0 0 0 2px rgba(255,255,255,0.5)';

            // Show all class names in corner
            overlay.innerHTML = `
                <div class="classification-labels-corner">
                    ${selectedClasses.map(cls => `
                        <span class="classification-label-tag" style="background: ${cls.color}">
                            ${cls.name}
                        </span>
                    `).join('')}
                </div>
            `;
        }
    }

    // Load an image for classification
    async loadImage(file) {
        return new Promise((resolve, reject) => {
            this.imageName = file.name.replace(/\.[^/.]+$/, '');

            const reader = new FileReader();

            reader.onload = (e) => {
                if (this.imageDisplay) {
                    this.imageDisplay.src = e.target.result;
                    this.imageDisplay.style.display = 'block';
                    const noImageDiv = this.container.querySelector('.classification-no-image');
                    if (noImageDiv) noImageDiv.style.display = 'none';
                }
                this.image = file;
                resolve();
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Set the labels for the current image
    setLabels(labels) {
        this.labels = Array.isArray(labels) ? [...labels] : [];
        this.renderClassList();
        this.updateImageInfo();
        this.updateLabelsOverlay();
    }

    // Get current labels
    getLabels() {
        return [...this.labels];
    }

    // Update image info display
    updateImageInfo() {
        const imageNameEl = document.getElementById('imageName');
        const annotationCountEl = document.getElementById('annotationCount');

        if (imageNameEl) {
            imageNameEl.textContent = this.imageName || '-';
        }

        if (annotationCountEl) {
            annotationCountEl.textContent = this.labels.length;
        }
    }

    // Mark unsaved changes
    markUnsavedChanges() {
        this.hasUnsavedChanges = true;

        // Trigger auto-save if app instance is available
        if (window.app && window.app.scheduleAutoSave) {
            window.app.scheduleAutoSave();
        }
    }

    // Clear unsaved changes flag
    clearUnsavedChanges() {
        this.hasUnsavedChanges = false;
    }

    // Clear the current image and labels
    clear() {
        this.image = null;
        this.imageName = '';
        this.imageId = null;
        this.labels = [];

        if (this.imageDisplay) {
            this.imageDisplay.src = '';
            this.imageDisplay.style.display = 'none';
        }

        const noImageDiv = this.container.querySelector('.classification-no-image');
        if (noImageDiv) noImageDiv.style.display = 'flex';

        this.renderClassList();
        this.updateImageInfo();
    }

    // Destroy the classification UI
    destroy() {
        if (this.classificationUI) {
            this.classificationUI.remove();
            this.classificationUI = null;
        }

        // Show canvas again
        const canvas = document.getElementById('canvas');
        if (canvas) canvas.style.display = 'block';
    }

    // Export classification data
    exportData() {
        if (!this.image || this.labels.length === 0) return null;

        return {
            imageName: this.imageName,
            labels: this.labels,
            classNames: this.labels.map(id => {
                const cls = this.classes.find(c => c.id === id);
                return cls ? cls.name : `Class_${id}`;
            })
        };
    }
}
