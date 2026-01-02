/**
 * CANVAS POLYGON - Polygon Segmentation
 * Handles polygon annotations (point-by-point segmentation)
 *
 * Features:
 * - Click to place points sequentially
 * - Auto-connect points to form polygon
 * - Double-click or Enter to close polygon
 * - Edit individual points (drag to move, right-click to delete)
 * - Insert points between existing ones
 * - Simplify polygon (reduce points)
 * - Shortcuts: P (polygon tool), V (select), D (delete), Enter (close)
 *
 * Tools: polygon, select, pan
 *
 * Advantages over masks:
 * - Lighter file size (list of points vs PNG image)
 * - Editable point by point
 * - Scalable without quality loss
 * - Compatible with YOLO segmentation and COCO JSON
 */

class CanvasPolygon extends CanvasBase {
    constructor(canvas, ui, projectType) {
        super(canvas, ui, projectType);

        // Polygon-specific state
        this.isDrawing = false;
        this.currentPolygon = null; // Current polygon being drawn
        this.hoverPointIndex = null; // Point under cursor
        this.hoverEdgeIndex = null; // Edge under cursor (for inserting points)
        this.isDraggingPoint = false;
        this.draggedPointIndex = null;

        // Drawing settings
        this.pointRadius = 5; // Visual radius of points
        this.snapDistance = 10; // Distance to snap to first point to close
        this.minPolygonPoints = 3; // Minimum points to form a polygon

        // Current tool
        this.currentTool = 'polygon'; // 'polygon', 'select', 'pan'
    }

    // ============================================
    // TOOL MANAGEMENT
    // ============================================

    getAvailableTools() {
        return ['polygon', 'select', 'pan'];
    }

    setTool(tool) {
        if (!this.getAvailableTools().includes(tool)) {
            console.warn(`Tool "${tool}" not available for polygon canvas`);
            return;
        }
        this.currentTool = tool;
        this.updateCursor();
    }

    updateCursor() {
        const cursorMap = {
            'polygon': 'crosshair',
            'select': 'default',
            'pan': 'grab'
        };
        this.canvas.style.cursor = cursorMap[this.currentTool] || 'default';
    }

    // ============================================
    // SHORTCUTS - Specific to Polygon
    // ============================================

    getSpecificShortcuts() {
        return {
            // Tools
            'p': { handler: () => this.setTool('polygon'), description: 'Polygon Tool' },
            'v': { handler: () => this.setTool('select'), description: 'Select Tool' },

            // Actions
            'Delete': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'Backspace': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'd': { handler: () => this.deleteSelected(), description: 'Delete Selected' },
            'Enter': { handler: () => this.closeCurrentPolygon(), description: 'Close Polygon' },
            'Escape': { handler: () => this.cancelCurrentPolygon(), description: 'Cancel Drawing' },

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
        if (this.currentTool === 'polygon') {
            // Validate classes exist
            if (!this.classes || this.classes.length === 0) {
                this.ui.showToast(window.i18n.t('annotations.addClassFirst'), 'warning');
                return;
            }

            // If currently drawing a polygon
            if (this.isDrawing && this.currentPolygon) {
                // Check if clicking near first point to close
                const firstPoint = this.currentPolygon.points[0];
                const dist = Math.hypot(x - firstPoint[0], y - firstPoint[1]);

                if (dist < this.snapDistance / this.zoom) {
                    this.closeCurrentPolygon();
                    return;
                }

                // Otherwise, add new point
                this.currentPolygon.points.push([x, y]);
                this.redraw();
            } else {
                // Start new polygon
                this.isDrawing = true;
                this.currentPolygon = {
                    points: [[x, y]],
                    class: this.classes[this.currentClass]?.id || 0
                };
                this.redraw();
                this.ui.showToast(window.i18n.t('polygon.clickToAdd'), 'info');
            }
        } else if (this.currentTool === 'select') {
            // Check if clicking on a point
            const { annotation, pointIndex } = this.getPointAtPosition(x, y);
            if (annotation && pointIndex >= 0) {
                this.selectedAnnotation = annotation;
                this.isDraggingPoint = true;
                this.draggedPointIndex = pointIndex;
                this.redraw();
                return;
            }

            // Check if clicking inside a polygon
            const polygon = this.getPolygonAtPosition(x, y);
            if (polygon) {
                this.selectedAnnotation = polygon;
                this.redraw();
            } else {
                this.selectedAnnotation = null;
                this.redraw();
            }
        }
    }

    handleDrawMove(x, y) {
        if (this.currentTool === 'polygon' && this.isDrawing && this.currentPolygon) {
            // Update hover state for snap indicator
            if (this.currentPolygon.points.length > 0) {
                const firstPoint = this.currentPolygon.points[0];
                const dist = Math.hypot(x - firstPoint[0], y - firstPoint[1]);
                this.hoverPointIndex = (dist < this.snapDistance / this.zoom) ? 0 : null;
            }
            this.redraw();
        } else if (this.currentTool === 'select' && this.isDraggingPoint && this.selectedAnnotation) {
            // Move point
            this.selectedAnnotation.data.points[this.draggedPointIndex] = [x, y];
            this.hasUnsavedChanges = true;
            this.redraw();
        } else if (this.currentTool === 'select' && !this.isDraggingPoint) {
            // Update hover state for visual feedback
            const { annotation, pointIndex } = this.getPointAtPosition(x, y);
            this.hoverPointIndex = pointIndex >= 0 ? pointIndex : null;
            if (this.hoverPointIndex !== null) {
                this.canvas.style.cursor = 'pointer';
            } else {
                this.updateCursor();
            }
            this.redraw();
        }
    }

    handleDrawEnd(x, y) {
        if (this.isDraggingPoint) {
            this.isDraggingPoint = false;
            this.draggedPointIndex = null;
        }
    }

    // Close current polygon and add to annotations
    closeCurrentPolygon() {
        if (!this.currentPolygon || this.currentPolygon.points.length < this.minPolygonPoints) {
            this.ui.showToast(window.i18n.t('polygon.needMinPoints', { min: this.minPolygonPoints }), 'warning');
            return;
        }

        // Create annotation
        const annotation = {
            type: 'polygon',
            class: this.currentPolygon.class,
            data: {
                points: this.currentPolygon.points,
                closed: true
            }
        };

        this.addAnnotation(annotation);
        this.currentPolygon = null;
        this.isDrawing = false;
        this.hasUnsavedChanges = true;
        this.redraw();
        this.ui.showToast(window.i18n.t('polygon.created'), 'success');
    }

    // Cancel current polygon drawing
    cancelCurrentPolygon() {
        if (this.isDrawing && this.currentPolygon) {
            this.currentPolygon = null;
            this.isDrawing = false;
            this.redraw();
            this.ui.showToast(window.i18n.t('polygon.cancelled'), 'info');
        }
    }

    // ============================================
    // DRAWING
    // ============================================

    drawAnnotation(annotation) {
        if (annotation.type === 'polygon') {
            this.drawPolygon(annotation);
        }
    }

    drawPolygon(annotation) {
        const cls = this.classes.find(c => c.id === annotation.class);
        const color = cls?.color || '#ff0000';
        const isSelected = annotation === this.selectedAnnotation;
        const points = annotation.data.points;

        if (!points || points.length < 2) return;

        // Draw filled polygon
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i][0], points[i][1]);
        }
        if (annotation.data.closed) {
            this.ctx.closePath();
        }
        this.ctx.fill();
        this.ctx.globalAlpha = 1;

        // Draw polygon outline
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (isSelected ? 3 : 2) / this.zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i][0], points[i][1]);
        }
        if (annotation.data.closed) {
            this.ctx.closePath();
        }
        this.ctx.stroke();

        // Draw points if selected
        if (isSelected) {
            points.forEach((point, idx) => {
                const isHovered = this.hoverPointIndex === idx;
                const radius = (isHovered ? 6 : 4) / this.zoom;

                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath();
                this.ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 2 / this.zoom;
                this.ctx.stroke();
            });
        }

        // Draw label
        if (this.showLabels && cls && points.length > 0) {
            const firstPoint = points[0];
            this.ctx.fillStyle = color;
            this.ctx.font = `${14 / this.zoom}px Arial`;
            const labelText = `${cls.name} (${points.length} pts)`;
            const textWidth = this.ctx.measureText(labelText).width;
            this.ctx.fillRect(firstPoint[0], firstPoint[1] - 20 / this.zoom, textWidth + 10 / this.zoom, 20 / this.zoom);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(labelText, firstPoint[0] + 5 / this.zoom, firstPoint[1] - 5 / this.zoom);
        }
    }

    // Draw current polygon being edited
    redraw() {
        super.redraw();

        // Draw current polygon being drawn
        if (this.isDrawing && this.currentPolygon && this.currentPolygon.points.length > 0) {
            const cls = this.classes.find(c => c.id === this.currentPolygon.class);
            const color = cls?.color || '#ff0000';
            const points = this.currentPolygon.points;

            // Draw lines
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
            this.ctx.beginPath();
            this.ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i][0], points[i][1]);
            }

            // Draw line to mouse cursor
            if (this.currentMouseX !== undefined && this.currentMouseY !== undefined) {
                const imgPos = this.canvasToImage(this.currentMouseX, this.currentMouseY);
                this.ctx.lineTo(imgPos.x, imgPos.y);
            }

            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Draw points
            points.forEach((point, idx) => {
                const isFirst = idx === 0;
                const isHovered = this.hoverPointIndex === idx;
                const radius = (isFirst || isHovered) ? 6 / this.zoom : 4 / this.zoom;

                this.ctx.fillStyle = isFirst ? color : '#fff';
                this.ctx.beginPath();
                this.ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 2 / this.zoom;
                this.ctx.stroke();
            });

            // Draw snap indicator on first point
            if (this.hoverPointIndex === 0 && points.length >= this.minPolygonPoints) {
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 2 / this.zoom;
                this.ctx.beginPath();
                this.ctx.arc(points[0][0], points[0][1], this.snapDistance / this.zoom, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
    }

    // Override setupEventListeners to track mouse position
    setupEventListeners() {
        super.setupEventListeners();

        this.canvas.addEventListener('mousemove', (e) => {
            const pos = this.getMousePos(e);
            this.currentMouseX = pos.x;
            this.currentMouseY = pos.y;
        });

        this.canvas.addEventListener('dblclick', (e) => {
            if (this.currentTool === 'polygon' && this.isDrawing) {
                e.preventDefault();
                this.closeCurrentPolygon();
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.currentTool === 'select' && this.selectedAnnotation) {
                const pos = this.getMousePos(e);
                const imgPos = this.canvasToImage(pos.x, pos.y);
                const { pointIndex } = this.getPointAtPosition(imgPos.x, imgPos.y);

                if (pointIndex >= 0) {
                    this.deletePoint(pointIndex);
                }
            }
        });
    }

    // ============================================
    // SELECTION & INTERACTION
    // ============================================

    getPointAtPosition(x, y) {
        const threshold = 8 / this.zoom;

        // Check selected annotation first
        if (this.selectedAnnotation && this.selectedAnnotation.type === 'polygon') {
            const points = this.selectedAnnotation.data.points;
            for (let i = 0; i < points.length; i++) {
                const dist = Math.hypot(x - points[i][0], y - points[i][1]);
                if (dist <= threshold) {
                    return { annotation: this.selectedAnnotation, pointIndex: i };
                }
            }
        }

        // Check other annotations
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            if (ann.type === 'polygon' && ann !== this.selectedAnnotation) {
                const points = ann.data.points;
                for (let j = 0; j < points.length; j++) {
                    const dist = Math.hypot(x - points[j][0], y - points[j][1]);
                    if (dist <= threshold) {
                        return { annotation: ann, pointIndex: j };
                    }
                }
            }
        }

        return { annotation: null, pointIndex: -1 };
    }

    getPolygonAtPosition(x, y) {
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const ann = this.annotations[i];
            if (ann.type === 'polygon' && ann.data.closed) {
                if (this.isPointInPolygon(x, y, ann.data.points)) {
                    return ann;
                }
            }
        }
        return null;
    }

    // Point-in-polygon test (ray casting algorithm)
    isPointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i][0], yi = points[i][1];
            const xj = points[j][0], yj = points[j][1];

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    deletePoint(pointIndex) {
        if (!this.selectedAnnotation || !this.selectedAnnotation.data.points) return;

        const points = this.selectedAnnotation.data.points;
        if (points.length <= this.minPolygonPoints) {
            this.ui.showToast(window.i18n.t('polygon.cannotDeletePoint', { min: this.minPolygonPoints }), 'warning');
            return;
        }

        points.splice(pointIndex, 1);
        this.hasUnsavedChanges = true;
        this.redraw();
        this.ui.showToast(window.i18n.t('polygon.pointDeleted'), 'success');
    }
}
