/**
 * PROJECT TYPES CONFIGURATION
 * Defines all available project types organized by modality
 * Researched and compiled based on 2025 ML/DL state-of-the-art
 */

const PROJECT_TYPES_CONFIG = {
    // 🖼️ IMÁGENES (Images)
    images: {
        id: 'images',
        icon: 'fa-image',
        color: '#667eea',
        types: [
            { id: 'classification', key: 'classification', icon: 'fa-tag', color: '#667eea' },
            { id: 'multiLabel', key: 'multiLabel', icon: 'fa-tags', color: '#9333ea' },
            { id: 'detection', key: 'detection', icon: 'fa-vector-square', color: '#10b981' },
            { id: 'segmentation', key: 'segmentation', icon: 'fa-fill-drip', color: '#f59e0b' },
            { id: 'instanceSeg', key: 'instanceSeg', icon: 'fa-object-group', color: '#ef4444' },
            { id: 'semanticSeg', key: 'semanticSeg', icon: 'fa-layer-group', color: '#ec4899' },
            { id: 'panopticSeg', key: 'panopticSeg', icon: 'fa-puzzle-piece', color: '#14b8a6' },
            { id: 'keypoints', key: 'keypoints', icon: 'fa-braille', color: '#06b6d4' },
            { id: 'polygon', key: 'polygon', icon: 'fa-draw-polygon', color: '#8b5cf6' },
            { id: 'landmarks', key: 'landmarks', icon: 'fa-location-dot', color: '#ec4899' },
            { id: 'obb', key: 'obb', icon: 'fa-rotate', color: '#6366f1' },
            { id: 'ocr', key: 'ocr', icon: 'fa-font', color: '#f97316' },
            { id: 'depthEstimation', key: 'depthEstimation', icon: 'fa-cube', color: '#84cc16' }
        ]
    },

    // 🎵 AUDIO
    audio: {
        id: 'audio',
        icon: 'fa-microphone',
        color: '#10b981',
        types: [
            { id: 'audioClassification', key: 'audioClassification', icon: 'fa-music', color: '#10b981' },
            { id: 'speechRecognition', key: 'speechRecognition', icon: 'fa-microphone-lines', color: '#06b6d4' },
            { id: 'soundEventDetection', key: 'soundEventDetection', icon: 'fa-wave-square', color: '#8b5cf6' },
            { id: 'speakerIdentification', key: 'speakerIdentification', icon: 'fa-user-tie', color: '#ef4444' },
            { id: 'audioTagging', key: 'audioTagging', icon: 'fa-tags', color: '#f59e0b' },
            { id: 'musicGenreClassification', key: 'musicGenreClassification', icon: 'fa-guitar', color: '#ec4899' },
            { id: 'emotionRecognition', key: 'emotionRecognition', icon: 'fa-face-smile', color: '#f97316' },
            { id: 'voiceActivityDetection', key: 'voiceActivityDetection', icon: 'fa-volume-high', color: '#14b8a6' },
            { id: 'keywordSpotting', key: 'keywordSpotting', icon: 'fa-bullseye', color: '#6366f1' },
            { id: 'environmentalSound', key: 'environmentalSound', icon: 'fa-tree', color: '#84cc16' }
        ]
    },

    // 🎬 VIDEO
    video: {
        id: 'video',
        icon: 'fa-video',
        color: '#f59e0b',
        types: [
            { id: 'actionRecognition', key: 'actionRecognition', icon: 'fa-person-running', color: '#10b981' },
            { id: 'objectTracking', key: 'objectTracking', icon: 'fa-route', color: '#06b6d4' },
            { id: 'temporalActionLocalization', key: 'temporalActionLocalization', icon: 'fa-clock', color: '#8b5cf6' },
            { id: 'videoClassification', key: 'videoClassification', icon: 'fa-video', color: '#ef4444' },
            { id: 'videoSegmentation', key: 'videoSegmentation', icon: 'fa-film', color: '#f59e0b' },
            { id: 'activityDetection', key: 'activityDetection', icon: 'fa-running', color: '#ec4899' },
            { id: 'poseTracking', key: 'poseTracking', icon: 'fa-person', color: '#f97316' },
            { id: 'videoAnomalyDetection', key: 'videoAnomalyDetection', icon: 'fa-triangle-exclamation', color: '#14b8a6' },
            { id: 'spatiotemporalAction', key: 'spatiotemporalAction', icon: 'fa-cube', color: '#6366f1' }
        ]
    },

    // 📈 SERIES TEMPORALES (Time Series)
    timeSeries: {
        id: 'timeSeries',
        icon: 'fa-chart-line',
        color: '#ef4444',
        types: [
            { id: 'timeSeriesClassification', key: 'timeSeriesClassification', icon: 'fa-tag', color: '#10b981' },
            { id: 'timeSeriesForecasting', key: 'timeSeriesForecasting', icon: 'fa-arrow-trend-up', color: '#06b6d4' },
            { id: 'anomalyDetection', key: 'anomalyDetection', icon: 'fa-exclamation-triangle', color: '#ef4444' },
            { id: 'timeSeriesSegmentation', key: 'timeSeriesSegmentation', icon: 'fa-scissors', color: '#f59e0b' },
            { id: 'patternRecognition', key: 'patternRecognition', icon: 'fa-magnifying-glass-chart', color: '#8b5cf6' },
            { id: 'eventDetection', key: 'eventDetection', icon: 'fa-bell', color: '#ec4899' },
            { id: 'timeSeriesRegression', key: 'timeSeriesRegression', icon: 'fa-chart-area', color: '#f97316' },
            { id: 'clustering', key: 'clustering', icon: 'fa-circle-nodes', color: '#14b8a6' },
            { id: 'imputation', key: 'imputation', icon: 'fa-fill', color: '#6366f1' }
        ]
    },

    // 🎲 3D
    threeD: {
        id: 'threeD',
        icon: 'fa-cube',
        color: '#06b6d4',
        types: [
            { id: 'object3DDetection', key: 'object3DDetection', icon: 'fa-cube', color: '#10b981' },
            { id: 'semantic3DSegmentation', key: 'semantic3DSegmentation', icon: 'fa-cubes', color: '#06b6d4' },
            { id: 'instance3DSegmentation', key: 'instance3DSegmentation', icon: 'fa-cubes-stacked', color: '#8b5cf6' },
            { id: 'pointCloudClassification', key: 'pointCloudClassification', icon: 'fa-braille', color: '#ef4444' },
            { id: 'meshSegmentation', key: 'meshSegmentation', icon: 'fa-draw-polygon', color: '#f59e0b' },
            { id: 'pose3DEstimation', key: 'pose3DEstimation', icon: 'fa-person', color: '#ec4899' },
            { id: 'keypoint3DDetection', key: 'keypoint3DDetection', icon: 'fa-location-dot', color: '#f97316' },
            { id: 'surfaceReconstruction', key: 'surfaceReconstruction', icon: 'fa-mountain', color: '#14b8a6' },
            { id: 'slamAnnotation', key: 'slamAnnotation', icon: 'fa-map', color: '#6366f1' }
        ]
    },

    // 📝 TEXTO (Text/NLP)
    text: {
        id: 'text',
        icon: 'fa-align-left',
        color: '#8b5cf6',
        types: [
            { id: 'textClassification', key: 'textClassification', icon: 'fa-tag', color: '#10b981' },
            { id: 'namedEntityRecognition', key: 'namedEntityRecognition', icon: 'fa-highlighter', color: '#06b6d4' },
            { id: 'sentimentAnalysis', key: 'sentimentAnalysis', icon: 'fa-face-smile', color: '#f59e0b' },
            { id: 'intentClassification', key: 'intentClassification', icon: 'fa-bullseye', color: '#8b5cf6' },
            { id: 'relationExtraction', key: 'relationExtraction', icon: 'fa-link', color: '#ef4444' },
            { id: 'posTagging', key: 'posTagging', icon: 'fa-spell-check', color: '#ec4899' },
            { id: 'dependencyParsing', key: 'dependencyParsing', icon: 'fa-project-diagram', color: '#f97316' },
            { id: 'questionAnswering', key: 'questionAnswering', icon: 'fa-question-circle', color: '#14b8a6' },
            { id: 'keyphraseExtraction', key: 'keyphraseExtraction', icon: 'fa-key', color: '#6366f1' },
            { id: 'entityLinking', key: 'entityLinking', icon: 'fa-link', color: '#84cc16' },
            { id: 'toxicityClassification', key: 'toxicityClassification', icon: 'fa-skull-crossbones', color: '#ef4444' },
            { id: 'languageIdentification', key: 'languageIdentification', icon: 'fa-language', color: '#10b981' }
        ]
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PROJECT_TYPES_CONFIG;
}
