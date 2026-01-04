import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useUIStore } from '@/features/core/store/uiStore';
import { getAvailableTools } from '../config/toolsConfig';
import { cn } from '@/lib/utils';

export const FloatingTools: React.FC = () => {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { activeTool, setActiveTool } = useUIStore();

  if (!project) return null;

  const availableTools = getAvailableTools(project.type);

  if (availableTools.length === 0) return null;

  return (
    <div className="annotix-floating" style={{ left: '20px', top: '50%', transform: 'translateY(-50%)' }}>
      <div className="flex flex-col gap-2">
        <h4 className="text-[0.7em] uppercase font-semibold tracking-wider mb-1" style={{ color: 'var(--annotix-gray)' }}>
          {t('canvas.tools')}
        </h4>
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
    </div>
  );
};
