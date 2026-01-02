/**
 * PREPROCESSING UTILITIES
 * Image preprocessing for ONNX model inference
 * Handles letterbox resize, normalization, and tensor conversion
 */

class PreprocessingUtils {
    /**
     * Letterbox resize - resize image while maintaining aspect ratio
     * Pads the image with gray color to match target size
     * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
     * @param {number} targetSize - Target size (square: 640, 416, etc.)
     * @returns {Object} - {canvas, scale, padX, padY}
     */
    static letterboxResize(image, targetSize = 640) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = targetSize;
        canvas.height = targetSize;

        // Fill with gray background (114, 114, 114)
        ctx.fillStyle = 'rgb(114, 114, 114)';
        ctx.fillRect(0, 0, targetSize, targetSize);

        // Calculate scale to fit image inside target size
        const scale = Math.min(
            targetSize / image.width,
            targetSize / image.height
        );

        const scaledWidth = Math.round(image.width * scale);
        const scaledHeight = Math.round(image.height * scale);

        // Center the image
        const padX = Math.round((targetSize - scaledWidth) / 2);
        const padY = Math.round((targetSize - scaledHeight) / 2);

        // Draw image centered
        ctx.drawImage(image, padX, padY, scaledWidth, scaledHeight);

        return {
            canvas,
            scale,
            padX,
            padY,
            scaledWidth,
            scaledHeight,
            originalWidth: image.width,
            originalHeight: image.height
        };
    }

    /**
     * Convert canvas to Float32Array tensor in NCHW format
     * @param {HTMLCanvasElement} canvas - Source canvas
     * @param {Array} mean - Mean values for normalization [R, G, B]
     * @param {Array} std - Std values for normalization [R, G, B]
     * @returns {Float32Array} - Tensor data
     */
    static canvasToTensor(canvas, mean = [0, 0, 0], std = [255, 255, 255]) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data, width, height } = imageData;

        // Create tensor in NCHW format: [1, 3, height, width]
        const tensorSize = width * height;
        const tensor = new Float32Array(3 * tensorSize);

        // Separate RGB channels and normalize
        for (let i = 0; i < tensorSize; i++) {
            const pixelIndex = i * 4;

            // Red channel
            tensor[i] = (data[pixelIndex] - mean[0]) / std[0];

            // Green channel
            tensor[tensorSize + i] = (data[pixelIndex + 1] - mean[1]) / std[1];

            // Blue channel
            tensor[2 * tensorSize + i] = (data[pixelIndex + 2] - mean[2]) / std[2];
        }

        return tensor;
    }

    /**
     * Load image blob and create HTMLImageElement
     * @param {Blob} blob - Image blob
     * @returns {Promise<HTMLImageElement>} - Loaded image
     */
    static async blobToImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    /**
     * Preprocess image blob for YOLO model
     * @param {Blob} imageBlob - Image blob
     * @param {number} inputSize - Model input size (default 640)
     * @returns {Promise<Object>} - {tensor, metadata}
     */
    static async preprocessForYOLO(imageBlob, inputSize = 640) {
        // Load image
        const img = await this.blobToImage(imageBlob);

        // Letterbox resize
        const { canvas, scale, padX, padY, originalWidth, originalHeight } =
            this.letterboxResize(img, inputSize);

        // Convert to tensor (YOLO uses 0-1 normalization)
        const tensor = this.canvasToTensor(canvas, [0, 0, 0], [255, 255, 255]);

        // Clean up
        URL.revokeObjectURL(img.src);

        return {
            tensor,
            metadata: {
                inputSize,
                scale,
                padX,
                padY,
                originalWidth,
                originalHeight
            }
        };
    }

    /**
     * Scale prediction coordinates back to original image size
     * @param {Object} prediction - Prediction with normalized coordinates
     * @param {Object} metadata - Preprocessing metadata
     * @returns {Object} - Scaled prediction
     */
    static scalePredictionToOriginal(prediction, metadata) {
        const { scale, padX, padY, originalWidth, originalHeight } = metadata;

        if (prediction.type === 'bbox') {
            // Scale bbox coordinates back to original
            const x = (prediction.data.x - padX) / scale;
            const y = (prediction.data.y - padY) / scale;
            const width = prediction.data.width / scale;
            const height = prediction.data.height / scale;

            return {
                ...prediction,
                data: {
                    x: Math.max(0, Math.min(x, originalWidth)),
                    y: Math.max(0, Math.min(y, originalHeight)),
                    width: Math.min(width, originalWidth - x),
                    height: Math.min(height, originalHeight - y)
                }
            };
        }

        return prediction;
    }

    /**
     * Decode YOLO detection output
     * Output format: [1, 84, 8400] or [1, num_classes+4, num_boxes]
     * Each box: [cx, cy, w, h, ...class_scores]
     * @param {Float32Array} output - Model output
     * @param {number} numClasses - Number of classes
     * @param {number} inputSize - Input size used
     * @returns {Array} - Decoded boxes [{x, y, w, h, class, confidence}]
     */
    static decodeYOLODetection(output, numClasses, inputSize = 640) {
        const numBoxes = Math.floor(output.length / (numClasses + 4));
        const boxes = [];

        for (let i = 0; i < numBoxes; i++) {
            const baseIndex = i * (numClasses + 4);

            // Get box coordinates (normalized 0-1 relative to input size)
            const cx = output[baseIndex] / inputSize;
            const cy = output[baseIndex + 1] / inputSize;
            const w = output[baseIndex + 2] / inputSize;
            const h = output[baseIndex + 3] / inputSize;

            // Get class scores
            let maxScore = 0;
            let maxClass = 0;

            for (let c = 0; c < numClasses; c++) {
                const score = output[baseIndex + 4 + c];
                if (score > maxScore) {
                    maxScore = score;
                    maxClass = c;
                }
            }

            if (maxScore > 0) {
                boxes.push({
                    x: (cx - w / 2) * inputSize,
                    y: (cy - h / 2) * inputSize,
                    width: w * inputSize,
                    height: h * inputSize,
                    class: maxClass,
                    confidence: maxScore
                });
            }
        }

        return boxes;
    }

    /**
     * Non-Maximum Suppression
     * @param {Array} boxes - Array of boxes with {x, y, width, height, class, confidence}
     * @param {number} iouThreshold - IoU threshold (default 0.45)
     * @param {number} confThreshold - Confidence threshold (default 0.5)
     * @returns {Array} - Filtered boxes
     */
    static nms(boxes, iouThreshold = 0.45, confThreshold = 0.5) {
        // Filter by confidence
        boxes = boxes.filter(box => box.confidence >= confThreshold);

        // Sort by confidence (descending)
        boxes.sort((a, b) => b.confidence - a.confidence);

        const selected = [];
        const suppressed = new Set();

        for (let i = 0; i < boxes.length; i++) {
            if (suppressed.has(i)) continue;

            selected.push(boxes[i]);

            for (let j = i + 1; j < boxes.length; j++) {
                if (suppressed.has(j)) continue;

                // Only compare boxes of same class
                if (boxes[i].class !== boxes[j].class) continue;

                const iou = this.calculateIoU(boxes[i], boxes[j]);
                if (iou > iouThreshold) {
                    suppressed.add(j);
                }
            }
        }

        return selected;
    }

    /**
     * Calculate Intersection over Union (IoU) between two boxes
     * @param {Object} box1 - {x, y, width, height}
     * @param {Object} box2 - {x, y, width, height}
     * @returns {number} - IoU value
     */
    static calculateIoU(box1, box2) {
        const x1 = Math.max(box1.x, box2.x);
        const y1 = Math.max(box1.y, box2.y);
        const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
        const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

        const intersectionWidth = Math.max(0, x2 - x1);
        const intersectionHeight = Math.max(0, y2 - y1);
        const intersectionArea = intersectionWidth * intersectionHeight;

        const box1Area = box1.width * box1.height;
        const box2Area = box2.width * box2.height;
        const unionArea = box1Area + box2Area - intersectionArea;

        return intersectionArea / (unionArea + 1e-6);
    }
}

// Make available globally
window.PreprocessingUtils = PreprocessingUtils;
