/**
 * CANVAS BASE - Abstract Base Class
 * Shared functionality for all canvas types
 *
 * Provides:
 * - Image loading and rendering
 * - Zoom and pan controls
 * - Grid and labels toggle
 * - General shortcuts (zoom, pan, grid, labels)
 * - Coordinate transformations
 * - Event handling framework
 */

class CanvasBase {
    constructor(canvas, ui, projectType) {
        if (this.constructor === CanvasBase) {
            throw new Error("CanvasBase is abstract and cannot be instantiated directly");
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ui = ui;
        this.projectType = projectType;

        // State
        this.image = null;
        this.imageName = '';
        this.imageId = null;
        this.annotations = [];
        this.selectedAnnotation = null;
        this.originalImageBlob = null;

        // Transform state
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.minZoom = 0.1;
        this.maxZoom = 5;
        this.imageRotation = 0;

        // Pan state
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;

        // Classes
        this.classes = [];
        this.currentClass = 0;

        // Settings (shared across all canvas types)
        this.showLabels = true;
        this.showGrid = false;

        // Unsaved changes tracking
        this.hasUnsavedChanges = false;
        this.lastSavedAnnotationsCount = 0;

        // Device pixel ratio for sharp rendering
        this.dpr = window.devicePixelRatio || 1;

        // Shortcuts map - general shortcuts (can be extended by child classes)
        this.shortcuts = this.getGeneralShortcuts();

        // Tool manager compatibility layer - wraps tool methods for backward compatibility
        this.toolManager = {
            setTool: (tool) => {
                if (typeof this.setTool === 'function') {
                    this.setTool(tool);
                }
            },
            setBrushSize: (size) => {
                if (typeof this.setBrushSize === 'function') {
                    this.setBrushSize(size);
                }
            },
            isEraseMode: () => {
                if (typeof this.isEraseMode === 'function') {
                    return this.isEraseMode();
                }
                return false;
            },
            setEraseMode: (enabled) => {
                if (typeof this.setEraseMode === 'function') {
                    this.setEraseMode(enabled);
                }
            }
        };

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupShortcuts();
        this.handleResize();
    }

    // ============================================
    // ABSTRACT METHODS - Must be implemented by child classes
    // ============================================

    drawAnnotation(annotation) {
        throw new Error("drawAnnotation() must be implemented by child class");
    }

    handleDrawStart(x, y) {
        throw new Error("handleDrawStart() must be implemented by child class");
    }

    handleDrawMove(x, y) {
        throw new Error("handleDrawMove() must be implemented by child class");
    }

    handleDrawEnd(x, y) {
        throw new Error("handleDrawEnd() must be implemented by child class");
    }

    // Get specific shortcuts for this canvas type (to be overridden)
    getSpecificShortcuts() {
        return {};
    }

    // Get available tools for this canvas type (to be overridden)
    getAvailableTools() {
        return ['select', 'pan'];
    }

    // ============================================
    // CANVAS SETUP
    // ============================================

    setupCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Set display size (css pixels)
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        // Set actual size in memory (scaled by device pixel ratio)
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;

        // Scale context to match device pixel ratio
        this.ctx.scale(this.dpr, this.dpr);

        // Enable image smoothing for better quality
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    handleResize() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.image) {
                    const wasZoomed = this.zoom !== 1;
                    this.setupCanvas();
                    if (!wasZoomed) {
                        this.fitImageToCanvas();
                    }
                    this.redraw();
                }
            }, 100);
        });
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    handleMouseDown(e) {
        if (!this.image) return;

        const pos = this.getMousePos(e);

        // Pan with middle mouse or Ctrl+Left
        if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
            this.isPanning = true;
            this.panStartX = pos.x;
            this.panStartY = pos.y;
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        // Delegate to child class
        const imgPos = this.canvasToImage(pos.x, pos.y);
        this.handleDrawStart(imgPos.x, imgPos.y);
    }

    handleMouseMove(e) {
        if (!this.image) return;

        const pos = this.getMousePos(e);

        // Handle panning
        if (this.isPanning) {
            const dx = pos.x - this.panStartX;
            const dy = pos.y - this.panStartY;
            this.panX += dx;
            this.panY += dy;
            this.panStartX = pos.x;
            this.panStartY = pos.y;
            this.redraw();
            return;
        }

        // Delegate to child class
        const imgPos = this.canvasToImage(pos.x, pos.y);
        this.handleDrawMove(imgPos.x, imgPos.y);
    }

    handleMouseUp(e) {
        if (!this.image) return;

        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'default';
            return;
        }

        const pos = this.getMousePos(e);
        const imgPos = this.canvasToImage(pos.x, pos.y);
        this.handleDrawEnd(imgPos.x, imgPos.y);
    }

    handleMouseLeave(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'default';
        }
    }

    handleWheel(e) {
        e.preventDefault();
        if (!this.image) return;

        const pos = this.getMousePos(e);
        const delta = e.deltaY > 0 ? 0.9 : 1.1;

        // Zoom towards mouse position
        const imgPosBeforeZoom = this.canvasToImage(pos.x, pos.y);
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * delta));
        const imgPosAfterZoom = this.canvasToImage(pos.x, pos.y);

        // Adjust pan to keep mouse position stable
        this.panX += (imgPosAfterZoom.x - imgPosBeforeZoom.x) * this.zoom;
        this.panY += (imgPosAfterZoom.y - imgPosBeforeZoom.y) * this.zoom;

        this.redraw();
        this.updateZoomDisplay();
    }

    // ============================================
    // SHORTCUTS - General (Zoom, Pan, Grid, Labels)
    // ============================================

    getGeneralShortcuts() {
        return {
            // Zoom controls
            '+': { handler: () => this.zoomIn(), description: 'Zoom In' },
            '=': { handler: () => this.zoomIn(), description: 'Zoom In' },
            '-': { handler: () => this.zoomOut(), description: 'Zoom Out' },
            '0': { handler: () => this.resetZoom(), description: 'Reset Zoom' },

            // View controls
            'g': { handler: () => this.toggleGrid(), description: 'Toggle Grid' },
            'l': { handler: () => this.toggleLabels(), description: 'Toggle Labels' },

            // Navigation (if integrated with gallery)
            'ArrowLeft': { handler: () => this.emit('previousImage'), description: 'Previous Image' },
            'ArrowRight': { handler: () => this.emit('nextImage'), description: 'Next Image' },

            // Pan shortcuts (optional, middle mouse is primary)
            'h': { handler: () => this.emit('activatePanTool'), description: 'Activate Pan Tool' }
        };
    }

    setupShortcuts() {
        // Merge general shortcuts with specific shortcuts from child class
        const specificShortcuts = this.getSpecificShortcuts();
        this.shortcuts = { ...this.shortcuts, ...specificShortcuts };

        // Setup keyboard listener
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input/textarea
            if (e.target.matches('input, textarea')) return;

            const key = e.key;
            const shortcut = this.shortcuts[key];

            if (shortcut) {
                e.preventDefault();
                shortcut.handler();
            }
        });
    }

    // Get all shortcuts for display (general + specific)
    getAllShortcuts() {
        return this.shortcuts;
    }

    // ============================================
    // COORDINATE TRANSFORMATIONS
    // ============================================

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    canvasToImage(x, y) {
        // Remove zoom and pan
        let imgX = (x - this.panX) / this.zoom;
        let imgY = (y - this.panY) / this.zoom;

        // Apply inverse rotation if needed
        if (this.imageRotation !== 0 && this.image) {
            const centerX = this.image.width / 2;
            const centerY = this.image.height / 2;
            const angleRad = -(this.imageRotation * Math.PI) / 180;

            const dx = imgX - centerX;
            const dy = imgY - centerY;

            imgX = centerX + dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
            imgY = centerY + dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
        }

        return { x: imgX, y: imgY };
    }

    imageToCanvas(x, y) {
        return {
            x: x * this.zoom + this.panX,
            y: y * this.zoom + this.panY
        };
    }

    // ============================================
    // IMAGE LOADING
    // ============================================

    async loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.image = img;
                    this.imageName = file.name;
                    this.originalImageBlob = file;
                    this.fitImageToCanvas();
                    this.redraw();
                    this.updateToolAvailability();
                    resolve(img);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    fitImageToCanvas() {
        if (!this.image) return;

        const rect = this.canvas.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        const scaleX = canvasWidth / this.image.width;
        const scaleY = canvasHeight / this.image.height;
        this.zoom = Math.min(scaleX, scaleY) * 0.9;

        this.panX = (canvasWidth - this.image.width * this.zoom) / 2;
        this.panY = (canvasHeight - this.image.height * this.zoom) / 2;

        this.updateZoomDisplay();
    }

    // ============================================
    // ZOOM CONTROLS
    // ============================================

    zoomIn() {
        if (!this.image) return;
        this.zoom = Math.min(this.maxZoom, this.zoom * 1.2);
        this.redraw();
        this.updateZoomDisplay();
    }

    zoomOut() {
        if (!this.image) return;
        this.zoom = Math.max(this.minZoom, this.zoom / 1.2);
        this.redraw();
        this.updateZoomDisplay();
    }

    resetZoom() {
        if (!this.image) return;
        this.fitImageToCanvas();
        this.redraw();
    }

    updateZoomDisplay() {
        const zoomPercent = Math.round(this.zoom * 100);
        const zoomElement = document.getElementById('zoomLevel');
        if (zoomElement) {
            zoomElement.textContent = `${zoomPercent}%`;
        }
    }

    // ============================================
    // VIEW CONTROLS
    // ============================================

    toggleGrid() {
        this.showGrid = !this.showGrid;
        this.redraw();
        const icon = document.querySelector('#btnToggleGrid i');
        if (icon) {
            icon.classList.toggle('fa-th');
            icon.classList.toggle('fa-th-large');
        }
    }

    toggleLabels() {
        this.showLabels = !this.showLabels;
        this.redraw();
        const icon = document.querySelector('#btnToggleLabels i');
        if (icon) {
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
        }
    }

    // ============================================
    // DRAWING
    // ============================================

    redraw() {
        if (!this.image) return;

        // Clear with proper scaling
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        // Reset transform and apply DPR scaling
        this.ctx.save();
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Apply zoom and pan
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);

        // Apply image rotation around center
        if (this.imageRotation !== 0) {
            const centerX = this.image.width / 2;
            const centerY = this.image.height / 2;
            this.ctx.translate(centerX, centerY);
            this.ctx.rotate((this.imageRotation * Math.PI) / 180);
            this.ctx.translate(-centerX, -centerY);
        }

        // Draw image with high quality
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(this.image, 0, 0);

        // Draw grid if enabled
        if (this.showGrid) {
            this.drawGrid();
        }

        // Draw all annotations (delegate to child class)
        this.annotations.forEach(ann => {
            this.drawAnnotation(ann);
        });

        this.ctx.restore();
    }

    drawGrid() {
        if (!this.image) return;

        const gridSize = 50;
        const width = this.image.width;
        const height = this.image.height;

        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.lineWidth = 1 / this.zoom;

        // Vertical lines
        for (let x = gridSize; x < width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = gridSize; y < height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
    }

    // ============================================
    // ANNOTATIONS MANAGEMENT
    // ============================================

    addAnnotation(annotation) {
        this.annotations.push(annotation);
        this.markUnsavedChanges();
        this.redraw();
        this.updateAnnotationsBar();

        // Emit event for UI updates
        if (window.eventBus) {
            window.eventBus.emit('annotationCreated', {
                annotation,
                imageId: this.imageId
            });
        }
    }

    removeAnnotation(annotation) {
        const index = this.annotations.indexOf(annotation);
        if (index !== -1) {
            this.annotations.splice(index, 1);
            if (this.selectedAnnotation === annotation) {
                this.selectedAnnotation = null;
            }
            this.markUnsavedChanges();
            this.redraw();
            this.updateAnnotationsBar();

            // Emit event for UI updates
            if (window.eventBus) {
                window.eventBus.emit('annotationDeleted', {
                    annotation,
                    imageId: this.imageId
                });
            }
        }
    }

    clearAnnotations() {
        this.annotations = [];
        this.selectedAnnotation = null;
        this.markUnsavedChanges();
        this.redraw();
        this.updateAnnotationsBar();
    }

    deleteSelected() {
        if (this.selectedAnnotation) {
            this.removeAnnotation(this.selectedAnnotation);
            this.ui.showToast('Annotation deleted', 'success');
        }
    }

    clearUnsavedChanges() {
        this.hasUnsavedChanges = false;
        this.lastSavedAnnotationsCount = this.annotations.length;
    }

    markUnsavedChanges() {
        this.hasUnsavedChanges = true;

        // Trigger auto-save if app instance is available
        if (window.app && window.app.scheduleAutoSave) {
            window.app.scheduleAutoSave();
        }
    }

    clearCanvas() {
        this.image = null;
        this.imageName = '';
        this.imageId = null;
        this.annotations = [];
        this.selectedAnnotation = null;
        this.originalImageBlob = null;
        this.hasUnsavedChanges = false;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.imageRotation = 0;

        // Clear the canvas visually
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        // Update annotations bar to clear the list
        this.updateAnnotationsBar();
    }

    // ============================================
    // ANNOTATIONS BAR UI
    // ============================================

    updateAnnotationsBar() {
        const annotationsBar = document.getElementById('annotationsBar');
        const annotationsList = document.getElementById('annotationsList');

        if (!annotationsBar || !annotationsList) return;

        // Always show bar, collapse when empty
        annotationsBar.style.display = 'block';

        if (this.annotations.length === 0) {
            annotationsBar.classList.add('collapsed');
            annotationsList.innerHTML = '<div class="empty-annotations">Sin anotaciones</div>';
            return;
        }

        // Remove collapsed class when we have annotations
        annotationsBar.classList.remove('collapsed');

        // Clear list
        annotationsList.innerHTML = '';

        // Add each annotation as a card
        this.annotations.forEach((ann, index) => {
            const cls = this.classes.find(c => c.id === ann.class);
            const className = cls?.name || `Class ${ann.class}`;
            const color = cls?.color || '#ff0000';

            const card = document.createElement('div');
            card.className = 'annotation-card';
            if (ann === this.selectedAnnotation) {
                card.classList.add('selected');
            }

            // Get bounds for bbox, obb, and mask
            let x, y, width, height, cx, cy, angle;
            let typeLabel = '';

            if (ann.type === 'bbox') {
                ({ x, y, width, height } = ann.data);
                typeLabel = 'Box';
            } else if (ann.type === 'obb') {
                ({ cx, cy, width, height, angle } = ann.data);
                // Calculate bounding rect for thumbnail (approximate)
                x = cx - width / 2;
                y = cy - height / 2;
                typeLabel = `OBB ${Math.round(angle)}°`;
            } else if (ann.type === 'mask' && typeof ann.data === 'object' && ann.data.x !== undefined) {
                ({ x, y, width, height } = ann.data);
                typeLabel = 'Mask';
            } else {
                return; // Skip old format masks
            }

            card.innerHTML = `
                <div class="annotation-thumbnail">
                    <canvas width="100" height="75"></canvas>
                    <div class="annotation-overlay">
                        <div class="annotation-class-label" style="background: ${color}">
                            ${className}
                        </div>
                        <div class="annotation-type-badge">${typeLabel}</div>
                        <button class="annotation-delete-btn" data-action="delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;

            // Render thumbnail
            const thumbnailCanvas = card.querySelector('canvas');
            const thumbCtx = thumbnailCanvas.getContext('2d');
            if (this.image) {
                // Calculate scale to fit bbox in thumbnail
                const thumbWidth = 100;
                const thumbHeight = 75;
                const scale = Math.min(thumbWidth / width, thumbHeight / height, 1);

                const drawWidth = width * scale;
                const drawHeight = height * scale;
                const offsetX = (thumbWidth - drawWidth) / 2;
                const offsetY = (thumbHeight - drawHeight) / 2;

                // Clear canvas first
                thumbCtx.clearRect(0, 0, thumbWidth, thumbHeight);

                // Draw cropped image (only the region inside the bbox/mask)
                thumbCtx.drawImage(
                    this.image,
                    x, y, width, height,  // Source coordinates from image
                    offsetX, offsetY, drawWidth, drawHeight  // Destination in canvas
                );

                // Draw mask overlay if it's a mask annotation
                if (ann.type === 'mask' && ann.data.imageData) {
                    if (!ann._cachedImage) {
                        ann._cachedImage = new Image();
                        ann._cachedImage.src = ann.data.imageData;
                    }
                    if (ann._cachedImage.complete) {
                        thumbCtx.globalAlpha = 0.6;
                        thumbCtx.drawImage(
                            ann._cachedImage,
                            0, 0, width, height,
                            offsetX, offsetY, drawWidth, drawHeight
                        );
                        thumbCtx.globalAlpha = 1;
                    }
                }

                // Draw border around the entire thumbnail
                thumbCtx.strokeStyle = color;
                thumbCtx.lineWidth = 3;
                thumbCtx.strokeRect(offsetX, offsetY, drawWidth, drawHeight);
            }

            // Click to select
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.annotation-delete-btn')) {
                    this.selectedAnnotation = ann;
                    this.redraw();
                    this.updateAnnotationsBar();
                }
            });

            // Delete button
            const deleteBtn = card.querySelector('.annotation-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = this.annotations.indexOf(ann);
                    if (index > -1) {
                        this.annotations.splice(index, 1);
                        if (this.selectedAnnotation === ann) {
                            this.selectedAnnotation = null;
                        }
                        this.markUnsavedChanges();
                        this.redraw();
                        this.updateAnnotationsBar();
                    }
                });
            }

            annotationsList.appendChild(card);
        });

        // If no annotations were added (all were old format), show empty message
        if (annotationsList.children.length === 0) {
            annotationsList.innerHTML = '<div class="empty-annotations">No hay anotaciones en esta imagen</div>';
        }
    }

    // ============================================
    // TOOL VALIDATION
    // ============================================

    isToolValid(tool) {
        const availableTools = this.getAvailableTools();
        return availableTools.includes(tool);
    }

    // ============================================
    // ROTATION METHODS (for OBB/rotation support)
    // These can be overridden in child classes that support rotation
    // ============================================

    setImageRotation(angle) {
        this.imageRotation = angle;
        this.redraw();
    }

    resetImageRotation() {
        this.imageRotation = 0;
        this.redraw();
        const rotationSlider = document.getElementById('rotationSlider');
        const rotationValue = document.getElementById('rotationValue');
        if (rotationSlider) rotationSlider.value = 0;
        if (rotationValue) rotationValue.textContent = '0°';
    }

    // ============================================
    // MASK INSTANCE METHODS (for segmentation support)
    // These can be overridden in mask canvas classes
    // ============================================

    startNewMaskInstance() {
        // No-op in base class - mask canvases will override
        console.log('startNewMaskInstance called on non-mask canvas');
    }

    // ============================================
    // TOOL AVAILABILITY (UI Management)
    // ============================================

    updateToolAvailability() {
        // Get available tools for this canvas type
        const availableTools = this.getAvailableTools();

        // Update tool button visibility
        const toolButtons = {
            'bbox': document.querySelector('[data-tool="bbox"]'),
            'obb': document.querySelector('[data-tool="obb"]'),
            'mask': document.querySelector('[data-tool="mask"]'),
            'keypoints': document.querySelector('[data-tool="keypoints"]')
        };

        // Show/hide tool buttons based on availability
        for (const [tool, button] of Object.entries(toolButtons)) {
            if (button) {
                button.style.display = availableTools.includes(tool) ? 'flex' : 'none';
            }
        }

        // Handle mask-specific controls
        const eraseBtn = document.getElementById('btnEraseMode');
        const maskControls = document.getElementById('maskControls');
        const showMask = availableTools.includes('mask');

        if (eraseBtn) {
            eraseBtn.style.display = showMask ? 'flex' : 'none';
        }

        if (maskControls) {
            maskControls.style.display = showMask ? 'flex' : 'none';
        }

        // Handle OBB-specific controls
        const rotationControls = document.getElementById('rotationControls');
        const showObb = availableTools.includes('obb');

        if (rotationControls) {
            rotationControls.style.display = showObb ? 'flex' : 'none';
        }

        // Handle keypoints-specific controls
        const keypointControls = document.getElementById('keypointControls');
        const showKeypoints = availableTools.includes('keypoints');

        if (keypointControls) {
            keypointControls.style.display = showKeypoints ? 'flex' : 'none';
        }

        // Hide time series tools (point, range)
        const pointBtn = document.querySelector('[data-tool="point"]');
        const rangeBtn = document.querySelector('[data-tool="range"]');

        if (pointBtn) pointBtn.style.display = 'none';
        if (rangeBtn) rangeBtn.style.display = 'none';

        // Show zoom and view controls, hide scale controls for images
        const scaleControls = document.getElementById('scaleControls');
        const zoomControls = document.getElementById('zoomControls');
        const viewControls = document.getElementById('viewControls');

        if (scaleControls) scaleControls.style.display = 'none';
        if (zoomControls) zoomControls.style.display = 'flex';
        if (viewControls) viewControls.style.display = 'flex';
    }

    // ============================================
    // EVENT EMITTER (for communication with app.js)
    // ============================================

    emit(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        this.canvas.dispatchEvent(event);
    }

    on(eventName, handler) {
        this.canvas.addEventListener(eventName, handler);
    }

    // ============================================
    // CLEANUP
    // ============================================

    destroy() {
        // Remove event listeners
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
        this.canvas.removeEventListener('wheel', this.handleWheel);

        // Clear annotations bar when destroying canvas
        const annotationsList = document.getElementById('annotationsList');
        if (annotationsList) {
            annotationsList.innerHTML = '<div class="empty-annotations">Sin anotaciones</div>';
        }

        const annotationsBar = document.getElementById('annotationsBar');
        if (annotationsBar) {
            annotationsBar.classList.add('collapsed');
        }
    }
}
