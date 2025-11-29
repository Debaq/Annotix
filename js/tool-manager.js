/**
 * TOOL MANAGER - FIXED VERSION
 * Manages annotation tools (bbox, mask, select, pan)
 *
 * FIXES:
 * - Working mask drawing system
 * - Brush size control
 * - Erase mode for masks
 * - Proper canvas initialization
 */

class ToolManager {
    constructor() {
        this.currentTool = 'bbox'; // 'bbox', 'mask', 'pan', 'select'
        this.brushSize = 20;
        this.eraseMode = false; // For mask tool
        this.maskCanvas = null;
        this.maskCtx = null;
        this.lastX = null;
        this.lastY = null;
    }

    setTool(tool) {
        this.currentTool = tool;
        this.eraseMode = false; // Reset erase mode when changing tools
    }

    getTool() {
        return this.currentTool;
    }

    setBrushSize(size) {
        this.brushSize = Math.max(5, Math.min(100, size)); // Clamp between 5-100
    }

    getBrushSize() {
        return this.brushSize;
    }

    setEraseMode(enabled) {
        this.eraseMode = enabled;
    }

    isEraseMode() {
        return this.eraseMode;
    }

    // ============================================
    // MASK TOOL METHODS
    // ============================================

    initMaskCanvas(width, height) {
        if (!this.maskCanvas) {
            this.maskCanvas = document.createElement('canvas');
            this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
        }

        // Set canvas size to match image
        this.maskCanvas.width = width;
        this.maskCanvas.height = height;

        // Clear canvas
        this.maskCtx.clearRect(0, 0, width, height);

        // Reset drawing state
        this.lastX = null;
        this.lastY = null;

        console.log('Mask canvas initialized:', width, 'x', height);
    }

    drawMask(x, y, color) {
        if (!this.maskCtx) return;

        // Set composite operation based on erase mode
        this.maskCtx.globalCompositeOperation = this.eraseMode ? 'destination-out' : 'source-over';

        // If we have a last position, draw a line for smooth stroke
        if (this.lastX !== null && this.lastY !== null) {
            this.drawLine(this.lastX, this.lastY, x, y, color);
        } else {
            // Draw single circle
            this.drawCircle(x, y, color);
        }

        // Update last position
        this.lastX = x;
        this.lastY = y;
    }

    drawCircle(x, y, color) {
        if (!this.maskCtx) return;

        // Set composite operation for erase mode
        this.maskCtx.globalCompositeOperation = this.eraseMode ? 'destination-out' : 'source-over';
        this.maskCtx.fillStyle = this.eraseMode ? 'rgba(0,0,0,1)' : color;
        this.maskCtx.beginPath();
        this.maskCtx.arc(x, y, this.brushSize / 2, 0, Math.PI * 2);
        this.maskCtx.fill();
    }

    drawLine(x1, y1, x2, y2, color) {
        if (!this.maskCtx) return;

        // Calculate distance and steps for smooth line
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.ceil(distance / (this.brushSize / 4)));

        // Draw circles along the line
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + dx * t;
            const y = y1 + dy * t;
            this.drawCircle(x, y, color);
        }
    }

    resetLastPosition() {
        this.lastX = null;
        this.lastY = null;
    }

    getMaskData() {
        if (!this.maskCanvas) return null;

        // Get the bounding box of the painted area
        const bounds = this.getMaskBounds();
        if (!bounds) return null;

        // Create a temporary canvas for the cropped mask
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = bounds.width;
        tempCanvas.height = bounds.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw only the painted region
        tempCtx.drawImage(
            this.maskCanvas,
            bounds.x, bounds.y, bounds.width, bounds.height,
            0, 0, bounds.width, bounds.height
        );

        // Return both the cropped image and the position
        return {
            imageData: tempCanvas.toDataURL('image/png'),
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
        };
    }

    getMaskBounds() {
        if (!this.maskCanvas) return null;

        const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        const pixels = imageData.data;

        let minX = this.maskCanvas.width;
        let minY = this.maskCanvas.height;
        let maxX = 0;
        let maxY = 0;
        let hasPixels = false;

        // Find the bounding box of non-transparent pixels
        for (let y = 0; y < this.maskCanvas.height; y++) {
            for (let x = 0; x < this.maskCanvas.width; x++) {
                const alpha = pixels[(y * this.maskCanvas.width + x) * 4 + 3];
                if (alpha > 0) {
                    hasPixels = true;
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        if (!hasPixels) return null;

        return {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };
    }

    getMaskImageData() {
        if (!this.maskCanvas) return null;
        return this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    }

    clearMask() {
        if (this.maskCtx) {
            this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        }
        this.lastX = null;
        this.lastY = null;
    }

    // Load existing mask (for editing)
    loadMaskData(imageDataUrl) {
        if (!this.maskCanvas || !imageDataUrl) return;

        const img = new Image();
        img.onload = () => {
            this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
            this.maskCtx.drawImage(img, 0, 0);
        };
        img.src = imageDataUrl;
    }

    // Load cropped mask for editing with position
    loadMaskForEditing(imageDataUrl, x, y, width, height, fullWidth, fullHeight) {
        if (!this.maskCanvas || !imageDataUrl) return;

        // Ensure canvas is correct size
        if (this.maskCanvas.width !== fullWidth || this.maskCanvas.height !== fullHeight) {
            this.initMaskCanvas(fullWidth, fullHeight);
        }

        const img = new Image();
        img.onload = () => {
            this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
            // Draw the cropped mask at its original position
            this.maskCtx.drawImage(img, x, y, width, height);
        };
        img.src = imageDataUrl;
    }

    // Get preview canvas for rendering in main canvas
    getPreviewCanvas() {
        return this.maskCanvas;
    }
}
