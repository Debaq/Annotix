/**
 * DATABASE MANAGER - IndexedDB
 * Manages all database operations for projects and images
 */

class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbName = 'YOLOAnnotatorDB';
        this.version = 2;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Projects store
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
                    projectStore.createIndex('name', 'name', { unique: true });
                }

                // Images store
                if (!db.objectStoreNames.contains('images')) {
                    const imageStore = db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
                    imageStore.createIndex('projectId', 'projectId', { unique: false });
                    imageStore.createIndex('name', 'name', { unique: false });
                }
            };
        });
    }

    // ============================================
    // PROJECT OPERATIONS
    // ============================================

    async saveProject(project) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = project.id ? store.put(project) : store.add(project);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getProject(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllProjects() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteProject(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================
    // IMAGE OPERATIONS
    // ============================================

    async saveImage(imageData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            const request = imageData.id ? store.put(imageData) : store.add(imageData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getImage(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getProjectImages(projectId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const index = store.index('projectId');
            const request = index.getAll(projectId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteImage(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteProjectImages(projectId) {
        const images = await this.getProjectImages(projectId);
        for (const image of images) {
            await this.deleteImage(image.id);
        }
    }

    // ============================================
    // PREDICTION OPERATIONS (for Inference)
    // ============================================

    /**
     * Save predictions for an image
     * @param {number} imageId - Image ID
     * @param {Array} predictions - Array of predictions
     * @param {Object} metadata - Inference metadata
     * @returns {Promise<void>}
     */
    async savePredictions(imageId, predictions, metadata) {
        const image = await this.getImage(imageId);
        if (!image) {
            throw new Error(`Image with ID ${imageId} not found`);
        }

        image.predictions = predictions || [];
        image.inferenceMetadata = {
            ...metadata,
            lastInferenceTime: Date.now()
        };

        await this.saveImage(image);

        window.eventBus.emit('predictionsUpdated', {
            imageId,
            count: predictions.length
        });
    }

    /**
     * Get predictions for an image
     * @param {number} imageId - Image ID
     * @returns {Promise<Array>} - Predictions array
     */
    async getPredictions(imageId) {
        const image = await this.getImage(imageId);
        return image?.predictions || [];
    }

    /**
     * Clear all predictions for an image
     * @param {number} imageId - Image ID
     * @returns {Promise<void>}
     */
    async clearPredictions(imageId) {
        const image = await this.getImage(imageId);
        if (!image) {
            throw new Error(`Image with ID ${imageId} not found`);
        }

        image.predictions = [];
        image.inferenceMetadata = null;

        await this.saveImage(image);

        window.eventBus.emit('allPredictionsCleared', { imageId });
    }

    /**
     * Convert a specific prediction to a manual annotation
     * @param {number} imageId - Image ID
     * @param {number} predictionIndex - Index of prediction to convert
     * @returns {Promise<Object>} - Converted annotation
     */
    async convertPredictionToAnnotation(imageId, predictionIndex) {
        const image = await this.getImage(imageId);
        if (!image) {
            throw new Error(`Image with ID ${imageId} not found`);
        }

        if (!image.predictions || predictionIndex >= image.predictions.length) {
            throw new Error('Invalid prediction index');
        }

        const prediction = image.predictions[predictionIndex];

        // Create annotation from prediction (remove inference-specific fields)
        const annotation = {
            type: prediction.type,
            class: prediction.class,
            data: prediction.data,
            timestamp: Date.now()
        };

        // Add to annotations
        if (!image.annotations) {
            image.annotations = [];
        }
        image.annotations.push(annotation);

        // Remove from predictions
        image.predictions.splice(predictionIndex, 1);

        await this.saveImage(image);

        window.eventBus.emit('predictionConverted', {
            imageId,
            predictionIndex
        });

        window.eventBus.emit('annotationCreated', {
            imageId,
            annotation
        });

        return annotation;
    }

    /**
     * Convert all predictions to annotations for an image
     * @param {number} imageId - Image ID
     * @returns {Promise<number>} - Number of converted predictions
     */
    async convertAllPredictions(imageId) {
        const image = await this.getImage(imageId);
        if (!image) {
            throw new Error(`Image with ID ${imageId} not found`);
        }

        const predictions = image.predictions || [];
        if (predictions.length === 0) {
            return 0;
        }

        // Initialize annotations array if needed
        if (!image.annotations) {
            image.annotations = [];
        }

        // Convert all predictions
        const convertedCount = predictions.length;
        for (const prediction of predictions) {
            const annotation = {
                type: prediction.type,
                class: prediction.class,
                data: prediction.data,
                timestamp: Date.now()
            };
            image.annotations.push(annotation);
        }

        // Clear predictions
        image.predictions = [];

        await this.saveImage(image);

        window.eventBus.emit('allPredictionsCleared', { imageId });
        window.eventBus.emit('annotationCreated', { imageId });

        return convertedCount;
    }

    /**
     * Get inference metadata for an image
     * @param {number} imageId - Image ID
     * @returns {Promise<Object|null>} - Inference metadata
     */
    async getInferenceMetadata(imageId) {
        const image = await this.getImage(imageId);
        return image?.inferenceMetadata || null;
    }
}