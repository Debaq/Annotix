import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useUIStore } from '@/features/core/store/uiStore';
import { getAvailableTools } from '../config/toolsConfig';
import { useShortcutKey } from '@/features/core/hooks/useShortcutKey';
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';
import { cn } from '@/lib/utils';
import type { ToolId } from '../config/toolsConfig';

// Mapeo de toolId a shortcutId
const TOOL_SHORTCUT_MAP: Record<ToolId, string> = {
  pan: 'tool-pan',
  bbox: 'tool-box',
  mask: 'tool-mask',
  polygon: 'tool-polygon',
  keypoints: 'tool-keypoints',
  landmarks: 'tool-landmarks',
  obb: 'tool-obb',
};

function ToolShortcutKey({ toolId }: { toolId: ToolId }) {
  const shortcutId = TOOL_SHORTCUT_MAP[toolId];
  const key = useShortcutKey(shortcutId);
  return <>{key}</>;
}

interface FloatingToolsProps {
  maskBrushSize?: number;
  maskEraseMode?: boolean;
  onMaskBrushSizeChange?: (size: number) => void;
  onMaskSetEraseMode?: (erase: boolean) => void;
}

export const FloatingTools: React.FC<FloatingToolsProps> = ({
  maskBrushSize,
  maskEraseMode,
  onMaskBrushSizeChange,
  onMaskSetEraseMode,
}) => {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { activeTool, setActiveTool } = useUIStore();

  if (!project) return null;

  const availableTools = getAvailableTools(project.type);

  if (availableTools.length === 0) return null;

  return (
    <div className="annotix-floating" style={{ left: '20px', top: '50%', transform: 'translateY(-50%)' }}>
      <div className="flex items-start gap-1">
        <h4
          className="text-[0.6em] uppercase font-semibold tracking-wider self-center"
          style={{
            color: 'var(--annotix-gray)',
            writingMode: 'vertical-lr',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            letterSpacing: '0.15em',
          }}
        >
          {t('canvas.tools')}
        </h4>

        <div className="flex flex-col gap-1">
          <div className="flex flex-col gap-2">
            {availableTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  'annotix-tool-btn',
                  activeTool === tool.id && 'active'
                )}
                title={`${t(tool.name)} (${shortcutsManager.getKeyForShortcut(TOOL_SHORTCUT_MAP[tool.id])})`}
              >
                <i className={`fas ${tool.icon}`}></i>
              </button>
            ))}
          </div>

          {activeTool === 'mask' && typeof maskBrushSize === 'number' && (
            <div className="flex flex-col items-center gap-1 min-w-[46px]">
              {/* Pincel y goma como botones separados */}
              <div className="flex flex-col gap-1">
                <button
                  className={cn('annotix-tool-btn', !maskEraseMode && 'active')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMaskSetEraseMode?.(false);
                  }}
                  title={`${t('tools.maskBrush')} (${shortcutsManager.getKeyForShortcut('mask-erase-toggle')})`}
                >
                  <i className="fas fa-paint-brush"></i>
                </button>
                <button
                  className={cn('annotix-tool-btn', maskEraseMode && 'active')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMaskSetEraseMode?.(true);
                  }}
                  title={`${t('tools.maskEraser')} (${shortcutsManager.getKeyForShortcut('mask-erase-toggle')})`}
                >
                  <i className="fas fa-eraser"></i>
                </button>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={maskBrushSize}
                onChange={(event) => {
                  event.stopPropagation();
                  onMaskBrushSizeChange?.(Number(event.target.value));
                }}
                className="h-24 w-2"
                style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                title={shortcutsManager.getKeyForShortcut('mask-brush-size')}
              />
              <span className="text-xs font-medium">{maskBrushSize}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
