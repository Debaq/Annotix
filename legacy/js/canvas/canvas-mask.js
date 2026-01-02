/**
 * CANVAS MASK - Segmentation (Semantic & Instance)
 * Handles mask/brush-based annotations
 *
 * Features:
 * - Draw masks with brush tool
 * - Erase mode to remove painted areas
 * - Edit existing masks: Double-click on a mask to load it for editing
 * - Adjustable brush size
 * - Multiple instances (for instance segmentation)
 * - Opacity control
 * - Shortcuts: M (mask tool), E (erase mode), [ (decrease brush), ] (increase brush), N (new instance)
 *
 * Tools: mask (brush), select, pan
 */

class CanvasMask extends CanvasBase {
    constructor(canvas, ui, projectType) {
        super(canvas, ui, projectType);

        // Mask-specific state
        this.isDrawing = false;
        this.maskOpacity = 0.5;

        // Brush settings
        this.brushSize = 20;
        this.minBrushSize = 5;
        this.maxBrushSize = 100;
        this.eraseMode = false;

        // Current mask being drawn
        this.currentMaskCanvas = null;
        this.currentMaskCtx = null;
        this.currentMaskBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        // Drag state (for moving/selecting masks)
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Double-click detection for editing masks
        this.lastClickTime = null;

        // Current tool
        this.currentTool = 'mask'; // 'mask', 'select', 'pan'
    }

    // ============================================
    // TOOL MANAGEMENT
    // ============================================

    getAvailableTools() {
        return ['mask', 'select', 'pan'];
    }

    setTool(tool) {
        if (!this.getAvailableTools().includes(tool)) {
            console.warn(`Tool "${tool}" not available for mask canvas`);
            return;
        }

        // Clear any pending auto-save when switching tools
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }

        this.currentTool = tool;
        this.updateCursor();
    }

    updateCursor() {
        if (this.currentTool === 'mask') {
            this.canvas.style.cursor = 'crosshair';
        } else if (this.currentTool === 'select') {
            this.canvas.style.cursor = 'default';
        } else if (this.currentTool === 'pan') {
            this.canvas.style.cursor = 'grab';
        }
    }

    // ============================================
    // SHORTCUTS - Specific to Mask
    // ============================================

    getSpecificShortcuts() {
        return {
            // Tools
            'm': { handler: () => this.setTool('mask'), description: 'Mask Tool' },
            'v': { handler: () => this.setTool('select'), description: 'Select Tool' },

            // Brush controls
            'e': { handler: () => this.toggleEraseMode(), description: 'Toggle Erase Mode' },
            '[': { handler: () => this.decreaseBrushSize(), description: 'Decrease Brush Size' },
            ']': { handler: () => this.increaseBrushSize(), description: 'Increase Brush Size' },

            // Mask management
            'Enter': { handler: () => this.finishCurrentMask(), description: 'Save Current Mask (Enter)' },
            'n': { handler: () => this.newMaskInstance(), description: 'New Mask Instance' },
            'Delete': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'Backspace': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'd': { handler: () => this.deleteSelected(), description: 'Delete Selected' },

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

    toggleEraseMode() {
        this.eraseMode = !this.eraseMode;

        // Clear any pending auto-save when switching modes
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }

        this.updateEraseButton();
        this.ui.showToast(this.eraseMode ? 'Erase mode ON' : 'Erase mode OFF', 'info');
    }

    updateEraseButton() {
        const eraseBtn = document.getElementById('btnEraseMode');
        if (eraseBtn) {
            eraseBtn.classList.toggle('active', this.eraseMode);
        }
    }

    decreaseBrushSize() {
        this.brushSize = Math.max(this.minBrushSize, this.brushSize - 5);
        this.updateBrushDisplay();
        this.ui.showToast(`Brush size: ${this.brushSize}px`, 'info');
    }

    increaseBrushSize() {
        this.brushSize = Math.min(this.maxBrushSize, this.brushSize + 5);
        this.updateBrushDisplay();
        this.ui.showToast(`Brush size: ${this.brushSize}px`, 'info');
    }

    updateBrushDisplay() {
        const slider = document.getElementById('brushSizeSlider');
        const display = document.getElementById('brushSizeValue');
        if (slider) slider.value = this.brushSize;
        if (display) display.textContent = `${this.brushSize}px`;
    }

    newMaskInstance() {
        if (this.currentMaskCanvas) {
            // Save current mask before starting new one
            this.saveMask();
        }
        this.ui.showToast('New mask instance started', 'success');
    }

    // ============================================
    // DRAWING LOGIC
    // ============================================

    handleDrawStart(x, y) {
        if (this.currentTool === 'mask') {
            // Validate classes exist before allowing annotation
            if (!this.classes || this.classes.length === 0) {
                this.ui.showToast('Add at least one class before annotating', 'warning');
                return;
            }

            this.isDrawing = true;

            // Create temporary mask canvas if not exists
            if (!this.currentMaskCanvas) {
                this.initMaskCanvas();
            }

            // Start drawing on mask canvas
            this.drawBrush(x, y);
            this.lastX = x;
            this.lastY = y;
        } else if (this.currentTool === 'select') {
            // Check if clicking on existing mask
            const clickedMask = this.getMaskAtPosition(x, y);
            if (clickedMask) {
                // Check for double-click to edit mask
                const now = Date.now();
                if (this.selectedAnnotation === clickedMask &&
                    this.lastClickTime &&
                    (now - this.lastClickTime) < 300) {
                    // Double-click detected - load mask for editing
                    this.loadMaskForEditing(clickedMask);
                    this.lastClickTime = null;
                    return;
                }

                this.selectedAnnotation = clickedMask;
                this.isDragging = true;
                this.dragOffsetX = x - clickedMask.data.x;
                this.dragOffsetY = y - clickedMask.data.y;
                this.lastClickTime = now;
                this.redraw();
            } else {
                this.selectedAnnotation = null;
                this.lastClickTime = null;
                this.redraw();
            }
        }
    }

    handleDrawMove(x, y) {
        if (this.currentTool === 'mask' && this.isDrawing) {
            // Interpolate between last position and current for smooth drawing
            this.interpolateBrush(this.lastX, this.lastY, x, y);
            this.lastX = x;
            this.lastY = y;
            this.redraw();
        } else if (this.currentTool === 'select' && this.isDragging && this.selectedAnnotation) {
            // Drag mask (move position)
            this.selectedAnnotation.data.x = x - this.dragOffsetX;
            this.selectedAnnotation.data.y = y - this.dragOffsetY;
            this.hasUnsavedChanges = true;
            this.redraw();
        }
    }

    handleDrawEnd(x, y) {
        if (this.currentTool === 'mask' && this.isDrawing) {
            this.isDrawing = false;

            // ALWAYS clear any existing timeout first to prevent stale auto-saves
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = null;
            }

            // Don't auto-save in erase mode, let user manually save or finish
            // Auto-save only when actually painting (not erasing)
            if (!this.eraseMode && this.currentMaskCanvas) {
                this.autoSaveTimeout = setTimeout(() => {
                    this.saveMask();
                }, 2000); // Save 2 seconds after user stops drawing
            }
        } else if (this.currentTool === 'select' && this.isDragging) {
            this.isDragging = false;
        }
    }

    initMaskCanvas() {
        if (!this.image) return;

        this.currentMaskCanvas = document.createElement('canvas');
        this.currentMaskCanvas.width = this.image.width;
        this.currentMaskCanvas.height = this.image.height;
        this.currentMaskCtx = this.currentMaskCanvas.getContext('2d');

        // Reset bounds
        this.currentMaskBounds = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        };

        // Ensure currentClass is valid
        if (this.classes.length > 0 && (this.currentClass === undefined || this.currentClass === null)) {
            this.currentClass = this.classes[0].id;
        }

        // Set brush color based on current class
        const cls = this.classes.find(c => c.id === this.currentClass);
        const color = cls?.color || '#ff0000';
        this.currentMaskCtx.fillStyle = color;
    }

    drawBrush(x, y) {
        if (!this.currentMaskCtx) return;

        this.currentMaskCtx.globalCompositeOperation = this.eraseMode ? 'destination-out' : 'source-over';

        this.currentMaskCtx.beginPath();
        this.currentMaskCtx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
        this.currentMaskCtx.fill();

        // Update bounds
        if (!this.eraseMode) {
            this.currentMaskBounds.minX = Math.min(this.currentMaskBounds.minX, x - this.brushSize / 2);
            this.currentMaskBounds.minY = Math.min(this.currentMaskBounds.minY, y - this.brushSize / 2);
            this.currentMaskBounds.maxX = Math.max(this.currentMaskBounds.maxX, x + this.brushSize / 2);
            this.currentMaskBounds.maxY = Math.max(this.currentMaskBounds.maxY, y + this.brushSize / 2);
        }
    }

    interpolateBrush(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.max(1, Math.floor(dist / 2));

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            this.drawBrush(x, y);
        }
    }

    saveMask() {
        if (!this.currentMaskCanvas) {
            return;
        }

        // Check if mask has any content
        const fullImageData = this.currentMaskCtx.getImageData(
            0, 0,
            this.currentMaskCanvas.width,
            this.currentMaskCanvas.height
        );

        let hasContent = false;
        for (let i = 3; i < fullImageData.data.length; i += 4) {
            if (fullImageData.data[i] > 0) {
                hasContent = true;
                break;
            }
        }

        if (!hasContent) {
            // Mask is empty after erasing - discard silently
            this.currentMaskCanvas = null;
            this.currentMaskCtx = null;
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
                this.autoSaveTimeout = null;
            }
            this.redraw();
            return;
        }

        // Recalculate tight bounds based on actual painted pixels
        let minX = this.currentMaskCanvas.width;
        let minY = this.currentMaskCanvas.height;
        let maxX = 0;
        let maxY = 0;

        for (let y = 0; y < this.currentMaskCanvas.height; y++) {
            for (let x = 0; x < this.currentMaskCanvas.width; x++) {
                const i = (y * this.currentMaskCanvas.width + x) * 4 + 3; // Alpha channel
                if (fullImageData.data[i] > 0) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        // Add some padding
        const padding = Math.ceil(this.brushSize / 2);
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(this.currentMaskCanvas.width - 1, maxX + padding);
        maxY = Math.min(this.currentMaskCanvas.height - 1, maxY + padding);

        const x = minX;
        const y = minY;
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        // Create a temporary canvas for the cropped region
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = width;
        croppedCanvas.height = height;
        const croppedCtx = croppedCanvas.getContext('2d');

        // Copy only the painted region
        croppedCtx.drawImage(
            this.currentMaskCanvas,
            x, y, width, height,  // Source
            0, 0, width, height   // Destination
        );

        // Save mask as annotation with cropped data
        const annotation = {
            type: 'mask',
            class: this.currentClass,
            data: {
                imageData: croppedCanvas.toDataURL('image/png'),
                x: x,
                y: y,
                width: width,
                height: height
            }
        };

        // Clear current mask canvas BEFORE adding annotation to prevent flash
        this.currentMaskCanvas = null;
        this.currentMaskCtx = null;

        // Clear auto-save timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }

        // Add annotation (this will trigger markUnsavedChanges -> scheduleAutoSave)
        this.addAnnotation(annotation);

        // Show toast without triggering another redraw
        this.ui.showToast('Mask saved', 'success');
    }

    // ============================================
    // DRAWING
    // ============================================

    redraw() {
        super.redraw();

        // Draw current mask being painted (if any)
        if (this.currentMaskCanvas && this.currentTool === 'mask') {
            this.ctx.save();
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.ctx.translate(this.panX, this.panY);
            this.ctx.scale(this.zoom, this.zoom);

            this.ctx.globalAlpha = this.maskOpacity;
            this.ctx.drawImage(this.currentMaskCanvas, 0, 0);
            this.ctx.globalAlpha = 1;

            this.ctx.restore();
        }
    }

    drawAnnotation(annotation) {
        if (annotation.type === 'mask') {
            this.drawMask(annotation);
        }
    }

    drawMask(annotation) {
        const cls = this.classes.find(c => c.id === annotation.class);
        const color = cls?.color || '#ff0000';
        const isSelected = annotation === this.selectedAnnotation;

        // Handle old format (string) for backward compatibility
        if (typeof annotation.data === 'string') {
            const img = new Image();
            img.onload = () => {
                this.ctx.globalAlpha = this.maskOpacity;
                this.ctx.drawImage(img, 0, 0);
                this.ctx.globalAlpha = 1;
            };
            if (!img.src) {
                img.src = annotation.data;
            }
            return;
        }

        // New format with position data
        const { imageData, x, y, width, height } = annotation.data;

        // Create image cache if not exists
        if (!annotation._cachedImage) {
            annotation._cachedImage = new Image();
            annotation._cachedImage.src = imageData;
        }

        const img = annotation._cachedImage;
        if (img.complete) {
            this.ctx.globalAlpha = this.maskOpacity;
            this.ctx.drawImage(img, x, y, width, height);
            this.ctx.globalAlpha = 1;

            // Draw bounding box if selected
            if (isSelected) {
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 3 / this.zoom;
                this.ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
                this.ctx.strokeRect(x, y, width, height);
                this.ctx.setLineDash([]);
            }

            // Draw label if enabled
            if (this.showLabels && cls) {
                this.ctx.fillStyle = color;
                this.ctx.font = `${14 / this.zoom}px Arial`;
                const textWidth = this.ctx.measureText(cls.name).width;
                this.ctx.fillRect(x, y - 20 / this.zoom, textWidth + 10 / this.zoom, 20 / this.zoom);
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText(cls.name, x + 5 / this.zoom, y - 5 / this.zoom);
            }
        } else {
            img.onload = () => this.redraw();
        }
    }

    // ============================================
    // SELECTION & INTERACTION
    // ============================================

    getMaskAtPosition(x, y) {
        // Simple bounding box check (more efficient than pixel-perfect)
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            if (ann.type === 'mask' && typeof ann.data !== 'string') {
                const { x: mx, y: my, width, height } = ann.data;
                if (x >= mx && x <= mx + width && y >= my && y <= my + height) {
                    return ann;
                }
            }
        }
        return null;
    }

    // ============================================
    // OVERRIDE BASE CLASS METHODS
    // ============================================

    clearCanvas() {
        // Clear temporary mask canvas
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.currentMaskCanvas = null;
        this.currentMaskCtx = null;

        // Call parent clearCanvas
        super.clearCanvas();
    }

    async loadImage(file) {
        // Clear any temporary mask before loading new image
        if (this.currentMaskCanvas) {
            if (this.autoSaveTimeout) {
                clearTimeout(this.autoSaveTimeout);
            }
            this.currentMaskCanvas = null;
            this.currentMaskCtx = null;
        }

        // Call parent loadImage
        return super.loadImage(file);
    }

    startNewMaskInstance() {
        // Save current mask if exists
        if (this.currentMaskCanvas) {
            this.saveMask();
        }
        this.ui.showToast('New mask instance started', 'success');
    }

    loadMaskForEditing(maskAnnotation) {
        // Save any current mask being edited
        if (this.currentMaskCanvas) {
            this.saveMask();
        }

        // Create canvas at full image size
        this.currentMaskCanvas = document.createElement('canvas');
        this.currentMaskCanvas.width = this.image.width;
        this.currentMaskCanvas.height = this.image.height;
        this.currentMaskCtx = this.currentMaskCanvas.getContext('2d');

        // Load the mask image onto the canvas
        const img = new Image();
        img.onload = () => {
            const { x, y, width, height } = maskAnnotation.data;
            this.currentMaskCtx.drawImage(img, x, y, width, height);

            // Set the current class to match the mask's class
            this.currentClass = maskAnnotation.class;
            this.emit('classChanged', { classId: this.currentClass });

            // Remove the annotation from the array (we're editing it now)
            const index = this.annotations.indexOf(maskAnnotation);
            if (index !== -1) {
                this.annotations.splice(index, 1);
            }

            // Switch to mask tool for editing
            this.setTool('mask');
            this.selectedAnnotation = null;

            // Redraw to show the editable mask
            this.redraw();

            // Emit event for UI updates - this is a modification event
            if (window.eventBus) {
                window.eventBus.emit('annotationModified', {
                    annotation: maskAnnotation,
                    imageId: this.imageId
                });
            }

            this.ui.showToast('Mask loaded for editing - you can now paint or erase', 'info');
        };
        img.src = maskAnnotation.data.imageData;
    }

    // ============================================
    // PUBLIC METHODS (called from UI)
    // ============================================

    setBrushSize(size) {
        this.brushSize = Math.max(this.minBrushSize, Math.min(this.maxBrushSize, size));
        this.updateBrushDisplay();
    }

    isEraseMode() {
        return this.eraseMode;
    }

    setEraseMode(enabled) {
        this.eraseMode = enabled;

        // Clear any pending auto-save when switching modes
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }

        this.updateEraseButton();
        this.ui.showToast(this.eraseMode ? 'Erase mode ON' : 'Erase mode OFF', 'info');
    }

    setMaskOpacity(opacity) {
        this.maskOpacity = opacity;
        this.redraw();
    }

    finishCurrentMask() {
        if (this.currentMaskCanvas) {
            this.saveMask();
        }
    }
}
