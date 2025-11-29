/**
 * CANVAS OBB - Oriented Bounding Boxes
 * Handles rotated bounding box annotations
 *
 * Features:
 * - Draw OBB by dragging (initially axis-aligned)
 * - Rotation handle to rotate the box
 * - Resize handles (8 directions)
 * - Drag boxes to move them
 * - Image rotation slider support
 * - Shortcuts: D (delete), V (select), O (obb tool), R (rotate +15°), Shift+R (rotate -15°)
 *
 * Tools: obb, select, pan
 */

class CanvasObb extends CanvasBase {
    constructor(canvas, ui, projectType) {
        super(canvas, ui, projectType);

        // OBB-specific state
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentBox = null;

        // Resize state
        this.resizeHandle = null;
        this.originalBox = null;

        // Rotation state
        this.isRotating = false;
        this.rotationStartAngle = 0;

        // Drag state
        this.isDraggingBox = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Current tool
        this.currentTool = 'obb'; // 'obb', 'select', 'pan'
    }

    // ============================================
    // TOOL MANAGEMENT
    // ============================================

    getAvailableTools() {
        return ['obb', 'select', 'pan'];
    }

    setTool(tool) {
        if (!this.getAvailableTools().includes(tool)) {
            console.warn(`Tool "${tool}" not available for obb canvas`);
            return;
        }
        this.currentTool = tool;
        this.updateCursor();
    }

    updateCursor() {
        const cursorMap = {
            'obb': 'crosshair',
            'select': 'default',
            'pan': 'grab'
        };
        this.canvas.style.cursor = cursorMap[this.currentTool] || 'default';
    }

    // ============================================
    // SHORTCUTS - Specific to OBB
    // ============================================

    getSpecificShortcuts() {
        return {
            // Tools
            'o': { handler: () => this.setTool('obb'), description: 'OBB Tool' },
            'v': { handler: () => this.setTool('select'), description: 'Select Tool' },

            // Actions
            'Delete': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'Backspace': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'd': { handler: () => this.deleteSelected(), description: 'Delete Selected' },

            // Rotation
            'r': { handler: () => this.rotateSelected(15), description: 'Rotate +15°' },
            'R': { handler: () => this.rotateSelected(-15), description: 'Rotate -15°' }, // Shift+R

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

    rotateSelected(degrees) {
        if (this.selectedAnnotation && this.selectedAnnotation.type === 'obb') {
            this.selectedAnnotation.data.angle += degrees;
            this.selectedAnnotation.data.angle %= 360;
            this.hasUnsavedChanges = true;
            this.redraw();
            this.ui.showToast(`Rotated ${degrees > 0 ? '+' : ''}${degrees}°`, 'info');
        }
    }

    // ============================================
    // DRAWING LOGIC
    // ============================================

    handleDrawStart(x, y) {
        if (this.currentTool === 'obb') {
            // Validate classes exist before allowing annotation
            if (!this.classes || this.classes.length === 0) {
                this.ui.showToast('Add at least one class before annotating', 'warning');
                return;
            }
            // Start drawing new OBB (initially axis-aligned, angle = 0)
            this.isDrawing = true;
            this.startX = x;
            this.startY = y;
            this.currentBox = { cx: x, cy: y, width: 0, height: 0, angle: 0 };
        } else if (this.currentTool === 'select') {
            // Check for rotation handle first
            if (this.selectedAnnotation) {
                const canvasPos = this.imageToCanvas(x, y);
                if (this.getRotationHandle(canvasPos.x, canvasPos.y)) {
                    this.isRotating = true;
                    const { cx, cy } = this.selectedAnnotation.data;
                    this.rotationStartAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
                    return;
                }

                // Check for resize handle
                const handle = this.getObbResizeHandle(x, y);
                if (handle) {
                    this.resizeHandle = handle;
                    this.originalBox = { ...this.selectedAnnotation.data };
                    return;
                }
            }

            // Check if clicking on existing OBB
            const clickedObb = this.getObbAtPosition(x, y);
            if (clickedObb) {
                this.selectedAnnotation = clickedObb;
                this.isDraggingBox = true;
                this.dragOffsetX = x - clickedObb.data.cx;
                this.dragOffsetY = y - clickedObb.data.cy;
                this.redraw();
            } else {
                this.selectedAnnotation = null;
                this.redraw();
            }
        }
    }

    handleDrawMove(x, y) {
        if (this.currentTool === 'obb' && this.isDrawing) {
            // Update current box while drawing (as center-based)
            const width = Math.abs(x - this.startX) * 2;
            const height = Math.abs(y - this.startY) * 2;
            const cx = (this.startX + x) / 2;
            const cy = (this.startY + y) / 2;

            this.currentBox = { cx, cy, width, height, angle: 0 };
            this.redraw();

            // Draw preview OBB
            this.ctx.save();
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.ctx.translate(this.panX, this.panY);
            this.ctx.scale(this.zoom, this.zoom);

            const cls = this.classes.find(c => c.id === this.currentClass);
            const color = cls?.color || '#ff0000';

            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
            this.ctx.strokeRect(
                this.currentBox.cx - this.currentBox.width / 2,
                this.currentBox.cy - this.currentBox.height / 2,
                this.currentBox.width,
                this.currentBox.height
            );
            this.ctx.setLineDash([]);
            this.ctx.restore();
        } else if (this.currentTool === 'select') {
            if (this.isRotating && this.selectedAnnotation) {
                // Rotate OBB
                const { cx, cy } = this.selectedAnnotation.data;
                const currentAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
                const deltaAngle = currentAngle - this.rotationStartAngle;
                this.selectedAnnotation.data.angle = (this.originalBox.angle + deltaAngle) % 360;
                this.hasUnsavedChanges = true;
                this.redraw();
            } else if (this.resizeHandle) {
                // Resize OBB
                this.handleObbResize(x, y);
            } else if (this.isDraggingBox && this.selectedAnnotation) {
                // Drag OBB
                this.selectedAnnotation.data.cx = x - this.dragOffsetX;
                this.selectedAnnotation.data.cy = y - this.dragOffsetY;
                this.hasUnsavedChanges = true;
                this.redraw();
            }
        }
    }

    handleDrawEnd(x, y) {
        if (this.currentTool === 'obb' && this.isDrawing) {
            this.isDrawing = false;

            // Only add if box has minimum size
            if (this.currentBox.width > 10 && this.currentBox.height > 10) {
                const annotation = {
                    type: 'obb',
                    class: this.currentClass,
                    data: { ...this.currentBox }
                };
                this.addAnnotation(annotation);
                this.ui.showToast('OBB added', 'success');
            }

            this.currentBox = null;
            this.redraw();
        } else if (this.currentTool === 'select') {
            if (this.isRotating) {
                this.isRotating = false;
                this.rotationStartAngle = 0;
            } else if (this.resizeHandle) {
                this.resizeHandle = null;
                this.originalBox = null;
            } else if (this.isDraggingBox) {
                this.isDraggingBox = false;
            }
        }
    }

    // ============================================
    // DRAWING
    // ============================================

    drawAnnotation(annotation) {
        if (annotation.type === 'obb') {
            this.drawObb(annotation);
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

        // Draw label (rotated with the box)
        if (this.showLabels && cls) {
            const classIndex = this.classes.findIndex(c => c.id === cls.id);
            const classNumber = classIndex >= 0 && classIndex < 9 ? `[${classIndex + 1}] ` : '';
            const labelText = `${classNumber}${cls.name}`;

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
            this.drawObbHandles(width, height, color);
        }

        this.ctx.restore();
    }

    drawObbHandles(width, height, color) {
        const handleSize = 6 / this.zoom;

        // 8 resize handles at corners and edges (in local coords)
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

        // Rotation handle (above the box)
        const handleDistance = Math.max(width, height) / 2 + 30 / this.zoom;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(0, -handleDistance, 6 / this.zoom, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.stroke();

        // Line to rotation handle
        this.ctx.beginPath();
        this.ctx.moveTo(0, -height / 2);
        this.ctx.lineTo(0, -handleDistance);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    // ============================================
    // SELECTION & INTERACTION
    // ============================================

    getObbAtPosition(x, y) {
        // Check from last to first (top boxes first)
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            if (ann.type === 'obb') {
                const { cx, cy, width, height, angle } = ann.data;

                // Transform point to local OBB coordinates
                const angleRad = -(angle * Math.PI) / 180;
                const dx = x - cx;
                const dy = y - cy;
                const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
                const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

                // Check if inside OBB
                if (Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2) {
                    return ann;
                }
            }
        }
        return null;
    }

    getRotationHandle(canvasX, canvasY) {
        if (!this.selectedAnnotation || this.selectedAnnotation.type !== 'obb') return null;

        const { cx, cy, width, height, angle } = this.selectedAnnotation.data;

        // Calculate rotation handle position in canvas coordinates
        const handleDistance = Math.max(width, height) / 2 + 30 / this.zoom;
        const angleRad = (angle * Math.PI) / 180;

        const handleImgX = cx + 0 * Math.cos(angleRad) - (-handleDistance) * Math.sin(angleRad);
        const handleImgY = cy + 0 * Math.sin(angleRad) + (-handleDistance) * Math.cos(angleRad);

        const handleCanvasPos = this.imageToCanvas(handleImgX, handleImgY);

        const dx = Math.abs(canvasX - handleCanvasPos.x);
        const dy = Math.abs(canvasY - handleCanvasPos.y);
        const threshold = 12; // pixels in canvas space

        return (dx <= threshold && dy <= threshold);
    }

    getObbResizeHandle(x, y) {
        if (!this.selectedAnnotation || this.selectedAnnotation.type !== 'obb') return null;

        const { cx, cy, width, height, angle } = this.selectedAnnotation.data;

        // Transform point to local OBB coordinates
        const angleRad = -(angle * Math.PI) / 180;
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
        const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        const handleSize = 6 / this.zoom;
        const threshold = handleSize * 2;

        const handles = {
            'nw': { x: -width / 2, y: -height / 2 },
            'ne': { x: width / 2, y: -height / 2 },
            'se': { x: width / 2, y: height / 2 },
            'sw': { x: -width / 2, y: height / 2 },
            'n': { x: 0, y: -height / 2 },
            's': { x: 0, y: height / 2 },
            'e': { x: width / 2, y: 0 },
            'w': { x: -width / 2, y: 0 }
        };

        for (const [name, pos] of Object.entries(handles)) {
            const dx = Math.abs(localX - pos.x);
            const dy = Math.abs(localY - pos.y);
            if (dx <= threshold && dy <= threshold) {
                return name;
            }
        }

        return null;
    }

    handleObbResize(x, y) {
        if (!this.selectedAnnotation || !this.resizeHandle) return;

        const data = this.selectedAnnotation.data;
        const { cx, cy, angle } = this.originalBox;

        // Transform mouse position to local OBB coordinates
        const angleRad = -(angle * Math.PI) / 180;
        const dx = x - cx;
        const dy = y - cy;
        const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
        const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        // Resize based on handle (simplified - maintains center)
        switch (this.resizeHandle) {
            case 'nw':
            case 'ne':
            case 'se':
            case 'sw':
                data.width = Math.abs(localX) * 2;
                data.height = Math.abs(localY) * 2;
                break;
            case 'n':
            case 's':
                data.height = Math.abs(localY) * 2;
                break;
            case 'e':
            case 'w':
                data.width = Math.abs(localX) * 2;
                break;
        }

        // Enforce minimum size
        if (data.width < 10) data.width = 10;
        if (data.height < 10) data.height = 10;

        this.hasUnsavedChanges = true;
        this.redraw();
    }
}
