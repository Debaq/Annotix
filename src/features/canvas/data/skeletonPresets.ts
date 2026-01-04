export interface SkeletonPreset {
  id: string;
  name: string;
  points: string[];
  connections: [number, number][];
}

export const skeletonPresets: Record<string, SkeletonPreset> = {
  'coco-17': {
    id: 'coco-17',
    name: 'COCO (17 keypoints)',
    points: [
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
      [0, 1], [0, 2],  // nose to eyes
      [1, 3], [2, 4],  // eyes to ears
      [0, 5], [0, 6],  // nose to shoulders
      [5, 6],          // shoulders
      [5, 7], [7, 9],  // left arm
      [6, 8], [8, 10], // right arm
      [5, 11], [6, 12],// shoulders to hips
      [11, 12],        // hips
      [11, 13], [13, 15], // left leg
      [12, 14], [14, 16], // right leg
    ],
  },
  'mediapipe-33': {
    id: 'mediapipe-33',
    name: 'MediaPipe Pose (33 keypoints)',
    points: Array.from({ length: 33 }, (_, i) => `point_${i}`),
    connections: [
      // Simplified connections for 33 points
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Add more connections as needed
    ],
  },
  'mediapipe-hand-21': {
    id: 'mediapipe-hand-21',
    name: 'MediaPipe Hand (21 keypoints)',
    points: [
      'wrist',
      'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
      'index_mcp', 'index_pip', 'index_dip', 'index_tip',
      'middle_mcp', 'middle_pip', 'middle_dip', 'middle_tip',
      'ring_mcp', 'ring_pip', 'ring_dip', 'ring_tip',
      'pinky_mcp', 'pinky_pip', 'pinky_dip', 'pinky_tip',
    ],
    connections: [
      // Wrist to fingers
      [0, 1], [1, 2], [2, 3], [3, 4],    // thumb
      [0, 5], [5, 6], [6, 7], [7, 8],    // index
      [0, 9], [9, 10], [10, 11], [11, 12], // middle
      [0, 13], [13, 14], [14, 15], [15, 16], // ring
      [0, 17], [17, 18], [18, 19], [19, 20], // pinky
    ],
  },
  'face-basic-10': {
    id: 'face-basic-10',
    name: 'Face Basic (10 keypoints)',
    points: [
      'left_eye',
      'right_eye',
      'nose',
      'left_mouth',
      'right_mouth',
      'left_ear',
      'right_ear',
      'forehead',
      'chin',
      'center',
    ],
    connections: [
      [0, 2], [1, 2],  // eyes to nose
      [2, 3], [2, 4],  // nose to mouth
      [3, 4],          // mouth
      [0, 5], [1, 6],  // eyes to ears
    ],
  },
  'animal-quadruped': {
    id: 'animal-quadruped',
    name: 'Animal Quadruped',
    points: [
      'nose',
      'left_eye',
      'right_eye',
      'left_ear',
      'right_ear',
      'neck',
      'back',
      'tail_base',
      'left_front_leg',
      'right_front_leg',
      'left_back_leg',
      'right_back_leg',
    ],
    connections: [
      [0, 5],          // nose to neck
      [5, 6],          // neck to back
      [6, 7],          // back to tail
      [5, 8], [5, 9],  // neck to front legs
      [6, 10], [6, 11], // back to back legs
    ],
  },
};
