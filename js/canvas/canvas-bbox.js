/**
 * CANVAS BBOX - Object Detection (Bounding Boxes)
 * Handles rectangular bounding box annotations
 *
 * Features:
 * - Draw bounding boxes by dragging
 * - Resize handles (8 directions)
 * - Drag boxes to move them
 * - Delete selected box
 * - Shortcuts: D (delete), V (select), B (bbox tool)
 *
 * Tools: bbox, select, pan
 */

class CanvasBbox extends CanvasBase {
    constructor(canvas, ui, projectType) {
        super(canvas, ui, projectType);

        // Bbox-specific state
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentBox = null;

        // Resize state
        this.resizeHandle = null;
        this.originalBox = null;

        // Drag state
        this.isDraggingBox = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Current tool
        this.currentTool = 'bbox'; // 'bbox', 'select', 'pan'
    }

    // ============================================
    // TOOL MANAGEMENT
    // ============================================

    getAvailableTools() {
        return ['bbox', 'select', 'pan'];
    }

    setTool(tool) {
        if (!this.getAvailableTools().includes(tool)) {
            console.warn(`Tool "${tool}" not available for bbox canvas`);
            return;
        }
        this.currentTool = tool;
        this.updateCursor();
    }

    updateCursor() {
        const cursorMap = {
            'bbox': 'crosshair',
            'select': 'default',
            'pan': 'grab'
        };
        this.canvas.style.cursor = cursorMap[this.currentTool] || 'default';
    }

    // ============================================
    // SHORTCUTS - Specific to Bbox
    // ============================================

    getSpecificShortcuts() {
        return {
            // Tools
            'b': { handler: () => this.setTool('bbox'), description: 'Bbox Tool' },
            'v': { handler: () => this.setTool('select'), description: 'Select Tool' },

            // Actions
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

    // ============================================
    // DRAWING LOGIC
    // ============================================

    handleDrawStart(x, y) {
        if (this.currentTool === 'bbox') {
            // Validate classes exist before allowing annotation
            if (!this.classes || this.classes.length === 0) {
                this.ui.showToast('Add at least one class before annotating', 'warning');
                return;
            }
            // Start drawing new bbox
            this.isDrawing = true;
            this.startX = x;
            this.startY = y;
            this.currentBox = { x, y, width: 0, height: 0 };
        } else if (this.currentTool === 'select') {
            // Check for resize handle first
            if (this.selectedAnnotation) {
                const handle = this.getResizeHandle(x, y);
                if (handle) {
                    this.resizeHandle = handle;
                    this.originalBox = { ...this.selectedAnnotation.data };
                    return;
                }
            }

            // Check if clicking on existing box
            const clickedBox = this.getBoxAtPosition(x, y);
            if (clickedBox) {
                this.selectedAnnotation = clickedBox;
                this.isDraggingBox = true;
                this.dragOffsetX = x - clickedBox.data.x;
                this.dragOffsetY = y - clickedBox.data.y;
                this.redraw();
            } else {
                this.selectedAnnotation = null;
                this.redraw();
            }
        }
    }

    handleDrawMove(x, y) {
        if (this.currentTool === 'bbox' && this.isDrawing) {
            // Update current box while drawing
            this.currentBox.width = x - this.startX;
            this.currentBox.height = y - this.startY;
            this.redraw();

            // Draw preview box
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
                this.currentBox.x,
                this.currentBox.y,
                this.currentBox.width,
                this.currentBox.height
            );
            this.ctx.setLineDash([]);
            this.ctx.restore();
        } else if (this.currentTool === 'select') {
            if (this.resizeHandle) {
                // Resize selected box
                this.handleResizeDrag(x, y);
            } else if (this.isDraggingBox && this.selectedAnnotation) {
                // Drag selected box
                this.selectedAnnotation.data.x = x - this.dragOffsetX;
                this.selectedAnnotation.data.y = y - this.dragOffsetY;
                this.hasUnsavedChanges = true;
                this.redraw();
            }
        }
    }

    handleDrawEnd(x, y) {
        if (this.currentTool === 'bbox' && this.isDrawing) {
            this.isDrawing = false;

            // Normalize box dimensions (handle negative width/height)
            let { x: bx, y: by, width: bw, height: bh } = this.currentBox;

            if (bw < 0) {
                bx += bw;
                bw = -bw;
            }
            if (bh < 0) {
                by += bh;
                bh = -bh;
            }

            // Only add if box has minimum size
            if (bw > 5 && bh > 5) {
                const annotation = {
                    type: 'bbox',
                    class: this.currentClass,
                    data: { x: bx, y: by, width: bw, height: bh }
                };
                this.addAnnotation(annotation);
                this.ui.showToast('Bbox added', 'success');
            }

            this.currentBox = null;
            this.redraw();
        } else if (this.currentTool === 'select') {
            if (this.resizeHandle) {
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
        if (annotation.type === 'bbox') {
            this.drawBbox(annotation);
        }
    }

    drawBbox(annotation) {
        const cls = this.classes.find(c => c.id === annotation.class);
        const color = cls?.color || '#ff0000';
        const { x, y, width, height } = annotation.data;

        const isSelected = annotation === this.selectedAnnotation;

        // Draw box
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (isSelected ? 3 : 2) / this.zoom;
        this.ctx.strokeRect(x, y, width, height);

        // Draw label
        if (this.showLabels && cls) {
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

        // Draw resize handles if selected
        if (isSelected) {
            this.drawResizeHandles(annotation);
        }
    }

    drawResizeHandles(annotation) {
        const { x, y, width, height } = annotation.data;
        const handleSize = 6 / this.zoom;

        const handles = [
            { x, y }, // nw
            { x: x + width, y }, // ne
            { x, y: y + height }, // sw
            { x: x + width, y: y + height }, // se
            { x: x + width / 2, y }, // n
            { x: x + width / 2, y: y + height }, // s
            { x: x + width, y: y + height / 2 }, // e
            { x, y: y + height / 2 } // w
        ];

        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1 / this.zoom;

        handles.forEach(h => {
            this.ctx.fillRect(h.x - handleSize, h.y - handleSize, handleSize * 2, handleSize * 2);
            this.ctx.strokeRect(h.x - handleSize, h.y - handleSize, handleSize * 2, handleSize * 2);
        });
    }

    // ============================================
    // SELECTION & INTERACTION
    // ============================================

    getBoxAtPosition(x, y) {
        // Check from last to first (top boxes first)
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            if (ann.type === 'bbox') {
                const { x: bx, y: by, width: bw, height: bh } = ann.data;
                if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
                    return ann;
                }
            }
        }
        return null;
    }

    getResizeHandle(x, y) {
        if (!this.selectedAnnotation || this.selectedAnnotation.type !== 'bbox') return null;

        const { x: bx, y: by, width: bw, height: bh } = this.selectedAnnotation.data;
        const handleSize = 6 / this.zoom;
        const threshold = handleSize * 2;

        const handles = {
            'nw': { x: bx, y: by },
            'ne': { x: bx + bw, y: by },
            'sw': { x: bx, y: by + bh },
            'se': { x: bx + bw, y: by + bh },
            'n': { x: bx + bw / 2, y: by },
            's': { x: bx + bw / 2, y: by + bh },
            'e': { x: bx + bw, y: by + bh / 2 },
            'w': { x: bx, y: by + bh / 2 }
        };

        for (const [name, pos] of Object.entries(handles)) {
            const dx = Math.abs(x - pos.x);
            const dy = Math.abs(y - pos.y);
            if (dx <= threshold && dy <= threshold) {
                return name;
            }
        }

        return null;
    }

    handleResizeDrag(x, y) {
        if (!this.selectedAnnotation || !this.resizeHandle) return;

        const data = this.selectedAnnotation.data;
        const orig = this.originalBox;

        switch (this.resizeHandle) {
            case 'nw':
                data.x = x;
                data.y = y;
                data.width = orig.x + orig.width - x;
                data.height = orig.y + orig.height - y;
                break;
            case 'ne':
                data.y = y;
                data.width = x - orig.x;
                data.height = orig.y + orig.height - y;
                break;
            case 'sw':
                data.x = x;
                data.width = orig.x + orig.width - x;
                data.height = y - orig.y;
                break;
            case 'se':
                data.width = x - orig.x;
                data.height = y - orig.y;
                break;
            case 'n':
                data.y = y;
                data.height = orig.y + orig.height - y;
                break;
            case 's':
                data.height = y - orig.y;
                break;
            case 'e':
                data.width = x - orig.x;
                break;
            case 'w':
                data.x = x;
                data.width = orig.x + orig.width - x;
                break;
        }

        // Enforce minimum size
        if (data.width < 5) data.width = 5;
        if (data.height < 5) data.height = 5;

        this.hasUnsavedChanges = true;
        this.redraw();
    }
}
