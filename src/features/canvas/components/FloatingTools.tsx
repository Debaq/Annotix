import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useUIStore } from '@/features/core/store/uiStore';
import { getAvailableTools } from '../config/toolsConfig';
import { shortcutsManager } from '@/features/core/utils/ShortcutsManager';
import { cn } from '@/lib/utils';
import type { ToolId } from '../config/toolsConfig';

const TOOL_SHORTCUT_MAP: Record<ToolId, string> = {
  pan: 'tool-pan',
  bbox: 'tool-box',
  mask: 'tool-mask',
  polygon: 'tool-polygon',
  keypoints: 'tool-keypoints',
  landmarks: 'tool-landmarks',
  obb: 'tool-obb',
};

type BrushShape = 'circle' | 'square';

interface FloatingToolsProps {
  maskBrushSize?: number;
  maskEraseMode?: boolean;
  maskBrushShape?: BrushShape;
  maskMaxBrushSize?: number;
  maskDirty?: boolean;
  onMaskBrushSizeChange?: (size: number) => void;
  onMaskSetEraseMode?: (erase: boolean) => void;
  onMaskToggleBrushShape?: () => void;
}

export const FloatingTools: React.FC<FloatingToolsProps> = ({
  maskBrushSize,
  maskEraseMode,
  maskBrushShape = 'circle',
  maskMaxBrushSize = 100,
  maskDirty,
  onMaskBrushSizeChange,
  onMaskSetEraseMode,
  onMaskToggleBrushShape,
}) => {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { activeTool, setActiveTool } = useUIStore();

  if (!project) return null;

  const availableTools = getAvailableTools(project.type);
  if (availableTools.length === 0) return null;

  const hasMaskTool = availableTools.some((tool) => tool.id === 'mask');
  const isMaskActive = activeTool === 'mask';

  const handleBrushClick = () => {
    setActiveTool('mask');
    onMaskSetEraseMode?.(false);
  };

  const handleEraserClick = () => {
    setActiveTool('mask');
    onMaskSetEraseMode?.(true);
  };

  const handleSizeChange = (delta: number) => {
    if (maskBrushSize == null) return;
    const next = Math.max(1, Math.min(maskMaxBrushSize, maskBrushSize + delta));
    onMaskBrushSizeChange?.(next);
  };

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

        <div className="flex flex-col gap-2">
          {/* Herramientas principales (sin mask, que se reemplaza por pincel/goma) */}
          {availableTools
            .filter((tool) => !(hasMaskTool && tool.id === 'mask'))
            .map((tool) => (
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

          {/* Pincel y goma como herramientas directas (reemplazan al botón "mask") */}
          {hasMaskTool && (
            <>
              <button
                onClick={handleBrushClick}
                className={cn(
                  'annotix-tool-btn',
                  isMaskActive && !maskEraseMode && 'active'
                )}
                title={`${t('tools.maskBrush')} (${shortcutsManager.getKeyForShortcut('tool-mask')})`}
              >
                <i className="fas fa-paint-brush"></i>
              </button>
              <button
                onClick={handleEraserClick}
                className={cn(
                  'annotix-tool-btn',
                  isMaskActive && maskEraseMode && 'active'
                )}
                title={`${t('tools.maskEraser')} (${shortcutsManager.getKeyForShortcut('mask-erase-toggle')})`}
              >
                <i className="fas fa-eraser"></i>
              </button>
            </>
          )}

          {/* Grosor del pincel — spin numérico */}
          {hasMaskTool && isMaskActive && typeof maskBrushSize === 'number' && (
            <div className="flex flex-col items-center gap-0.5">
              <button
                className="annotix-tool-btn !w-7 !h-5 !min-h-0 !text-[10px]"
                onClick={() => handleSizeChange(5)}
                title={`${shortcutsManager.getKeyForShortcut('mask-brush-size')} ]`}
              >
                <i className="fas fa-plus fa-xs"></i>
              </button>
              <input
                type="number"
                min={1}
                max={maskMaxBrushSize}
                value={maskBrushSize}
                onChange={(e) => {
                  e.stopPropagation();
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) onMaskBrushSizeChange?.(Math.max(1, Math.min(maskMaxBrushSize, v)));
                }}
                className="w-10 text-center text-xs font-medium bg-transparent border rounded px-0.5 py-0.5
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{ borderColor: 'var(--annotix-border)' }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="annotix-tool-btn !w-7 !h-5 !min-h-0 !text-[10px]"
                onClick={() => handleSizeChange(-5)}
                title={`${shortcutsManager.getKeyForShortcut('mask-brush-size')} [`}
              >
                <i className="fas fa-minus fa-xs"></i>
              </button>
            </div>
          )}

          {/* Toggle forma del pincel — círculo / cuadrado */}
          {hasMaskTool && isMaskActive && (
            <button
              onClick={onMaskToggleBrushShape}
              className="annotix-tool-btn"
              title={t(maskBrushShape === 'circle' ? 'tools.brushSquare' : 'tools.brushCircle')}
            >
              <i className={`fas ${maskBrushShape === 'circle' ? 'fa-square' : 'fa-circle'}`}></i>
            </button>
          )}

          {/* Indicador de cambios sin guardar */}
          {hasMaskTool && isMaskActive && (
            <div
              className={cn(
                'w-2.5 h-2.5 rounded-full mx-auto transition-all duration-300',
                maskDirty
                  ? 'bg-amber-400 scale-100'
                  : 'bg-emerald-400 scale-75'
              )}
              title={t(maskDirty ? 'tools.unsaved' : 'tools.saved')}
            />
          )}
        </div>
      </div>
    </div>
  );
};
