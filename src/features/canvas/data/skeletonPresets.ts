/**
 * SKELETON PRESETS
 * Predefined skeleton configurations for common use cases
 */

export interface SkeletonPreset {
  id: string;
  name: string;
  description: string;
  category: 'human' | 'hand' | 'face' | 'animal' | 'custom';
  keypoints: string[];
  connections: [number, number][];
}

export const SKELETON_PRESETS: Record<string, SkeletonPreset> = {
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
      'left_eye',
      'right_eye',
      'left_ear',
      'right_ear',
      'left_shoulder',
      'right_shoulder',
      'left_elbow',
      'right_elbow',
      'left_wrist',
      'right_wrist',
      'left_hip',
      'right_hip',
      'left_knee',
      'right_knee',
      'left_ankle',
      'right_ankle',
    ],
    connections: [
      // Head
      [0, 1],
      [0, 2], // nose to eyes
      [1, 3],
      [2, 4], // eyes to ears
      // Arms
      [5, 6], // shoulders
      [5, 7],
      [7, 9], // left arm
      [6, 8],
      [8, 10], // right arm
      // Torso
      [5, 11],
      [6, 12],
      [11, 12], // torso
      // Legs
      [11, 13],
      [13, 15], // left leg
      [12, 14],
      [14, 16], // right leg
    ],
  },

  'mediapipe-pose-33': {
    id: 'mediapipe-pose-33',
    name: 'MediaPipe Pose (33 points)',
    description: 'Full body with hands and face landmarks',
    category: 'human',
    keypoints: [
      'nose',
      'left_eye_inner',
      'left_eye',
      'left_eye_outer',
      'right_eye_inner',
      'right_eye',
      'right_eye_outer',
      'left_ear',
      'right_ear',
      'mouth_left',
      'mouth_right',
      'left_shoulder',
      'right_shoulder',
      'left_elbow',
      'right_elbow',
      'left_wrist',
      'right_wrist',
      'left_pinky',
      'right_pinky',
      'left_index',
      'right_index',
      'left_thumb',
      'right_thumb',
      'left_hip',
      'right_hip',
      'left_knee',
      'right_knee',
      'left_ankle',
      'right_ankle',
      'left_heel',
      'right_heel',
      'left_foot_index',
      'right_foot_index',
    ],
    connections: [
      // Face
      [0, 1],
      [1, 2],
      [2, 3],
      [0, 4],
      [4, 5],
      [5, 6],
      [2, 7],
      [5, 8],
      [0, 9],
      [0, 10],
      // Shoulders
      [11, 12],
      // Left arm
      [11, 13],
      [13, 15],
      [15, 17],
      [15, 19],
      [15, 21],
      // Right arm
      [12, 14],
      [14, 16],
      [16, 18],
      [16, 20],
      [16, 22],
      // Torso
      [11, 23],
      [12, 24],
      [23, 24],
      // Left leg
      [23, 25],
      [25, 27],
      [27, 29],
      [27, 31],
      // Right leg
      [24, 26],
      [26, 28],
      [28, 30],
      [28, 32],
    ],
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
      'thumb_cmc',
      'thumb_mcp',
      'thumb_ip',
      'thumb_tip',
      'index_mcp',
      'index_pip',
      'index_dip',
      'index_tip',
      'middle_mcp',
      'middle_pip',
      'middle_dip',
      'middle_tip',
      'ring_mcp',
      'ring_pip',
      'ring_dip',
      'ring_tip',
      'pinky_mcp',
      'pinky_pip',
      'pinky_dip',
      'pinky_tip',
    ],
    connections: [
      // Palm connections
      [0, 1],
      [0, 5],
      [0, 9],
      [0, 13],
      [0, 17],
      // Thumb
      [1, 2],
      [2, 3],
      [3, 4],
      // Index
      [5, 6],
      [6, 7],
      [7, 8],
      // Middle
      [9, 10],
      [10, 11],
      [11, 12],
      // Ring
      [13, 14],
      [14, 15],
      [15, 16],
      // Pinky
      [17, 18],
      [18, 19],
      [19, 20],
      // Palm base
      [5, 9],
      [9, 13],
      [13, 17],
    ],
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
      'left_eye',
      'right_eye',
      'nose_tip',
      'mouth_left',
      'mouth_right',
      'left_ear',
      'right_ear',
      'chin',
      'forehead_left',
      'forehead_right',
    ],
    connections: [
      [0, 1], // eyes
      [0, 2],
      [1, 2], // eyes to nose
      [2, 7], // nose to chin
      [3, 4], // mouth
      [0, 5],
      [1, 6], // ears
      [0, 8],
      [1, 9], // forehead
    ],
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
      'nose',
      'left_eye',
      'right_eye',
      'left_ear',
      'right_ear',
      'neck',
      'back',
      'tail_base',
      'tail_tip',
      'left_front_shoulder',
      'left_front_elbow',
      'left_front_paw',
      'right_front_shoulder',
      'right_front_elbow',
      'right_front_paw',
      'left_back_hip',
      'left_back_knee',
      'left_back_paw',
      'right_back_hip',
      'right_back_knee',
      'right_back_paw',
    ],
    connections: [
      // Head
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 4],
      // Body
      [5, 6],
      [6, 7],
      [7, 8],
      // Left front leg
      [5, 9],
      [9, 10],
      [10, 11],
      // Right front leg
      [5, 12],
      [12, 13],
      [13, 14],
      // Left back leg
      [7, 15],
      [15, 16],
      [16, 17],
      // Right back leg
      [7, 18],
      [18, 19],
      [19, 20],
    ],
  },
};

export class SkeletonPresetsService {
  /**
   * Get all available presets
   */
  static getAllPresets(): SkeletonPreset[] {
    return Object.values(SKELETON_PRESETS);
  }

  /**
   * Get presets by category
   */
  static getPresetsByCategory(category: SkeletonPreset['category']): SkeletonPreset[] {
    return Object.values(SKELETON_PRESETS).filter((p) => p.category === category);
  }

  /**
   * Get preset by ID
   */
  static getPreset(id: string): SkeletonPreset | null {
    return SKELETON_PRESETS[id] || null;
  }

  /**
   * Get all categories
   */
  static getCategories(): SkeletonPreset['category'][] {
    return ['human', 'hand', 'face', 'animal', 'custom'];
  }
}
