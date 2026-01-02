/**
 * SKELETON PRESETS
 * Predefined skeleton configurations for common use cases
 *
 * Each preset contains:
 * - id: unique identifier
 * - name: display name
 * - description: brief description
 * - keypoints: array of keypoint names
 * - connections: array of [index1, index2] pairs
 * - category: 'human', 'hand', 'face', 'animal', 'custom'
 */

class SkeletonPresets {
    static presets = {
        // ============================================
        // HUMAN POSE PRESETS
        // ============================================
        'coco-17': {
            id: 'coco-17',
            name: 'COCO 17 Keypoints',
            description: 'Standard COCO human pose (17 points)',
            category: 'human',
            keypoints: [
                'nose',
                'left_eye', 'right_eye',
                'left_ear', 'right_ear',
                'left_shoulder', 'right_shoulder',
                'left_elbow', 'right_elbow',
                'left_wrist', 'right_wrist',
                'left_hip', 'right_hip',
                'left_knee', 'right_knee',
                'left_ankle', 'right_ankle'
            ],
            connections: [
                // Head
                [0, 1], [0, 2],  // nose to eyes
                [1, 3], [2, 4],  // eyes to ears
                // Arms
                [5, 6],          // shoulders
                [5, 7], [7, 9],  // left arm
                [6, 8], [8, 10], // right arm
                // Torso
                [5, 11], [6, 12], [11, 12], // torso
                // Legs
                [11, 13], [13, 15], // left leg
                [12, 14], [14, 16]  // right leg
            ]
        },

        'mediapipe-pose-33': {
            id: 'mediapipe-pose-33',
            name: 'MediaPipe Pose (33 points)',
            description: 'Full body with hands and face landmarks',
            category: 'human',
            keypoints: [
                'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
                'right_eye_inner', 'right_eye', 'right_eye_outer',
                'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
                'left_shoulder', 'right_shoulder',
                'left_elbow', 'right_elbow',
                'left_wrist', 'right_wrist',
                'left_pinky', 'right_pinky',
                'left_index', 'right_index',
                'left_thumb', 'right_thumb',
                'left_hip', 'right_hip',
                'left_knee', 'right_knee',
                'left_ankle', 'right_ankle',
                'left_heel', 'right_heel',
                'left_foot_index', 'right_foot_index'
            ],
            connections: [
                // Face
                [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6],
                [2, 7], [5, 8], [0, 9], [0, 10],
                // Shoulders
                [11, 12],
                // Left arm
                [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
                // Right arm
                [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
                // Torso
                [11, 23], [12, 24], [23, 24],
                // Left leg
                [23, 25], [25, 27], [27, 29], [27, 31],
                // Right leg
                [24, 26], [26, 28], [28, 30], [28, 32]
            ]
        },

        'openpose-body-25': {
            id: 'openpose-body-25',
            name: 'OpenPose Body (25 points)',
            description: 'OpenPose full body model',
            category: 'human',
            keypoints: [
                'nose', 'neck',
                'right_shoulder', 'right_elbow', 'right_wrist',
                'left_shoulder', 'left_elbow', 'left_wrist',
                'mid_hip', 'right_hip', 'right_knee', 'right_ankle',
                'left_hip', 'left_knee', 'left_ankle',
                'right_eye', 'left_eye', 'right_ear', 'left_ear',
                'left_big_toe', 'left_small_toe', 'left_heel',
                'right_big_toe', 'right_small_toe', 'right_heel'
            ],
            connections: [
                // Head
                [0, 1], [0, 15], [0, 16], [15, 17], [16, 18],
                // Arms
                [1, 2], [2, 3], [3, 4],  // right arm
                [1, 5], [5, 6], [6, 7],  // left arm
                // Torso
                [1, 8],
                // Legs
                [8, 9], [9, 10], [10, 11],    // right leg
                [8, 12], [12, 13], [13, 14],  // left leg
                // Feet
                [11, 22], [11, 23], [11, 24], // right foot
                [14, 19], [14, 20], [14, 21]  // left foot
            ]
        },

        // ============================================
        // HAND PRESETS
        // ============================================
        'mediapipe-hand-21': {
            id: 'mediapipe-hand-21',
            name: 'MediaPipe Hand (21 points)',
            description: 'Detailed hand landmarks',
            category: 'hand',
            keypoints: [
                'wrist',
                'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
                'index_mcp', 'index_pip', 'index_dip', 'index_tip',
                'middle_mcp', 'middle_pip', 'middle_dip', 'middle_tip',
                'ring_mcp', 'ring_pip', 'ring_dip', 'ring_tip',
                'pinky_mcp', 'pinky_pip', 'pinky_dip', 'pinky_tip'
            ],
            connections: [
                // Palm connections
                [0, 1], [0, 5], [0, 9], [0, 13], [0, 17],
                // Thumb
                [1, 2], [2, 3], [3, 4],
                // Index
                [5, 6], [6, 7], [7, 8],
                // Middle
                [9, 10], [10, 11], [11, 12],
                // Ring
                [13, 14], [14, 15], [15, 16],
                // Pinky
                [17, 18], [18, 19], [19, 20],
                // Palm base
                [5, 9], [9, 13], [13, 17]
            ]
        },

        // ============================================
        // FACE PRESETS
        // ============================================
        'mediapipe-face-basic': {
            id: 'mediapipe-face-basic',
            name: 'Face Basic (10 points)',
            description: 'Simple face landmarks',
            category: 'face',
            keypoints: [
                'left_eye', 'right_eye',
                'nose_tip',
                'mouth_left', 'mouth_right',
                'left_ear', 'right_ear',
                'chin',
                'forehead_left', 'forehead_right'
            ],
            connections: [
                [0, 1],  // eyes
                [0, 2], [1, 2],  // eyes to nose
                [2, 7],  // nose to chin
                [3, 4],  // mouth
                [0, 5], [1, 6],  // ears
                [0, 8], [1, 9]   // forehead
            ]
        },

        'facial-landmarks-68': {
            id: 'facial-landmarks-68',
            name: 'Facial Landmarks 68',
            description: 'dlib 68-point face model',
            category: 'face',
            keypoints: [
                // Jaw (17 points: 0-16)
                ...Array.from({length: 17}, (_, i) => `jaw_${i}`),
                // Left eyebrow (5 points: 17-21)
                ...Array.from({length: 5}, (_, i) => `left_eyebrow_${i}`),
                // Right eyebrow (5 points: 22-26)
                ...Array.from({length: 5}, (_, i) => `right_eyebrow_${i}`),
                // Nose bridge (4 points: 27-30)
                ...Array.from({length: 4}, (_, i) => `nose_bridge_${i}`),
                // Nose tip (5 points: 31-35)
                ...Array.from({length: 5}, (_, i) => `nose_tip_${i}`),
                // Left eye (6 points: 36-41)
                ...Array.from({length: 6}, (_, i) => `left_eye_${i}`),
                // Right eye (6 points: 42-47)
                ...Array.from({length: 6}, (_, i) => `right_eye_${i}`),
                // Outer mouth (12 points: 48-59)
                ...Array.from({length: 12}, (_, i) => `outer_mouth_${i}`),
                // Inner mouth (8 points: 60-67)
                ...Array.from({length: 8}, (_, i) => `inner_mouth_${i}`)
            ],
            connections: [
                // Jaw line
                ...Array.from({length: 16}, (_, i) => [i, i + 1]),
                // Left eyebrow
                ...Array.from({length: 4}, (_, i) => [17 + i, 17 + i + 1]),
                // Right eyebrow
                ...Array.from({length: 4}, (_, i) => [22 + i, 22 + i + 1]),
                // Nose bridge
                ...Array.from({length: 3}, (_, i) => [27 + i, 27 + i + 1]),
                // Nose tip
                ...Array.from({length: 4}, (_, i) => [31 + i, 31 + i + 1]),
                [31, 35], // close nose tip
                // Left eye
                ...Array.from({length: 5}, (_, i) => [36 + i, 36 + i + 1]),
                [36, 41], // close left eye
                // Right eye
                ...Array.from({length: 5}, (_, i) => [42 + i, 42 + i + 1]),
                [42, 47], // close right eye
                // Outer mouth
                ...Array.from({length: 11}, (_, i) => [48 + i, 48 + i + 1]),
                [48, 59], // close outer mouth
                // Inner mouth
                ...Array.from({length: 7}, (_, i) => [60 + i, 60 + i + 1]),
                [60, 67]  // close inner mouth
            ]
        },

        // ============================================
        // ANIMAL PRESETS
        // ============================================
        'animal-quadruped': {
            id: 'animal-quadruped',
            name: 'Animal Quadruped',
            description: 'Generic quadruped animal (dog, cat, horse)',
            category: 'animal',
            keypoints: [
                'nose', 'left_eye', 'right_eye',
                'left_ear', 'right_ear',
                'neck', 'back', 'tail_base', 'tail_tip',
                'left_front_shoulder', 'left_front_elbow', 'left_front_paw',
                'right_front_shoulder', 'right_front_elbow', 'right_front_paw',
                'left_back_hip', 'left_back_knee', 'left_back_paw',
                'right_back_hip', 'right_back_knee', 'right_back_paw'
            ],
            connections: [
                // Head
                [0, 1], [0, 2], [1, 3], [2, 4],
                // Body
                [5, 6], [6, 7], [7, 8],
                // Left front leg
                [5, 9], [9, 10], [10, 11],
                // Right front leg
                [5, 12], [12, 13], [13, 14],
                // Left back leg
                [7, 15], [15, 16], [16, 17],
                // Right back leg
                [7, 18], [18, 19], [19, 20]
            ]
        },

        // ============================================
        // CUSTOM / EMPTY
        // ============================================
        'custom': {
            id: 'custom',
            name: 'Custom Skeleton',
            description: 'Define your own keypoints and connections',
            category: 'custom',
            keypoints: [],
            connections: []
        }
    };

    /**
     * Get all available presets
     */
    static getAllPresets() {
        return Object.values(this.presets);
    }

    /**
     * Get presets by category
     */
    static getPresetsByCategory(category) {
        return Object.values(this.presets).filter(p => p.category === category);
    }

    /**
     * Get preset by ID
     */
    static getPreset(id) {
        return this.presets[id] || null;
    }

    /**
     * Get all categories
     */
    static getCategories() {
        return ['human', 'hand', 'face', 'animal', 'custom'];
    }

    /**
     * Get category display name
     */
    static getCategoryName(category) {
        const names = {
            'human': 'Human Pose',
            'hand': 'Hand',
            'face': 'Face',
            'animal': 'Animal',
            'custom': 'Custom'
        };
        return names[category] || category;
    }

    /**
     * Validate skeleton structure
     */
    static validateSkeleton(skeleton) {
        if (!skeleton || typeof skeleton !== 'object') {
            return { valid: false, error: 'Invalid skeleton structure' };
        }

        if (!Array.isArray(skeleton.keypoints) || skeleton.keypoints.length === 0) {
            return { valid: false, error: 'Keypoints array is required and must not be empty' };
        }

        if (!Array.isArray(skeleton.connections)) {
            return { valid: false, error: 'Connections array is required' };
        }

        // Validate connections
        for (const [idx1, idx2] of skeleton.connections) {
            if (idx1 < 0 || idx1 >= skeleton.keypoints.length ||
                idx2 < 0 || idx2 >= skeleton.keypoints.length) {
                return { valid: false, error: `Invalid connection: [${idx1}, ${idx2}]` };
            }
        }

        return { valid: true };
    }

    /**
     * Create skeleton from preset
     */
    static createFromPreset(presetId) {
        const preset = this.getPreset(presetId);
        if (!preset) {
            throw new Error(`Preset not found: ${presetId}`);
        }

        return {
            keypoints: [...preset.keypoints],
            connections: preset.connections.map(c => [...c]),
            preset: presetId
        };
    }

    /**
     * Clone skeleton (deep copy)
     */
    static cloneSkeleton(skeleton) {
        return {
            keypoints: [...skeleton.keypoints],
            connections: skeleton.connections.map(c => [...c]),
            preset: skeleton.preset || 'custom'
        };
    }
}

// Make available globally
window.SkeletonPresets = SkeletonPresets;
