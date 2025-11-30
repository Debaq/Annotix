/**
 * INFERENCE MANAGER
 * Manages ONNX model loading and inference
 * Supports YOLO Detection, Segmentation, and Classification models
 */

class InferenceManager {
    constructor(databaseManager, uiManager) {
        this.db = databaseManager;
        this.ui = uiManager;

        // ONNX Runtime session
        this.session = null;
        this.modelInfo = null;

        // Settings
        this.confidenceThreshold = 0.5;
        this.iouThreshold = 0.45;
        this.autoInference = false;

        // State
        this.isLoading = false;
        this.isInferencing = false;

        // Current image context
        this.currentImageId = null;
        this.currentProjectType = null;

        this.setupONNXRuntime();
    }

    /**
     * Configure ONNX Runtime
     */
    setupONNXRuntime() {
        if (typeof ort === 'undefined') {
            console.error('ONNX Runtime not loaded');
            return;
        }

        // Configure WASM paths
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

        // Single thread mode (multi-threading requires crossOriginIsolated)
        ort.env.wasm.numThreads = 1;

        console.log('ONNX Runtime configured (single-threaded)');
    }

    /**
     * Load ONNX model from file
     * @param {File} file - Model file (.onnx)
     * @returns {Promise<boolean>} - Success status
     */
    async loadModel(file) {
        if (this.isLoading) {
            this.ui.showToast(window.i18n.t('inference.alreadyLoading'), 'warning');
            return false;
        }

        try {
            this.isLoading = true;
            this.ui.showToast(window.i18n.t('inference.loadingModel'), 'info');

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();

            // Create ONNX session with WASM backend (WebGL fallback if available)
            try {
                this.session = await ort.InferenceSession.create(arrayBuffer, {
                    executionProviders: ['webgl']
                });
            } catch (e) {
                console.log('WebGL not available, falling back to WASM');
                this.session = await ort.InferenceSession.create(arrayBuffer, {
                    executionProviders: ['wasm']
                });
            }

            // Extract model information from input/output metadata
            // Note: ONNX Runtime Web doesn't expose internal graph structure
            // We'll use common YOLO conventions and test with dummy input
            this.modelInfo = {
                name: file.name,
                inputNames: this.session.inputNames,
                outputNames: this.session.outputNames,
                // Default YOLO input shape [1, 3, 640, 640]
                inputShape: [1, 3, 640, 640],
                outputShape: null,
                inputSize: 640
            };

            // Try to infer input size by running a test inference with common sizes
            const testSizes = [640, 416, 320];
            for (const size of testSizes) {
                try {
                    const dummyInput = new ort.Tensor('float32', new Float32Array(3 * size * size), [1, 3, size, size]);
                    const feeds = { [this.modelInfo.inputNames[0]]: dummyInput };
                    const result = await this.session.run(feeds);

                    // Get output shape from first output
                    const outputTensor = result[this.modelInfo.outputNames[0]];
                    this.modelInfo.outputShape = outputTensor.dims;
                    this.modelInfo.inputSize = size;
                    this.modelInfo.inputShape = [1, 3, size, size];
                    console.log(`Detected input size: ${size}x${size}, output shape:`, this.modelInfo.outputShape);
                    break;
                } catch (err) {
                    // Try next size
                    continue;
                }
            }

            // Detect model type based on output shape
            this.modelInfo.type = this.detectModelType(this.modelInfo.outputShape);

            // If we couldn't detect, default to 640
            if (!this.modelInfo.outputShape) {
                console.warn('Could not detect model input size, using default 640x640');
                this.modelInfo.inputSize = 640;
                this.modelInfo.inputShape = [1, 3, 640, 640];
                this.modelInfo.type = 'detection'; // Assume detection
            }

            console.log('Model loaded:', this.modelInfo);

            // Emit event
            window.eventBus.emit('modelLoaded', {
                modelName: this.modelInfo.name,
                modelType: this.modelInfo.type,
                inputShape: this.modelInfo.inputShape
            });

            this.ui.showToast(
                window.i18n.t('inference.modelLoaded', { name: file.name }),
                'success'
            );

            return true;
        } catch (error) {
            console.error('Error loading model:', error);
            this.ui.showToast(
                window.i18n.t('inference.loadModelError', { error: error.message }),
                'error'
            );

            window.eventBus.emit('modelError', {
                error: error.message,
                stage: 'loading'
            });

            return false;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Detect model type from output shape
     * @param {Array} outputShape - Model output shape
     * @returns {string} - Model type: 'detection', 'segmentation', 'classification'
     */
    detectModelType(outputShape) {
        if (!outputShape) return 'unknown';

        // YOLO Detection: [1, 84, 8400] or similar (4 + num_classes, num_boxes)
        // YOLO Segmentation: [1, 116, 8400] or similar (has extra mask outputs)
        // Classification: [1, num_classes]

        if (outputShape.length === 2) {
            return 'classification';
        } else if (outputShape.length === 3) {
            const numChannels = outputShape[1];
            // If channels > 100, likely segmentation (includes mask protos)
            return numChannels > 100 ? 'segmentation' : 'detection';
        }

        return 'unknown';
    }

    /**
     * Unload current model
     */
    async unloadModel() {
        if (this.session) {
            try {
                // ONNX Runtime Web doesn't have explicit dispose yet
                this.session = null;
                this.modelInfo = null;

                window.eventBus.emit('modelUnloaded', {
                    modelName: this.modelInfo?.name
                });

                this.ui.showToast(window.i18n.t('inference.modelUnloaded'), 'info');
            } catch (error) {
                console.error('Error unloading model:', error);
            }
        }
    }

    /**
     * Run inference on image
     * @param {number} imageId - Image ID
     * @param {Blob} imageBlob - Image blob
     * @param {string} projectType - Project type
     * @returns {Promise<Array>} - Predictions
     */
    async runInference(imageId, imageBlob, projectType) {
        if (!this.session) {
            this.ui.showToast(window.i18n.t('inference.noModelLoaded'), 'error');
            return [];
        }

        if (this.isInferencing) {
            console.warn('Inference already in progress');
            return [];
        }

        try {
            this.isInferencing = true;
            this.currentImageId = imageId;
            this.currentProjectType = projectType;

            const startTime = performance.now();

            window.eventBus.emit('inferenceStarted', {
                imageId,
                modelName: this.modelInfo.name
            });

            // Preprocess image
            const { tensor, metadata } = await window.PreprocessingUtils.preprocessForYOLO(
                imageBlob,
                this.modelInfo.inputSize
            );

            // Run inference based on model type
            let predictions = [];

            switch (this.modelInfo.type) {
                case 'detection':
                    predictions = await this.runDetectionInference(tensor, metadata);
                    break;
                case 'segmentation':
                    predictions = await this.runSegmentationInference(tensor, metadata);
                    break;
                case 'classification':
                    predictions = await this.runClassificationInference(tensor, metadata);
                    break;
                default:
                    throw new Error(`Unsupported model type: ${this.modelInfo.type}`);
            }

            const duration = performance.now() - startTime;

            // Save predictions to database
            await this.db.savePredictions(imageId, predictions, {
                modelName: this.modelInfo.name,
                modelType: this.modelInfo.type,
                confidenceThreshold: this.confidenceThreshold,
                timestamp: Date.now()
            });

            // Emit completion event
            window.eventBus.emit('inferenceCompleted', {
                imageId,
                predictions,
                duration: Math.round(duration)
            });

            this.ui.showToast(
                window.i18n.t('inference.inferenceCompleted', {
                    count: predictions.length,
                    time: Math.round(duration)
                }),
                'success'
            );

            return predictions;
        } catch (error) {
            console.error('Error during inference:', error);
            this.ui.showToast(
                window.i18n.t('inference.inferenceError', { error: error.message }),
                'error'
            );

            window.eventBus.emit('modelError', {
                error: error.message,
                stage: 'inference'
            });

            return [];
        } finally {
            this.isInferencing = false;
        }
    }

    /**
     * Run YOLO detection inference
     * @param {Float32Array} tensor - Preprocessed tensor
     * @param {Object} metadata - Preprocessing metadata
     * @returns {Promise<Array>} - Predictions
     */
    async runDetectionInference(tensor, metadata) {
        const inputSize = this.modelInfo.inputSize;

        // Create ONNX tensor
        const inputTensor = new ort.Tensor('float32', tensor, [1, 3, inputSize, inputSize]);

        // Run inference
        const feeds = { [this.modelInfo.inputNames[0]]: inputTensor };
        const results = await this.session.run(feeds);

        // Get output tensor
        const outputTensor = results[this.modelInfo.outputNames[0]];
        const output = outputTensor.data;
        const outputShape = outputTensor.dims;

        console.log('YOLO output shape:', outputShape);
        console.log('Output data sample:', Array.from(output).slice(0, 20));

        // Parse YOLO output format
        // YOLOv8: [1, 84, 8400] → [batch, 4+classes, anchors]
        // YOLOv5: [1, 25200, 85] → [batch, anchors, 4+1+classes]
        let boxes = [];

        if (outputShape.length === 3) {
            if (outputShape[1] > outputShape[2]) {
                // Format: [1, num_boxes, 4+classes] (YOLOv5 style)
                const numBoxes = outputShape[1];
                const boxSize = outputShape[2];
                const numClasses = boxSize - 5; // 4 coords + 1 objectness + classes

                for (let i = 0; i < numBoxes; i++) {
                    const baseIdx = i * boxSize;
                    const cx = output[baseIdx];
                    const cy = output[baseIdx + 1];
                    const w = output[baseIdx + 2];
                    const h = output[baseIdx + 3];
                    const objectness = output[baseIdx + 4];

                    // Find max class score
                    let maxScore = 0;
                    let maxClass = 0;
                    for (let c = 0; c < numClasses; c++) {
                        const score = output[baseIdx + 5 + c] * objectness;
                        if (score > maxScore) {
                            maxScore = score;
                            maxClass = c;
                        }
                    }

                    if (maxScore > this.confidenceThreshold) {
                        boxes.push({
                            x: (cx - w / 2),
                            y: (cy - h / 2),
                            width: w,
                            height: h,
                            class: maxClass,
                            confidence: maxScore
                        });
                    }
                }
            } else {
                // Format: [1, 4+classes, num_boxes] (YOLOv8 style)
                const numChannels = outputShape[1];
                const numBoxes = outputShape[2];
                const numClasses = numChannels - 4;

                for (let i = 0; i < numBoxes; i++) {
                    const cx = output[i];
                    const cy = output[numBoxes + i];
                    const w = output[2 * numBoxes + i];
                    const h = output[3 * numBoxes + i];

                    // Find max class score
                    let maxScore = 0;
                    let maxClass = 0;
                    for (let c = 0; c < numClasses; c++) {
                        const score = output[(4 + c) * numBoxes + i];
                        if (score > maxScore) {
                            maxScore = score;
                            maxClass = c;
                        }
                    }

                    if (maxScore > this.confidenceThreshold) {
                        boxes.push({
                            x: (cx - w / 2),
                            y: (cy - h / 2),
                            width: w,
                            height: h,
                            class: maxClass,
                            confidence: maxScore
                        });
                    }
                }
            }
        }

        console.log(`Found ${boxes.length} boxes before NMS`);

        // Apply NMS
        const filteredBoxes = window.PreprocessingUtils.nms(
            boxes,
            this.iouThreshold,
            this.confidenceThreshold
        );

        console.log(`${filteredBoxes.length} boxes after NMS`);

        // Convert to prediction format and scale to original size
        const predictions = filteredBoxes.map(box => {
            const pred = {
                type: 'bbox',
                class: box.class,
                data: {
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height
                },
                confidence: box.confidence,
                source: 'inference',
                modelName: this.modelInfo.name,
                timestamp: Date.now()
            };

            return window.PreprocessingUtils.scalePredictionToOriginal(pred, metadata);
        });

        return predictions;
    }

    /**
     * Run YOLO segmentation inference
     * @param {Float32Array} tensor - Preprocessed tensor
     * @param {Object} metadata - Preprocessing metadata
     * @returns {Promise<Array>} - Predictions
     */
    async runSegmentationInference(tensor, metadata) {
        // TODO: Implement segmentation inference
        // This requires decoding mask prototypes and applying them to boxes
        console.warn('Segmentation inference not yet implemented');
        return [];
    }

    /**
     * Run classification inference
     * @param {Float32Array} tensor - Preprocessed tensor
     * @param {Object} metadata - Preprocessing metadata
     * @returns {Promise<Array>} - Predictions
     */
    async runClassificationInference(tensor, metadata) {
        const inputSize = this.modelInfo.inputSize;

        // Create ONNX tensor
        const inputTensor = new ort.Tensor('float32', tensor, [1, 3, inputSize, inputSize]);

        // Run inference
        const feeds = { [this.modelInfo.inputNames[0]]: inputTensor };
        const results = await this.session.run(feeds);

        // Get output tensor
        const outputTensor = results[this.modelInfo.outputNames[0]];
        const output = outputTensor.data;

        // Apply softmax
        const scores = this.softmax(Array.from(output));

        // Get top-5 predictions
        const predictions = scores
            .map((score, index) => ({
                type: 'classification',
                class: index,
                confidence: score,
                source: 'inference',
                modelName: this.modelInfo.name,
                timestamp: Date.now()
            }))
            .filter(p => p.confidence >= this.confidenceThreshold)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);

        return predictions;
    }

    /**
     * Softmax function
     * @param {Array} logits - Raw model outputs
     * @returns {Array} - Probabilities
     */
    softmax(logits) {
        const maxLogit = Math.max(...logits);
        const expScores = logits.map(x => Math.exp(x - maxLogit));
        const sumExpScores = expScores.reduce((a, b) => a + b, 0);
        return expScores.map(x => x / sumExpScores);
    }

    /**
     * Run batch inference on multiple images
     * @param {Array} imageRecords - Array of {id, blob, projectType}
     * @returns {Promise<number>} - Number of successfully processed images
     */
    async runBatchInference(imageRecords) {
        let processedCount = 0;

        for (let i = 0; i < imageRecords.length; i++) {
            const { id, blob, projectType } = imageRecords[i];

            try {
                await this.runInference(id, blob, projectType);
                processedCount++;

                window.eventBus.emit('batchInferenceProgress', {
                    current: i + 1,
                    total: imageRecords.length,
                    imageId: id
                });
            } catch (error) {
                console.error(`Error processing image ${id}:`, error);
            }
        }

        return processedCount;
    }

    /**
     * Check if model is loaded
     * @returns {boolean}
     */
    isModelLoaded() {
        return this.session !== null;
    }

    /**
     * Get current model info
     * @returns {Object|null}
     */
    getModelInfo() {
        return this.modelInfo;
    }

    /**
     * Set confidence threshold
     * @param {number} threshold - Confidence threshold (0-1)
     */
    setConfidenceThreshold(threshold) {
        this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
    }

    /**
     * Set IoU threshold
     * @param {number} threshold - IoU threshold (0-1)
     */
    setIoUThreshold(threshold) {
        this.iouThreshold = Math.max(0, Math.min(1, threshold));
    }

    /**
     * Toggle auto-inference
     * @param {boolean} enabled - Enable auto-inference
     */
    setAutoInference(enabled) {
        this.autoInference = enabled;
    }
}

// Make available globally
window.InferenceManager = InferenceManager;
