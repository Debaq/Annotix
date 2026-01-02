/**
 * CANVAS MANAGER - FIXED VERSION
 * Main annotation canvas - handles drawing, editing, zoom, pan
 *
 * FIXES:
 * - Proper canvas resolution handling (devicePixelRatio)
 * - Sharp image rendering without pixelation
 * - Dynamic resize handling
 * - High-quality image smoothing
 * - Working mask system with rendering
 * - Project type validation (bbox vs mask)
 */

class CanvasManager {
    constructor(canvas, ui) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ui = ui;

        // State
        this.image = null;
        this.imageName = '';
        this.imageId = null;
        this.annotations = [];
        this.selectedAnnotation = null;

        // Project type ('bbox' or 'mask')
        this.projectType = 'bbox';

        // Drawing state
        this.isDrawing = false;
        this.isPanning = false;
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;

        // Transform state
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.minZoom = 0.1;
        this.maxZoom = 5;
        this.imageRotation = 0; // Image rotation in degrees

        // Resize handle state
        this.resizeHandle = null;
        this.originalBox = null;

        // Move state for dragging boxes
        this.isDraggingBox = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Rotation handle state (for OBB)
        this.isRotating = false;
        this.rotationStartAngle = 0;

        // Tool manager
        this.toolManager = new ToolManager();

        // Classes
        this.classes = [];
        this.currentClass = 0;

        // Settings
        this.showLabels = true;
        this.showGrid = false;
        this.maskOpacity = 0.5;

        // Unsaved changes tracking
        this.hasUnsavedChanges = false;
        this.lastSavedAnnotationsCount = 0;

        // Store original image blob
        this.originalImageBlob = null;

        // Device pixel ratio for sharp rendering
        this.dpr = window.devicePixelRatio || 1;

        this.setupEventListeners();
        this.setupCanvas();
        this.handleResize();
    }

    // Set project type and validate tools
    setProjectType(type) {
        this.projectType = type;
        console.log('Project type set to:', type);

        // Map project types to available tools
        const toolMapping = {
            'classification': null,      // No canvas tools needed
            'multiLabel': null,          // No canvas tools needed
            'detection': 'bbox',         // Bounding boxes
            'segmentation': 'mask',      // Semantic segmentation
            'instanceSeg': 'mask',       // Instance segmentation
            'keypoints': null,           // Not yet implemented
            'obb': 'obb'                 // Oriented bounding boxes
        };

        const recommendedTool = toolMapping[type];

        // Auto-select appropriate tool based on project type
        if (recommendedTool && this.toolManager.getTool() !== recommendedTool) {
            this.toolManager.setTool(recommendedTool);
        }

        // Update UI to reflect available tools
        this.updateToolAvailability();
    }

    // Check if current tool is valid for project type
    isToolValid(tool) {
        if (tool === 'select' || tool === 'pan') return true;

        // Tool validation based on project type
        const validTools = {
            'classification': ['select', 'pan'],
            'multiLabel': ['select', 'pan'],
            'detection': ['bbox', 'select', 'pan'],
            'segmentation': ['mask', 'select', 'pan'],
            'instanceSeg': ['mask', 'select', 'pan'],
            'keypoints': ['select', 'pan'],  // Not yet implemented
            'obb': ['obb', 'select', 'pan']  // Oriented bounding boxes
        };

        const allowed = validTools[this.projectType] || [];
        return allowed.includes(tool);
    }

    // Update UI to show/hide tools based on project type
    updateToolAvailability() {
        const bboxBtn = document.querySelector('[data-tool="bbox"]');
        const obbBtn = document.querySelector('[data-tool="obb"]');
        const maskBtn = document.querySelector('[data-tool="mask"]');
        const eraseBtn = document.getElementById('btnEraseMode');
        const maskControls = document.getElementById('maskControls');
        const rotationControls = document.getElementById('rotationControls');

        if (!bboxBtn || !maskBtn) return;

        // Determine which tools to show based on project type
        const showBbox = ['detection'].includes(this.projectType);
        const showObb = ['obb'].includes(this.projectType);
        const showMask = ['segmentation', 'instanceSeg'].includes(this.projectType);

        bboxBtn.style.display = showBbox ? 'flex' : 'none';
        if (obbBtn) obbBtn.style.display = showObb ? 'flex' : 'none';
        maskBtn.style.display = showMask ? 'flex' : 'none';

        if (eraseBtn) {
            eraseBtn.style.display = showMask ? 'flex' : 'none';
        }

        if (maskControls) {
            maskControls.style.display = showMask ? 'flex' : 'none';
        }

        // Show rotation controls ONLY for OBB projects
        if (rotationControls) {
            rotationControls.style.display = showObb ? 'flex' : 'none';
        }

        // Hide annotation tools for classification projects
        if (['classification', 'multiLabel', 'keypoints'].includes(this.projectType)) {
            bboxBtn.style.display = 'none';
            if (obbBtn) obbBtn.style.display = 'none';
            maskBtn.style.display = 'none';
            if (eraseBtn) eraseBtn.style.display = 'none';
            if (maskControls) maskControls.style.display = 'none';
            if (rotationControls) rotationControls.style.display = 'none';
        }
    }

    setupCanvas() {
        // Set up canvas with proper resolution to avoid pixelation
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Set display size (css pixels)
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        // Set actual size in memory (scaled by device pixel ratio)
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;

        // Reset transform before scaling to avoid accumulation
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Scale context to match device pixel ratio
        this.ctx.scale(this.dpr, this.dpr);

        // Enable image smoothing for better quality
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    handleResize() {
        // Handle window resize
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

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left),
            y: (e.clientY - rect.top)
        };
    }

    canvasToImage(x, y) {
        // First: remove zoom and pan
        let imgX = (x - this.panX) / this.zoom;
        let imgY = (y - this.panY) / this.zoom;

        // Second: apply INVERSE rotation to get coordinates in unrotated image space
        if (this.imageRotation !== 0 && this.image) {
            const centerX = this.image.width / 2;
            const centerY = this.image.height / 2;
            const angleRad = -(this.imageRotation * Math.PI) / 180; // Negative for inverse

            const dx = imgX - centerX;
            const dy = imgY - centerY;

            imgX = centerX + dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
            imgY = centerY + dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
        }

        return { x: imgX, y: imgY };
    }

    imageToCanvas(x, y) {
        // Simply apply zoom and pan
        // Rotation is handled by the canvas context transform
        return {
            x: x * this.zoom + this.panX,
            y: y * this.zoom + this.panY
        };
    }

    handleMouseDown(e) {
        if (!this.image) return;

        const pos = this.getMousePos(e);
        this.startX = pos.x;
        this.startY = pos.y;

        const tool = this.toolManager.getTool();

        // Validate tool for project type
        if (!this.isToolValid(tool) && tool !== 'pan' && tool !== 'select') {
            this.ui.showToast(`Tool "${tool}" not available for ${this.projectType} projects`, 'warning');
            return;
        }

        // Pan tool
        if (tool === 'pan' || e.button === 1 || (e.button === 0 && e.ctrlKey)) {
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        // Select tool
        if (tool === 'select') {
            if (this.selectedAnnotation) {
                // Check rotation handle first (only for OBB)
                if (this.selectedAnnotation.type === 'obb') {
                    if (this.getRotationHandle(pos.x, pos.y)) {
                        this.isRotating = true;
                        const imgPos = this.canvasToImage(pos.x, pos.y);
                        const { cx, cy } = this.selectedAnnotation.data;
                        this.rotationStartAngle = Math.atan2(imgPos.y - cy, imgPos.x - cx) * 180 / Math.PI;
                        this.canvas.style.cursor = 'grab';
                        return;
                    }

                    // Check resize handles for OBB
                    const obbHandle = this.getOBBResizeHandle(pos.x, pos.y);
                    if (obbHandle) {
                        this.resizeHandle = obbHandle;
                        this.originalBox = { ...this.selectedAnnotation.data };
                        return;
                    }
                }

                // Check resize handles (only for bbox)
                if (this.selectedAnnotation.type === 'bbox') {
                    const handle = this.getResizeHandle(pos.x, pos.y);
                    if (handle) {
                        this.resizeHandle = handle;
                        this.originalBox = { ...this.selectedAnnotation.data };
                        return;
                    }
                }

                // Check if clicking inside selected annotation to move it
                const imgPos = this.canvasToImage(pos.x, pos.y);

                if (this.selectedAnnotation.type === 'bbox') {
                    const { x: bx, y: by, width, height } = this.selectedAnnotation.data;
                    if (imgPos.x >= bx && imgPos.x <= bx + width &&
                        imgPos.y >= by && imgPos.y <= by + height) {
                        this.isDraggingBox = true;
                        this.dragStartX = imgPos.x;
                        this.dragStartY = imgPos.y;
                        this.dragOffsetX = imgPos.x - bx;
                        this.dragOffsetY = imgPos.y - by;
                        this.canvas.style.cursor = 'move';
                        return;
                    }
                } else if (this.selectedAnnotation.type === 'obb') {
                    if (this.isPointInOBB(imgPos.x, imgPos.y, this.selectedAnnotation)) {
                        this.isDraggingBox = true;
                        this.dragStartX = imgPos.x;
                        this.dragStartY = imgPos.y;
                        const { cx, cy } = this.selectedAnnotation.data;
                        this.dragOffsetX = imgPos.x - cx;
                        this.dragOffsetY = imgPos.y - cy;
                        this.canvas.style.cursor = 'move';
                        return;
                    }
                } else if (this.selectedAnnotation.type === 'mask' && typeof this.selectedAnnotation.data === 'object') {
                    const { x: mx, y: my, width, height } = this.selectedAnnotation.data;
                    if (imgPos.x >= mx && imgPos.x <= mx + width &&
                        imgPos.y >= my && imgPos.y <= my + height) {
                        this.isDraggingBox = true;
                        this.dragStartX = imgPos.x;
                        this.dragStartY = imgPos.y;
                        this.dragOffsetX = imgPos.x - mx;
                        this.dragOffsetY = imgPos.y - my;
                        this.canvas.style.cursor = 'move';
                        return;
                    }
                }
            }

            // Otherwise, try to select a different annotation
            this.handleSelect(pos.x, pos.y);
            return;
        }

        // Check resize handles (only for bbox) - for other tools
        if (this.selectedAnnotation && this.selectedAnnotation.type === 'bbox') {
            const handle = this.getResizeHandle(pos.x, pos.y);
            if (handle) {
                this.resizeHandle = handle;
                this.originalBox = { ...this.selectedAnnotation.data };
                return;
            }
        }

        this.isDrawing = true;

        if (tool === 'mask') {
            // Initialize mask canvas with image dimensions
            this.toolManager.initMaskCanvas(this.image.width, this.image.height);

            // If there's a selected mask, load it for editing
            if (this.selectedAnnotation && this.selectedAnnotation.type === 'mask' &&
                typeof this.selectedAnnotation.data === 'object' && this.selectedAnnotation.data.imageData) {
                const { imageData, x, y, width, height } = this.selectedAnnotation.data;
                this.toolManager.loadMaskForEditing(imageData, x, y, width, height, this.image.width, this.image.height);
                console.log('Loaded existing mask for editing');
            }

            // Start drawing mask
            const imgPos = this.canvasToImage(pos.x, pos.y);
            const color = this.classes[this.currentClass]?.color || '#ff0000';
            this.toolManager.drawMask(imgPos.x, imgPos.y, color);
            this.redraw();
        }
    }

    // Start a new mask instance (clear selected annotation and temp canvas)
    startNewMaskInstance() {
        this.selectedAnnotation = null;
        this.toolManager.clearMask();
        this.redraw();
        console.log('Started new mask instance');
    }

    handleMouseMove(e) {
        if (!this.image) return;

        const pos = this.getMousePos(e);
        this.currentX = pos.x;
        this.currentY = pos.y;

        // Panning
        if (this.isPanning) {
            const dx = pos.x - this.startX;
            const dy = pos.y - this.startY;
            this.panX += dx;
            this.panY += dy;
            this.startX = pos.x;
            this.startY = pos.y;
            this.redraw();
            return;
        }

        // Rotating OBB
        if (this.isRotating && this.selectedAnnotation && this.selectedAnnotation.type === 'obb') {
            const imgPos = this.canvasToImage(pos.x, pos.y);
            const { cx, cy } = this.selectedAnnotation.data;

            // Calculate current angle
            const currentAngle = Math.atan2(imgPos.y - cy, imgPos.x - cx) * 180 / Math.PI;
            const angleDiff = currentAngle - this.rotationStartAngle;

            // Update angle (keep original angle and add difference)
            this.selectedAnnotation.data.angle = (this.selectedAnnotation.data.angle + angleDiff + 360) % 360;
            this.rotationStartAngle = currentAngle;

            this.markUnsavedChanges();
            this.redraw();
            return;
        }

        // Dragging box
        if (this.isDraggingBox && this.selectedAnnotation) {
            const imgPos = this.canvasToImage(pos.x, pos.y);

            if (this.selectedAnnotation.type === 'obb') {
                // Move OBB by updating center
                this.selectedAnnotation.data.cx = imgPos.x - this.dragOffsetX;
                this.selectedAnnotation.data.cy = imgPos.y - this.dragOffsetY;
            } else {
                // Move bbox normally
                this.selectedAnnotation.data.x = imgPos.x - this.dragOffsetX;
                this.selectedAnnotation.data.y = imgPos.y - this.dragOffsetY;
            }

            this.markUnsavedChanges();
            this.redraw();
            return;
        }

        // Resizing
        if (this.resizeHandle) {
            this.handleResizeDrag(pos.x, pos.y);
            return;
        }

        if (!this.isDrawing) {
            this.updateCursor(pos.x, pos.y);
            return;
        }

        const tool = this.toolManager.getTool();

        // Mask drawing
        if (tool === 'mask') {
            const imgPos = this.canvasToImage(pos.x, pos.y);
            const color = this.classes[this.currentClass]?.color || '#ff0000';
            this.toolManager.drawMask(imgPos.x, imgPos.y, color);
            this.redraw();
        }

        // Preview bbox and obb
        if (tool === 'bbox' || tool === 'obb') {
            this.redraw();

            // Draw preview in SCREEN coordinates (after all transformations)
            // This way it always appears under the mouse cursor
            this.ctx.save();
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);  // Reset to screen coordinates

            this.ctx.strokeStyle = this.classes[this.currentClass]?.color || '#ff0000';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(
                this.startX,
                this.startY,
                pos.x - this.startX,
                pos.y - this.startY
            );
            this.ctx.setLineDash([]);
            this.ctx.restore();
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'grab';
            return;
        }

        if (this.isRotating) {
            this.isRotating = false;
            this.canvas.style.cursor = 'default';
            return;
        }

        if (this.isDraggingBox) {
            this.isDraggingBox = false;
            this.canvas.style.cursor = 'default';
            return;
        }

        if (this.resizeHandle) {
            this.resizeHandle = null;
            this.originalBox = null;
            return;
        }

        if (!this.isDrawing) return;

        const pos = this.getMousePos(e);
        const tool = this.toolManager.getTool();

        if (tool === 'bbox') {
            const imgStart = this.canvasToImage(this.startX, this.startY);
            const imgEnd = this.canvasToImage(pos.x, pos.y);

            const width = Math.abs(imgEnd.x - imgStart.x);
            const height = Math.abs(imgEnd.y - imgStart.y);

            if (width > 5 && height > 5) {
                const newAnnotation = {
                    type: 'bbox',
                    class: this.classes[this.currentClass]?.id || 0,
                    data: {
                        x: Math.min(imgStart.x, imgEnd.x),
                        y: Math.min(imgStart.y, imgEnd.y),
                        width,
                        height
                    }
                };

                this.annotations.push(newAnnotation);
                this.markUnsavedChanges();
            }
        } else if (tool === 'obb') {
            // Calculate width/height from SCREEN coordinates (visual rectangle)
            const screenWidth = Math.abs(pos.x - this.startX);
            const screenHeight = Math.abs(pos.y - this.startY);

            // Convert to image space (accounting for zoom only, not rotation)
            const width = screenWidth / this.zoom;
            const height = screenHeight / this.zoom;

            if (width > 5 && height > 5) {
                // Calculate center point in image coordinates
                const centerX = (this.startX + pos.x) / 2;
                const centerY = (this.startY + pos.y) / 2;
                const imgCenter = this.canvasToImage(centerX, centerY);

                this.annotations.push({
                    type: 'obb',
                    class: this.classes[this.currentClass]?.id || 0,
                    data: {
                        cx: imgCenter.x,  // center x (in unrotated image space)
                        cy: imgCenter.y,  // center y (in unrotated image space)
                        width,            // width from visual rectangle
                        height,           // height from visual rectangle
                        angle: -this.imageRotation  // Negative angle to compensate image rotation
                    }
                });
                this.markUnsavedChanges();
            }
        } else if (tool === 'mask') {
            const maskData = this.toolManager.getMaskData();
            if (maskData) {
                // Check if we're editing an existing mask
                if (this.selectedAnnotation && this.selectedAnnotation.type === 'mask') {
                    // Update existing mask
                    this.selectedAnnotation.data = {
                        imageData: maskData.imageData,
                        x: maskData.x,
                        y: maskData.y,
                        width: maskData.width,
                        height: maskData.height
                    };
                    // Clear cache so it reloads
                    delete this.selectedAnnotation._cachedImage;
                } else {
                    // Create new mask
                    this.annotations.push({
                        type: 'mask',
                        class: this.classes[this.currentClass]?.id || 0,
                        data: {
                            imageData: maskData.imageData,
                            x: maskData.x,
                            y: maskData.y,
                            width: maskData.width,
                            height: maskData.height
                        }
                    });
                }
                this.toolManager.clearMask();
                this.markUnsavedChanges();
            }
        }

        this.isDrawing = false;
        this.toolManager.resetLastPosition();
        this.redraw();
        this.updateAnnotationsBar();
    }

    handleMouseLeave(e) {
        // Reset drawing state when mouse leaves canvas
        if (this.isDrawing && this.toolManager.getTool() === 'mask') {
            this.toolManager.resetLastPosition();
        }
    }

    handleWheel(e) {
        e.preventDefault();

        const pos = this.getMousePos(e);
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * delta));

        const imgPos = this.canvasToImage(pos.x, pos.y);
        this.zoom = newZoom;
        const newCanvasPos = this.imageToCanvas(imgPos.x, imgPos.y);

        this.panX += pos.x - newCanvasPos.x;
        this.panY += pos.y - newCanvasPos.y;

        this.redraw();
    }

    handleSelect(x, y) {
        const imgPos = this.canvasToImage(x, y);

        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];

            if (ann.type === 'bbox') {
                const { x: bx, y: by, width, height } = ann.data;
                if (imgPos.x >= bx && imgPos.x <= bx + width &&
                    imgPos.y >= by && imgPos.y <= by + height) {
                    this.selectedAnnotation = ann;
                    this.redraw();
                    return;
                }
            } else if (ann.type === 'obb') {
                if (this.isPointInOBB(imgPos.x, imgPos.y, ann)) {
                    this.selectedAnnotation = ann;
                    this.redraw();
                    return;
                }
            } else if (ann.type === 'mask' && typeof ann.data === 'object' && ann.data.x !== undefined) {
                const { x: mx, y: my, width, height } = ann.data;
                if (imgPos.x >= mx && imgPos.x <= mx + width &&
                    imgPos.y >= my && imgPos.y <= my + height) {
                    this.selectedAnnotation = ann;
                    this.redraw();
                    return;
                }
            }
        }

        this.selectedAnnotation = null;
        this.redraw();
    }

    getResizeHandle(x, y) {
        if (!this.selectedAnnotation || this.selectedAnnotation.type !== 'bbox') return null;

        const imgPos = this.canvasToImage(x, y);
        const { x: bx, y: by, width, height } = this.selectedAnnotation.data;
        const handleSize = 8 / this.zoom;

        const handles = {
            nw: { x: bx, y: by },
            ne: { x: bx + width, y: by },
            sw: { x: bx, y: by + height },
            se: { x: bx + width, y: by + height },
            n: { x: bx + width / 2, y: by },
            s: { x: bx + width / 2, y: by + height },
            e: { x: bx + width, y: by + height / 2 },
            w: { x: bx, y: by + height / 2 }
        };

        for (const [name, pos] of Object.entries(handles)) {
            if (Math.abs(imgPos.x - pos.x) < handleSize &&
                Math.abs(imgPos.y - pos.y) < handleSize) {
                return name;
                }
        }

        return null;
    }

    // Get resize handle for OBB (returns handle name or null)
    getOBBResizeHandle(x, y) {
        if (!this.selectedAnnotation || this.selectedAnnotation.type !== 'obb') return null;

        const imgPos = this.canvasToImage(x, y);
        const { cx, cy, width, height, angle } = this.selectedAnnotation.data;
        const angleRad = (-angle * Math.PI) / 180; // Negative for inverse rotation

        // Transform point to OBB's local coordinate system
        const dx = imgPos.x - cx;
        const dy = imgPos.y - cy;

        const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
        const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        const handleSize = 8 / this.zoom;

        // Define handles in local coordinates
        const handles = {
            nw: { x: -width / 2, y: -height / 2 },
            ne: { x: width / 2, y: -height / 2 },
            se: { x: width / 2, y: height / 2 },
            sw: { x: -width / 2, y: height / 2 },
            n: { x: 0, y: -height / 2 },
            e: { x: width / 2, y: 0 },
            s: { x: 0, y: height / 2 },
            w: { x: -width / 2, y: 0 }
        };

        for (const [name, pos] of Object.entries(handles)) {
            if (Math.abs(localX - pos.x) < handleSize &&
                Math.abs(localY - pos.y) < handleSize) {
                return name;
            }
        }

        return null;
    }

    // Check if clicking on rotation handle (for OBB)
    getRotationHandle(x, y) {
        if (!this.selectedAnnotation || this.selectedAnnotation.type !== 'obb') return false;

        const imgPos = this.canvasToImage(x, y);
        const { cx, cy, width, height, angle } = this.selectedAnnotation.data;

        // Calculate rotation handle position
        const handleDistance = Math.max(width, height) / 2 + 30 / this.zoom;
        const angleRad = (angle * Math.PI) / 180;

        // Handle is at (0, -handleDistance) in local coords
        // Transform to global coords using rotation matrix
        const localX = 0;
        const localY = -handleDistance;

        const handleX = cx + localX * Math.cos(angleRad) - localY * Math.sin(angleRad);
        const handleY = cy + localX * Math.sin(angleRad) + localY * Math.cos(angleRad);

        const handleSize = 10 / this.zoom;
        const distance = Math.sqrt(Math.pow(imgPos.x - handleX, 2) + Math.pow(imgPos.y - handleY, 2));

        return distance < handleSize;
    }

    // Check if point is inside rotated OBB
    isPointInOBB(x, y, obb) {
        const { cx, cy, width, height, angle } = obb.data;
        const angleRad = (-angle * Math.PI) / 180; // Negative for inverse rotation

        // Transform point to OBB's local coordinate system
        const dx = x - cx;
        const dy = y - cy;

        const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
        const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        // Check if point is inside unrotated box
        return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
    }

    handleOBBResize(x, y) {
        const box = this.selectedAnnotation.data;
        const { cx, cy, angle } = this.originalBox;
        const angleRad = (-angle * Math.PI) / 180;

        // Transform mouse position to local coordinates
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
        const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        // Handle resizing based on which handle is being dragged
        switch (this.resizeHandle) {
            case 'se': // Southeast
                box.width = Math.max(10, localX * 2);
                box.height = Math.max(10, localY * 2);
                break;
            case 'nw': // Northwest
                box.width = Math.max(10, -localX * 2);
                box.height = Math.max(10, -localY * 2);
                break;
            case 'ne': // Northeast
                box.width = Math.max(10, localX * 2);
                box.height = Math.max(10, -localY * 2);
                break;
            case 'sw': // Southwest
                box.width = Math.max(10, -localX * 2);
                box.height = Math.max(10, localY * 2);
                break;
            case 'n': // North
                box.height = Math.max(10, -localY * 2);
                break;
            case 's': // South
                box.height = Math.max(10, localY * 2);
                break;
            case 'e': // East
                box.width = Math.max(10, localX * 2);
                break;
            case 'w': // West
                box.width = Math.max(10, -localX * 2);
                break;
        }

        this.markUnsavedChanges();
        this.redraw();
    }

    handleResizeDrag(x, y) {
        if (!this.selectedAnnotation || !this.originalBox) return;

        const imgPos = this.canvasToImage(x, y);

        // Handle OBB resizing separately
        if (this.selectedAnnotation.type === 'obb') {
            this.handleOBBResize(imgPos.x, imgPos.y);
            return;
        }

        const box = this.selectedAnnotation.data;
        const orig = this.originalBox;

        switch (this.resizeHandle) {
            case 'se':
                box.width = Math.max(5, imgPos.x - box.x);
                box.height = Math.max(5, imgPos.y - box.y);
                break;
            case 'nw':
                const newX = Math.min(imgPos.x, orig.x + orig.width - 5);
                const newY = Math.min(imgPos.y, orig.y + orig.height - 5);
                box.width = orig.x + orig.width - newX;
                box.height = orig.y + orig.height - newY;
                box.x = newX;
                box.y = newY;
                break;
            case 'ne':
                box.width = Math.max(5, imgPos.x - box.x);
                const newY2 = Math.min(imgPos.y, orig.y + orig.height - 5);
                box.height = orig.y + orig.height - newY2;
                box.y = newY2;
                break;
            case 'sw':
                const newX2 = Math.min(imgPos.x, orig.x + orig.width - 5);
                box.width = orig.x + orig.width - newX2;
                box.x = newX2;
                box.height = Math.max(5, imgPos.y - box.y);
                break;
            case 'n':
                const newYN = Math.min(imgPos.y, orig.y + orig.height - 5);
                box.height = orig.y + orig.height - newYN;
                box.y = newYN;
                break;
            case 's':
                box.height = Math.max(5, imgPos.y - box.y);
                break;
            case 'e':
                box.width = Math.max(5, imgPos.x - box.x);
                break;
            case 'w':
                const newXW = Math.min(imgPos.x, orig.x + orig.width - 5);
                box.width = orig.x + orig.width - newXW;
                box.x = newXW;
                break;
        }

        this.markUnsavedChanges();
        this.redraw();
    }

    updateCursor(x, y) {
        const tool = this.toolManager.getTool();

        if (tool === 'pan') {
            this.canvas.style.cursor = 'grab';
            return;
        }

        if (tool === 'mask') {
            // Show different cursor for erase mode
            if (this.toolManager.isEraseMode()) {
                this.canvas.style.cursor = 'cell'; // Different cursor for erase
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
            return;
        }

        if (tool === 'select') {
            if (this.selectedAnnotation) {
                // Check if over resize handle (bbox only)
                if (this.selectedAnnotation.type === 'bbox') {
                    const handle = this.getResizeHandle(x, y);
                    if (handle) {
                        const cursors = {
                            nw: 'nw-resize', ne: 'ne-resize',
                            sw: 'sw-resize', se: 'se-resize',
                            n: 'n-resize', s: 's-resize',
                            e: 'e-resize', w: 'w-resize'
                        };
                        this.canvas.style.cursor = cursors[handle];
                        return;
                    }
                }

                // Check if over selected annotation (for moving)
                const imgPos = this.canvasToImage(x, y);
                let bx, by, width, height;

                if (this.selectedAnnotation.type === 'bbox') {
                    ({ x: bx, y: by, width, height } = this.selectedAnnotation.data);
                } else if (this.selectedAnnotation.type === 'mask' && typeof this.selectedAnnotation.data === 'object') {
                    ({ x: bx, y: by, width, height } = this.selectedAnnotation.data);
                }

                if (bx !== undefined && imgPos.x >= bx && imgPos.x <= bx + width &&
                    imgPos.y >= by && imgPos.y <= by + height) {
                    this.canvas.style.cursor = 'move';
                    return;
                }
            }
            this.canvas.style.cursor = 'default';
            return;
        }

        if (this.selectedAnnotation && this.selectedAnnotation.type === 'bbox') {
            const handle = this.getResizeHandle(x, y);
            if (handle) {
                const cursors = {
                    nw: 'nw-resize', ne: 'ne-resize',
                    sw: 'sw-resize', se: 'se-resize',
                    n: 'n-resize', s: 's-resize',
                    e: 'e-resize', w: 'w-resize'
                };
                this.canvas.style.cursor = cursors[handle];
                return;
            }
        }

        this.canvas.style.cursor = 'crosshair';
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            this.imageName = file.name.replace(/\.[^/.]+$/, '');

            // Store original blob
            if (file instanceof File) {
                this.originalImageBlob = file;
            } else if (file instanceof Blob) {
                this.originalImageBlob = file;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.image = img;
                    this.fitImageToCanvas();
                    this.annotations = [];
                    this.selectedAnnotation = null;

                    // Show rotation controls
                    const rotationControls = document.getElementById('rotationControls');
                    if (rotationControls) {
                        rotationControls.style.display = 'flex';
                    }

                    this.redraw();
                    resolve();
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

        const canvasAspect = canvasWidth / canvasHeight;
        const imageAspect = this.image.width / this.image.height;

        if (imageAspect > canvasAspect) {
            this.zoom = (canvasWidth * 0.9) / this.image.width;
        } else {
            this.zoom = (canvasHeight * 0.9) / this.image.height;
        }

        this.panX = (canvasWidth - this.image.width * this.zoom) / 2;
        this.panY = (canvasHeight - this.image.height * this.zoom) / 2;
    }

    setImageRotation(angle) {
        this.imageRotation = angle % 360;
        this.redraw();
    }

    getImageRotation() {
        return this.imageRotation;
    }

    resetImageRotation() {
        this.imageRotation = 0;
        this.redraw();
    }

    redraw() {
        if (!this.image) return;

        const rect = this.canvas.getBoundingClientRect();

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

        // Draw annotations
        this.annotations.forEach(ann => {
            if (ann.type === 'bbox') {
                this.drawBbox(ann);
            } else if (ann.type === 'obb') {
                this.drawObb(ann);
            } else if (ann.type === 'mask') {
                this.drawMaskAnnotation(ann);
            }
        });

        // Draw current mask being drawn
        if (this.isDrawing && this.toolManager.getTool() === 'mask') {
            const previewCanvas = this.toolManager.getPreviewCanvas();
            if (previewCanvas) {
                this.ctx.globalAlpha = this.maskOpacity;
                this.ctx.drawImage(previewCanvas, 0, 0);
                this.ctx.globalAlpha = 1;
            }
        }

        if (this.selectedAnnotation && this.selectedAnnotation.type === 'bbox') {
            this.drawResizeHandles(this.selectedAnnotation);
        }

        this.ctx.restore();
    }

    drawGrid() {
        if (!this.image) return;

        const gridSize = 50; // pixels
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

    drawBbox(annotation) {
        const cls = this.classes.find(c => c.id === annotation.class);
        const color = cls?.color || '#ff0000';
        const { x, y, width, height } = annotation.data;

        const isSelected = annotation === this.selectedAnnotation;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (isSelected ? 3 : 2) / this.zoom;
        this.ctx.strokeRect(x, y, width, height);

        if (this.showLabels && cls) {
            // Find class index for numbering
            const classIndex = this.classes.findIndex(c => c.id === cls.id);
            const classNumber = classIndex >= 0 && classIndex < 9 ? `[${classIndex + 1}] ` : '';
            const labelText = `${classNumber}${cls.name}`;

            this.ctx.fillStyle = color;
            this.ctx.font = `${14 / this.zoom}px Arial`;
            const textWidth = this.ctx.measureText(labelText).width;
            this.ctx.fillRect(x, y - 20 / this.zoom, textWidth + 10 / this.zoom, 20 / this.zoom);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(labelText, x + 5 / this.zoom, y - 5 / this.zoom);
        }
    }

    drawObb(annotation) {
        const cls = this.classes.find(c => c.id === annotation.class);
        const color = cls?.color || '#ff0000';
        const { cx, cy, width, height, angle } = annotation.data;

        const isSelected = annotation === this.selectedAnnotation;

        // Save context and translate to center
        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.rotate((angle * Math.PI) / 180);

        // Draw rotated rectangle (centered at origin)
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (isSelected ? 3 : 2) / this.zoom;
        this.ctx.strokeRect(-width / 2, -height / 2, width, height);

        // Draw label (rotated with the box) - BEFORE handles so label doesn't overlap
        if (this.showLabels && cls) {
            // Find class index for numbering
            const classIndex = this.classes.findIndex(c => c.id === cls.id);
            const classNumber = classIndex >= 0 && classIndex < 9 ? `[${classIndex + 1}] ` : '';
            const labelText = `${classNumber}${cls.name}`;

            // Label at top-left corner in local coordinates
            const labelX = -width / 2;
            const labelY = -height / 2;

            this.ctx.fillStyle = color;
            this.ctx.font = `${14 / this.zoom}px Arial`;
            const textWidth = this.ctx.measureText(labelText).width;
            this.ctx.fillRect(labelX, labelY - 20 / this.zoom, textWidth + 10 / this.zoom, 20 / this.zoom);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(labelText, labelX + 5 / this.zoom, labelY - 5 / this.zoom);
        }

        // Draw resize and rotation handles if selected
        if (isSelected) {
            // Draw 8 resize handles at corners and edges (in local coords)
            const handleSize = 6 / this.zoom;
            const handles = [
                { x: -width / 2, y: -height / 2 }, // nw
                { x: width / 2, y: -height / 2 },  // ne
                { x: width / 2, y: height / 2 },   // se
                { x: -width / 2, y: height / 2 },  // sw
                { x: 0, y: -height / 2 },          // n
                { x: width / 2, y: 0 },            // e
                { x: 0, y: height / 2 },           // s
                { x: -width / 2, y: 0 }            // w
            ];

            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2 / this.zoom;

            handles.forEach(handle => {
                this.ctx.fillRect(
                    handle.x - handleSize,
                    handle.y - handleSize,
                    handleSize * 2,
                    handleSize * 2
                );
                this.ctx.strokeRect(
                    handle.x - handleSize,
                    handle.y - handleSize,
                    handleSize * 2,
                    handleSize * 2
                );
            });

            // Draw rotation handle
            const handleDistance = Math.max(width, height) / 2 + 30 / this.zoom;
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(0, -handleDistance, 6 / this.zoom, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.stroke();

            // Draw line to rotation handle
            this.ctx.beginPath();
            this.ctx.moveTo(0, -height / 2);
            this.ctx.lineTo(0, -handleDistance);
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        this.ctx.restore();
    }

    drawMaskAnnotation(annotation) {
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

    drawResizeHandles(annotation) {
        const { x, y, width, height } = annotation.data;
        const handleSize = 6 / this.zoom;

        const handles = [
            { x, y },
            { x: x + width, y },
            { x, y: y + height },
            { x: x + width, y: y + height },
            { x: x + width / 2, y },
            { x: x + width / 2, y: y + height },
            { x: x + width, y: y + height / 2 },
            { x, y: y + height / 2 }
        ];

        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1 / this.zoom;

        handles.forEach(h => {
            this.ctx.fillRect(h.x - handleSize, h.y - handleSize, handleSize * 2, handleSize * 2);
            this.ctx.strokeRect(h.x - handleSize, h.y - handleSize, handleSize * 2, handleSize * 2);
        });
    }

    deleteSelected() {
        if (!this.selectedAnnotation) return;

        const index = this.annotations.indexOf(this.selectedAnnotation);
        if (index > -1) {
            this.annotations.splice(index, 1);
            this.selectedAnnotation = null;
            this.markUnsavedChanges();
            this.redraw();
            this.updateAnnotationsBar();
        }
    }

    markUnsavedChanges() {
        this.hasUnsavedChanges = true;

        // Trigger auto-save if app instance is available
        if (window.app && window.app.scheduleAutoSave) {
            window.app.scheduleAutoSave();
        }
    }

    clearUnsavedChanges() {
        this.hasUnsavedChanges = false;
        this.lastSavedAnnotationsCount = this.annotations.length;
    }

    clear() {
        this.image = null;
        this.imageName = '';
        this.imageId = null;
        this.annotations = [];
        this.selectedAnnotation = null;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.imageRotation = 0;

        // Hide rotation controls
        const rotationControls = document.getElementById('rotationControls');
        if (rotationControls) {
            rotationControls.style.display = 'none';
        }

        // Reset rotation slider
        const rotationSlider = document.getElementById('rotationSlider');
        const rotationValue = document.getElementById('rotationValue');
        if (rotationSlider) rotationSlider.value = 0;
        if (rotationValue) rotationValue.textContent = '0°';

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        // Update annotations bar to clear the list
        this.updateAnnotationsBar();
    }

    exportYOLO() {
        if (!this.image || this.annotations.length === 0) return '';

        let yoloContent = '';

        this.annotations.forEach(ann => {
            if (ann.type === 'bbox') {
                const { x, y, width, height } = ann.data;
                const x_center = (x + width / 2) / this.image.width;
                const y_center = (y + height / 2) / this.image.height;
                const w = width / this.image.width;
                const h = height / this.image.height;

                yoloContent += `${ann.class} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}\n`;
            }
            // Note: YOLO segmentation format would need polygon points, not pixel masks
        });

        return yoloContent;
    }

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

        // If no bboxes, show empty message
        if (annotationsList.children.length === 0) {
            annotationsList.innerHTML = '<div class="empty-annotations">No hay bounding boxes en esta imagen</div>';
        }
    }
}
