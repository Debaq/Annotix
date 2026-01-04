import { useTranslation } from 'react-i18next';
import { MousePointer2, Hand, Square, PenTool, Hexagon, Dot, LayoutGrid, Box } from 'lucide-react';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function CanvasToolbar() {
  const { t } = useTranslation();
  const { activeTool, setActiveTool } = useUIStore();
  const { project } = useCurrentProject();

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'tools.select', shortcut: 'V' },
    { id: 'pan', icon: Hand, label: 'tools.pan', shortcut: 'H' },
  ];

  if (project?.type === 'bbox') {
    tools.push({ id: 'bbox', icon: Square, label: 'tools.bbox', shortcut: 'B' });
  } else if (project?.type === 'mask') {
    tools.push({ id: 'mask', icon: PenTool, label: 'tools.mask', shortcut: 'M' });
  } else if (project?.type === 'polygon') {
    tools.push({ id: 'polygon', icon: Hexagon, label: 'tools.polygon', shortcut: 'P' });
  } else if (project?.type === 'keypoints') {
    tools.push({ id: 'keypoints', icon: Dot, label: 'tools.keypoints', shortcut: 'K' });
  } else if (project?.type === 'landmarks') {
    tools.push({ id: 'landmarks', icon: LayoutGrid, label: 'tools.landmarks', shortcut: 'L' });
  } else if (project?.type === 'obb') {
    tools.push({ id: 'obb', icon: Box, label: 'tools.obb', shortcut: 'O' });
  }

  return (
    <div className="absolute left-4 top-4 flex flex-col gap-2">
      <div className="flex flex-col gap-1 rounded-lg border bg-card p-1 shadow-md">
        <TooltipProvider>
          {tools.map((tool) => (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={activeTool === tool.id ? 'default' : 'ghost'}
                  size="icon"
                  className={cn(
                    "h-10 w-10 transition-colors",
                    activeTool === tool.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                  onClick={() => setActiveTool(tool.id as any)}
                >
                  <tool.icon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t(tool.label)} ({tool.shortcut})</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
}
