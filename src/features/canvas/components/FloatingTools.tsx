import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useUIStore } from '@/features/core/store/uiStore';
import { getAvailableTools } from '../config/toolsConfig';
import { cn } from '@/lib/utils';

interface FloatingToolsProps {
  maskBrushSize?: number;
  maskEraseMode?: boolean;
  onMaskBrushSizeChange?: (size: number) => void;
  onMaskToggleErase?: () => void;
}

export const FloatingTools: React.FC<FloatingToolsProps> = ({
  maskBrushSize,
  maskEraseMode,
  onMaskBrushSizeChange,
  onMaskToggleErase,
}) => {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { activeTool, setActiveTool } = useUIStore();

  if (!project) return null;

  const availableTools = getAvailableTools(project.type);

  if (availableTools.length === 0) return null;

  return (
    <div className="annotix-floating" style={{ left: '20px', top: '50%', transform: 'translateY(-50%)' }}>
      <div className="flex flex-col gap-1">
        <h4 className="text-[0.7em] uppercase font-semibold tracking-wider" style={{ color: 'var(--annotix-gray)' }}>
          {t('canvas.tools')}
        </h4>

        <div className="flex items-start gap-1">
          <div className="flex flex-col gap-2">
            {availableTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  'annotix-tool-btn',
                  activeTool === tool.id && 'active'
                )}
                title={`${t(tool.name)} (${tool.key})`}
              >
                <i className={`fas ${tool.icon}`}></i>
              </button>
            ))}
          </div>

          {activeTool === 'mask' && typeof maskBrushSize === 'number' && (
            <div className="flex flex-col items-center gap-1 min-w-[46px]">
              <div className="flex items-center gap-2">
                <button
                  className={cn('annotix-tool-btn', maskEraseMode && 'active')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMaskToggleErase?.();
                  }}
                  title="E"
                >
                  <i className={`fas ${maskEraseMode ? 'fa-eraser' : 'fa-paint-brush'}`}></i>
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
                title="[ / ]"
              />
              <span className="text-xs font-medium">{maskBrushSize}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
