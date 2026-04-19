import { useTranslation } from 'react-i18next';
import { Hand, Square, PenTool, Hexagon, Dot, LayoutGrid, Box, Wand2 } from 'lucide-react';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useSamStore } from '../../sam/store/useSamStore';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function CanvasToolbar() {
  const { t } = useTranslation();
  const { activeTool, setActiveTool } = useUIStore();
  const { project } = useCurrentProject();
  const samAssistActive = useSamStore((s) => s.samAssistActive);
  const setSamAssistActive = useSamStore((s) => s.setSamAssistActive);
  const pairId = useSamStore((s) => s.pairId);
  const generating = useSamStore((s) => s.generating);
  const candidatesCount = useSamStore((s) => s.candidates.length);
  const requestAmg = useSamStore((s) => s.requestAmg);

  const tools = [
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

  // SAM: solo depende de que haya par cargado. La tool activa no influye;
  // el formato de anotación al aceptar se deriva de project.type.
  const samDisabled = !pairId || generating;
  const samTooltip = !pairId
    ? t('sam.toolbarTooltipNoModel')
    : generating
      ? t('sam.panel.progress')
      : t('sam.toolbarTooltip');

  const handleSamClick = () => {
    if (!pairId) return;
    if (samAssistActive) {
      setSamAssistActive(false);
      return;
    }
    setSamAssistActive(true);
    if (candidatesCount === 0) requestAmg();
  };

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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={samAssistActive ? 'default' : 'ghost'}
                size="icon"
                disabled={samDisabled}
                className={cn(
                  "h-10 w-10 transition-colors",
                  samAssistActive ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  samDisabled && "opacity-60"
                )}
                onClick={handleSamClick}
              >
                <Wand2 className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{samTooltip} (S)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
