import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { ProjectStats } from '../../projects/components/ProjectStats';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TOOLS = [
  { id: 'bbox' as const, icon: 'fa-vector-square', key: 'B', requiresBBox: true },
  { id: 'mask' as const, icon: 'fa-paintbrush', key: 'M', requiresMask: true },
  { id: 'polygon' as const, icon: 'fa-draw-polygon', key: 'P', requiresPolygon: true },
  { id: 'keypoints' as const, icon: 'fa-user-circle', key: 'K', requiresKeypoints: true },
  { id: 'landmarks' as const, icon: 'fa-map-marker-alt', key: 'L', requiresLandmarks: true },
  { id: 'obb' as const, icon: 'fa-rectangle-wide', key: 'O', requiresOBB: true },
  { id: 'select' as const, icon: 'fa-mouse-pointer', key: 'V' },
  { id: 'pan' as const, icon: 'fa-hand', key: 'H' },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { currentProjectId, activeTool, setActiveTool } = useUIStore();
  const { project } = useCurrentProject();

  if (!currentProjectId || !project) {
    return null;
  }

  const handleToolClick = (toolId: typeof TOOLS[number]['id']) => {
    setActiveTool(toolId);
  };

  return (
    <aside className="w-64 border-r bg-card p-4">
      <div className="space-y-6">
        {/* Project Info */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            {t('sidebar.currentProject')}
          </h2>
          <div className="rounded-md border bg-background p-3">
            <p className="font-medium">{project.name}</p>
            <p className="text-xs text-muted-foreground">
              {t(`project.type.${project.type}`)}
            </p>
          </div>
        </div>

        {/* Tools */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            {t('sidebar.tools')}
          </h2>
          <div className="space-y-2">
            {TOOLS.map((tool) => {
              const isDisabled =
                (tool.requiresBBox && project.type !== 'bbox') ||
                (tool.requiresMask && project.type !== 'mask') ||
                (tool.requiresPolygon && project.type !== 'polygon') ||
                (tool.requiresKeypoints && project.type !== 'keypoints') ||
                (tool.requiresLandmarks && project.type !== 'landmarks') ||
                (tool.requiresOBB && project.type !== 'obb');

              return (
                <Button
                  key={tool.id}
                  variant={activeTool === tool.id ? 'default' : 'outline'}
                  className={cn('w-full justify-start', isDisabled && 'opacity-50')}
                  onClick={() => handleToolClick(tool.id)}
                  disabled={isDisabled}
                >
                  <i className={`fas ${tool.icon} mr-2`}></i>
                  {t(`tools.${tool.id}`)}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {tool.key}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <ProjectStats />
      </div>
    </aside>
  );
}
