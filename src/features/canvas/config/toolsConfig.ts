import { ProjectType } from '@/lib/db';

/**
 * Tool Configuration
 * Defines which tools are available for each project type
 * Based on legacy project-types-config.js
 */

export type ToolId =
  | 'pan'
  | 'bbox'
  | 'mask'
  | 'polygon'
  | 'keypoints'
  | 'landmarks'
  | 'obb';

export interface ToolDefinition {
  id: ToolId;
  icon: string;
  key: string;
  name: string;
}

// All available tools
export const ALL_TOOLS: ToolDefinition[] = [
  { id: 'pan', icon: 'fa-hand', key: 'H', name: 'tools.pan' },
  { id: 'bbox', icon: 'fa-vector-square', key: 'B', name: 'tools.bbox' },
  { id: 'mask', icon: 'fa-paintbrush', key: 'M', name: 'tools.mask' },
  { id: 'polygon', icon: 'fa-draw-polygon', key: 'P', name: 'tools.polygon' },
  { id: 'keypoints', icon: 'fa-user-circle', key: 'K', name: 'tools.keypoints' },
  { id: 'landmarks', icon: 'fa-map-marker-alt', key: 'L', name: 'tools.landmarks' },
  { id: 'obb', icon: 'fa-rotate', key: 'O', name: 'tools.obb' },
];

// Tools available per project type
export const PROJECT_TOOLS: Partial<Record<ProjectType, ToolId[]>> = {
  // Image-based projects
  'bbox': ['pan', 'bbox'],
  'mask': ['pan', 'mask'],
  'polygon': ['pan', 'polygon'],
  'keypoints': ['pan', 'keypoints'],
  'landmarks': ['pan', 'landmarks'],
  'obb': ['pan', 'obb'],
  'classification': ['pan'], // No drawing tools
  'multi-label-classification': ['pan'], // No drawing tools
  'instance-segmentation': ['pan', 'mask', 'polygon'], // Combined

  // Time series projects - no canvas tools
  'timeseries-classification': [],
  'timeseries-forecasting': [],
  'anomaly-detection': [],
  'timeseries-segmentation': [],
  'pattern-recognition': [],
  'event-detection': [],
  'timeseries-regression': [],
  'clustering': [],
  'imputation': [],

  // Tabular projects - no canvas tools
  'tabular': [],

  // Future types (not implemented yet) will return empty array
};

/**
 * Get available tools for a specific project type
 */
export function getAvailableTools(projectType: ProjectType): ToolDefinition[] {
  const toolIds = PROJECT_TOOLS[projectType] || [];
  return ALL_TOOLS.filter(tool => toolIds.includes(tool.id));
}

/**
 * Check if a tool is available for a project type
 */
export function isToolAvailable(toolId: ToolId, projectType: ProjectType): boolean {
  return PROJECT_TOOLS[projectType]?.includes(toolId) || false;
}

/**
 * Get default tool for a project type
 */
export function getDefaultTool(projectType: ProjectType): ToolId {
  const availableTools = PROJECT_TOOLS[projectType] || [];
  return availableTools[0] || 'pan';
}
