/**
 * CANVAS FACTORY
 * Factory pattern to create appropriate canvas instance based on project type
 *
 * Supported project types:
 * - detection: Object Detection (Bounding Boxes) -> CanvasBbox
 * - obb: Oriented Bounding Boxes -> CanvasObb
 * - segmentation: Semantic Segmentation (Masks) -> CanvasMask
 * - instanceSeg: Instance Segmentation (Masks) -> CanvasMask
 * - keypoints: Pose/Skeleton Estimation -> CanvasKeypoints
 * - polygon: Polygon Segmentation -> CanvasPolygon
 * - landmarks: Independent Points -> CanvasLandmarks
 * - classification: Image Classification -> null (handled by ClassificationManager)
 * - multiLabel: Multi-Label Classification -> null (handled by ClassificationManager)
 */

class CanvasFactory {
    /**
     * Create canvas instance based on project type
     * @param {string} projectType - Type of project
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {UIManager} ui - UI manager instance
     * @returns {CanvasBase|null} Canvas instance or null for classification types
     */
    static create(projectType, canvas, ui, classes = []) {
        // Mapping of project types to canvas classes
        const canvasMapping = {
            // Images
            'detection': CanvasBbox,
            'obb': CanvasObb,
            'segmentation': CanvasMask,
            'instanceSeg': CanvasMask,
            'keypoints': CanvasKeypoints,
            'polygon': CanvasPolygon,
            'landmarks': CanvasLandmarks,
            'classification': null,  // Handled by ClassificationManager
            'multiLabel': null,      // Handled by ClassificationManager

            // Time Series
            'timeSeriesClassification': null,  // Global classification, no canvas
            'timeSeriesForecasting': TimeSeriesCanvasManager,
            'anomalyDetection': TimeSeriesCanvasManager,
            'timeSeriesSegmentation': TimeSeriesCanvasManager,
            'patternRecognition': TimeSeriesCanvasManager,
            'eventDetection': TimeSeriesCanvasManager,
            'timeSeriesRegression': TimeSeriesCanvasManager,
            'clustering': null,  // Global clustering, no canvas
            'imputation': TimeSeriesCanvasManager
        };

        const CanvasClass = canvasMapping[projectType];

        // Classification types don't use canvas
        if (CanvasClass === null) {
            console.log(`Project type "${projectType}" does not require canvas`);
            return null;
        }

        // Check if canvas class exists
        if (!CanvasClass) {
            console.error(`Unsupported project type: ${projectType}`);
            throw new Error(`Unsupported project type: ${projectType}`);
        }

        // Check if canvas class is properly defined
        if (typeof CanvasClass !== 'function') {
            console.error(`Canvas class for "${projectType}" is not properly defined`);
            throw new Error(`Canvas class for "${projectType}" is not properly defined`);
        }

        console.log(`Creating canvas instance for project type: ${projectType}`);

        // Instantiate and return canvas
        try {
            // TimeSeriesCanvasManager requires classes parameter
            let canvasInstance;
            if (CanvasClass === TimeSeriesCanvasManager) {
                canvasInstance = new CanvasClass(canvas, projectType, classes, ui);
            } else {
                canvasInstance = new CanvasClass(canvas, ui, projectType);
            }

            console.log(`Canvas instance created successfully:`, canvasInstance.constructor.name);
            return canvasInstance;
        } catch (error) {
            console.error(`Failed to create canvas instance for "${projectType}":`, error);
            throw error;
        }
    }

    /**
     * Get list of supported project types
     * @returns {Array<string>} List of supported project types
     */
    static getSupportedTypes() {
        return [
            'detection',
            'obb',
            'segmentation',
            'instanceSeg',
            'keypoints',
            'polygon',
            'landmarks',
            'classification',
            'multiLabel'
        ];
    }

    /**
     * Check if project type requires canvas
     * @param {string} projectType - Type of project
     * @returns {boolean} True if canvas is required
     */
    static requiresCanvas(projectType) {
        return !['classification', 'multiLabel', 'timeSeriesClassification', 'clustering'].includes(projectType);
    }

    /**
     * Get available tools for a project type
     * @param {string} projectType - Type of project
     * @returns {Array<string>} List of available tools
     */
    static getAvailableTools(projectType) {
        const toolMapping = {
            'detection': ['bbox', 'select', 'pan'],
            'obb': ['obb', 'select', 'pan'],
            'segmentation': ['mask', 'select', 'pan'],
            'instanceSeg': ['mask', 'select', 'pan'],
            'keypoints': ['keypoint', 'select', 'pan'],
            'polygon': ['polygon', 'select', 'pan'],
            'landmarks': ['landmark', 'select', 'pan'],
            'classification': [],
            'multiLabel': [],

            // Time Series tools - specialized per type
            'timeSeriesClassification': [], // Global classification, no canvas tools
            'timeSeriesForecasting': ['range', 'select', 'pan', 'zoom'],
            'anomalyDetection': ['point', 'select', 'pan', 'zoom'],
            'timeSeriesSegmentation': ['range', 'select', 'pan', 'zoom'],
            'patternRecognition': ['range', 'select', 'pan', 'zoom'],
            'eventDetection': ['point', 'select', 'pan', 'zoom'],
            'timeSeriesRegression': ['point', 'select', 'pan', 'zoom'],
            'clustering': [], // Global clustering, no canvas tools
            'imputation': ['range', 'select', 'pan', 'zoom']
        };

        return toolMapping[projectType] || [];
    }

    /**
     * Get human-readable name for project type
     * @param {string} projectType - Type of project
     * @returns {string} Human-readable name
     */
    static getTypeName(projectType) {
        const nameMapping = {
            'detection': 'Object Detection',
            'obb': 'Oriented Bounding Boxes',
            'segmentation': 'Semantic Segmentation',
            'instanceSeg': 'Instance Segmentation',
            'keypoints': 'Pose/Skeleton Estimation',
            'polygon': 'Polygon Segmentation',
            'landmarks': 'Landmark Points',
            'classification': 'Image Classification',
            'multiLabel': 'Multi-Label Classification'
        };

        return nameMapping[projectType] || projectType;
    }

    /**
     * Get description for project type
     * @param {string} projectType - Type of project
     * @returns {string} Description
     */
    static getTypeDescription(projectType) {
        const descriptionMapping = {
            'detection': 'Draw rectangular bounding boxes around objects',
            'obb': 'Draw rotated bounding boxes for oriented objects',
            'segmentation': 'Paint pixel-perfect masks for semantic segmentation',
            'instanceSeg': 'Paint individual masks for each object instance',
            'keypoints': 'Mark key points and skeleton connections',
            'polygon': 'Draw polygons point-by-point for precise segmentation',
            'landmarks': 'Place independent points for marking locations',
            'classification': 'Assign single label to entire image',
            'multiLabel': 'Assign multiple labels to entire image'
        };

        return descriptionMapping[projectType] || '';
    }
}
