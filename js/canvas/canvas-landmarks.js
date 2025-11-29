/**
 * CANVAS LANDMARKS - Independent Point Annotations
 * Handles landmark/point annotations without connections
 *
 * Features:
 * - Click to place independent points
 * - Each point can have different class
 * - Optional custom names for points
 * - Drag points to reposition
 * - Auto-numbering (Point 1, Point 2, etc.)
 * - Counter per class
 * - Shortcuts: L (landmark tool), V (select), D (delete)
 *
 * Tools: landmark, select, pan
 *
 * Use cases:
 * - Mark centers of objects
 * - Reference points
 * - Object counting by points
 * - Interest points without structure
 *
 * Difference from Keypoints:
 * - Keypoints: Structured skeleton with fixed connections
 * - Landmarks: Free points without connections or order
 */

class CanvasLandmarks extends CanvasBase {
    constructor(canvas, ui, projectType) {
        super(canvas, ui, projectType);

        // Landmarks-specific state
        this.hoverLandmarkIndex = null; // Landmark under cursor
        this.isDraggingLandmark = false;
        this.draggedLandmarkIndex = null;

        // Visual settings
        this.pointRadius = 6; // Visual radius of landmarks
        this.autoNumber = true; // Auto-number landmarks

        // Current tool
        this.currentTool = 'landmark'; // 'landmark', 'select', 'pan'
    }

    // ============================================
    // TOOL MANAGEMENT
    // ============================================

    getAvailableTools() {
        return ['landmark', 'select', 'pan'];
    }

    setTool(tool) {
        if (!this.getAvailableTools().includes(tool)) {
            console.warn(`Tool "${tool}" not available for landmarks canvas`);
            return;
        }
        this.currentTool = tool;
        this.updateCursor();
    }

    updateCursor() {
        const cursorMap = {
            'landmark': 'crosshair',
            'select': 'default',
            'pan': 'grab'
        };
        this.canvas.style.cursor = cursorMap[this.currentTool] || 'default';
    }

    // ============================================
    // SHORTCUTS - Specific to Landmarks
    // ============================================

    getSpecificShortcuts() {
        return {
            // Tools
            'l': { handler: () => this.setTool('landmark'), description: 'Landmark Tool' },
            'v': { handler: () => this.setTool('select'), description: 'Select Tool' },

            // Actions
            'Delete': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'Backspace': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'd': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'r': { handler: () => this.renameLandmark(), description: 'Rename Landmark' },

            // Class selection (1-9)
            '1': { handler: () => this.selectClass(0), description: 'Select Class 1' },
            '2': { handler: () => this.selectClass(1), description: 'Select Class 2' },
            '3': { handler: () => this.selectClass(2), description: 'Select Class 3' },
            '4': { handler: () => this.selectClass(3), description: 'Select Class 4' },
            '5': { handler: () => this.selectClass(4), description: 'Select Class 5' },
            '6': { handler: () => this.selectClass(5), description: 'Select Class 6' },
            '7': { handler: () => this.selectClass(6), description: 'Select Class 7' },
            '8': { handler: () => this.selectClass(7), description: 'Select Class 8' },
            '9': { handler: () => this.selectClass(8), description: 'Select Class 9' }
        };
    }

    selectClass(index) {
        if (index < this.classes.length) {
            this.currentClass = this.classes[index].id;
            this.emit('classChanged', { classId: this.currentClass });
        }
    }

    // ============================================
    // DRAWING LOGIC
    // ============================================

    handleDrawStart(x, y) {
        if (this.currentTool === 'landmark') {
            // Validate classes exist
            if (!this.classes || this.classes.length === 0) {
                this.ui.showToast(window.i18n.t('annotations.addClassFirst'), 'warning');
                return;
            }

            // Generate automatic name
            const landmarksOfClass = this.annotations.filter(a =>
                a.type === 'landmark' && a.class === (this.classes[this.currentClass]?.id || 0)
            );
            const landmarkNumber = landmarksOfClass.length + 1;
            const autoName = `Point ${landmarkNumber}`;

            // Create landmark
            const landmark = {
                type: 'landmark',
                class: this.classes[this.currentClass]?.id || 0,
                data: {
                    x: x,
                    y: y,
                    name: autoName,
                    id: `landmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                }
            };

            this.addAnnotation(landmark);
            this.selectedAnnotation = landmark;
            this.hasUnsavedChanges = true;
            this.redraw();
            this.ui.showToast(window.i18n.t('landmarks.placed', { name: autoName }), 'success');

        } else if (this.currentTool === 'select') {
            // Check if clicking on a landmark
            const { annotation, index } = this.getLandmarkAtPosition(x, y);
            if (annotation) {
                this.selectedAnnotation = annotation;
                this.isDraggingLandmark = true;
                this.draggedLandmarkIndex = index;
                this.redraw();
            } else {
                this.selectedAnnotation = null;
                this.redraw();
            }
        }
    }

    handleDrawMove(x, y) {
        if (this.currentTool === 'select' && this.isDraggingLandmark && this.selectedAnnotation) {
            // Move landmark
            this.selectedAnnotation.data.x = x;
            this.selectedAnnotation.data.y = y;
            this.hasUnsavedChanges = true;
            this.redraw();
        } else if (this.currentTool === 'select') {
            // Update hover state
            const { annotation, index } = this.getLandmarkAtPosition(x, y);
            this.hoverLandmarkIndex = index >= 0 ? index : null;
            if (this.hoverLandmarkIndex !== null) {
                this.canvas.style.cursor = 'pointer';
            } else {
                this.updateCursor();
            }
            this.redraw();
        }
    }

    handleDrawEnd(x, y) {
        if (this.isDraggingLandmark) {
            this.isDraggingLandmark = false;
            this.draggedLandmarkIndex = null;
        }
    }

    // ============================================
    // DRAWING
    // ============================================

    drawAnnotation(annotation) {
        if (annotation.type === 'landmark') {
            this.drawLandmark(annotation);
        }
    }

    drawLandmark(annotation) {
        const cls = this.classes.find(c => c.id === annotation.class);
        const color = cls?.color || '#ff0000';
        const isSelected = annotation === this.selectedAnnotation;
        const { x, y, name } = annotation.data;

        // Find landmark index for hover detection
        const landmarkIndex = this.annotations.indexOf(annotation);
        const isHovered = this.hoverLandmarkIndex === landmarkIndex;

        // Draw outer circle (larger if selected or hovered)
        const outerRadius = (isSelected || isHovered) ? 10 / this.zoom : 8 / this.zoom;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw inner circle (white)
        const innerRadius = (isSelected || isHovered) ? 6 / this.zoom : 4 / this.zoom;
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw center dot
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 2 / this.zoom, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw selection ring
        if (isSelected) {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([3 / this.zoom, 3 / this.zoom]);
            this.ctx.beginPath();
            this.ctx.arc(x, y, 14 / this.zoom, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Draw label with name
        if (this.showLabels || isSelected || isHovered) {
            this.ctx.fillStyle = color;
            this.ctx.font = `${12 / this.zoom}px Arial`;
            const labelText = name || 'Point';
            const textWidth = this.ctx.measureText(labelText).width;

            // Background
            this.ctx.fillRect(
                x + 12 / this.zoom,
                y - 14 / this.zoom,
                textWidth + 8 / this.zoom,
                16 / this.zoom
            );

            // Text
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(
                labelText,
                x + 16 / this.zoom,
                y - 2 / this.zoom
            );

            // Class label if not default
            if (cls) {
                this.ctx.fillStyle = color;
                this.ctx.font = `${10 / this.zoom}px Arial`;
                this.ctx.fillText(
                    cls.name,
                    x + 16 / this.zoom,
                    y + 10 / this.zoom
                );
            }
        }
    }

    // ============================================
    // SELECTION & INTERACTION
    // ============================================

    getLandmarkAtPosition(x, y) {
        const threshold = 10 / this.zoom;

        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            if (ann.type === 'landmark') {
                const lx = ann.data.x;
                const ly = ann.data.y;
                const dist = Math.hypot(x - lx, y - ly);

                if (dist <= threshold) {
                    return { annotation: ann, index: i };
                }
            }
        }

        return { annotation: null, index: -1 };
    }

    // ============================================
    // LANDMARK MANAGEMENT
    // ============================================

    renameLandmark() {
        if (!this.selectedAnnotation || this.selectedAnnotation.type !== 'landmark') {
            this.ui.showToast(window.i18n.t('landmarks.selectFirst'), 'warning');
            return;
        }

        const currentName = this.selectedAnnotation.data.name || '';

        this.ui.showModal(
            window.i18n.t('landmarks.renameLandmark'),
            `
                <div class="form-group">
                    <label class="form-label">${window.i18n.t('landmarks.landmarkName')}</label>
                    <input type="text" id="landmarkNameInput" class="form-control"
                           value="${currentName}" placeholder="${window.i18n.t('landmarks.namePlaceholder')}">
                </div>
            `,
            [
                {
                    text: 'Cancel',
                    type: 'secondary',
                    action: 'cancel',
                    handler: (modal, close) => close()
                },
                {
                    text: 'Save',
                    type: 'primary',
                    icon: 'fas fa-save',
                    action: 'save',
                    handler: (modal, close) => {
                        const input = modal.querySelector('#landmarkNameInput');
                        const newName = input.value.trim();

                        if (!newName) {
                            this.ui.showToast(window.i18n.t('landmarks.enterName'), 'warning');
                            return;
                        }

                        this.selectedAnnotation.data.name = newName;
                        this.hasUnsavedChanges = true;
                        this.redraw();
                        this.ui.showToast(window.i18n.t('landmarks.renamed'), 'success');
                        close();
                    }
                }
            ]
        );

        // Focus input
        setTimeout(() => {
            const input = document.getElementById('landmarkNameInput');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    }

    // Get count of landmarks per class
    getLandmarkCounts() {
        const counts = {};
        this.classes.forEach(cls => {
            counts[cls.id] = 0;
        });

        this.annotations.forEach(ann => {
            if (ann.type === 'landmark') {
                counts[ann.class] = (counts[ann.class] || 0) + 1;
            }
        });

        return counts;
    }

    // Renumber all landmarks of current class
    renumberLandmarks() {
        const classId = this.classes[this.currentClass]?.id;
        if (classId === undefined) return;

        const landmarksOfClass = this.annotations.filter(a =>
            a.type === 'landmark' && a.class === classId
        );

        landmarksOfClass.forEach((landmark, idx) => {
            landmark.data.name = `Point ${idx + 1}`;
        });

        this.hasUnsavedChanges = true;
        this.redraw();
        this.ui.showToast(window.i18n.t('landmarks.renumbered', { count: landmarksOfClass.length }), 'success');
    }
}
