// src/features/timeseries/components/TimeSeriesTools.tsx

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import {
  MousePointer2,
  MapPin,
  MoveHorizontal,
  Zap,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { TSAnnotationTool } from '../hooks/useTSAnnotations';

interface TimeSeriesToolsProps {
  activeTool: TSAnnotationTool;
  onToolChange: (tool: TSAnnotationTool) => void;
  onClearAnnotations: () => void;
  annotationCount: number;
}

export function TimeSeriesTools({
  activeTool,
  onToolChange,
  onClearAnnotations,
  annotationCount,
}: TimeSeriesToolsProps) {
  const { t } = useTranslation();

  const tools = [
    {
      id: 'select' as TSAnnotationTool,
      icon: MousePointer2,
      label: t('timeseries.tools.select'),
      shortcut: 'V',
    },
    {
      id: 'point' as TSAnnotationTool,
      icon: MapPin,
      label: t('timeseries.tools.point'),
      shortcut: 'P',
    },
    {
      id: 'range' as TSAnnotationTool,
      icon: MoveHorizontal,
      label: t('timeseries.tools.range'),
      shortcut: 'R',
    },
    {
      id: 'event' as TSAnnotationTool,
      icon: Zap,
      label: t('timeseries.tools.event'),
      shortcut: 'E',
    },
    {
      id: 'anomaly' as TSAnnotationTool,
      icon: AlertTriangle,
      label: t('timeseries.tools.anomaly'),
      shortcut: 'A',
    },
  ];

  return (
    <div className="flex items-center gap-2 p-2 bg-background border-b">
      <TooltipProvider>
        {/* Tool Buttons */}
        <div className="flex items-center gap-1">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;

            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => onToolChange(tool.id)}
                    className="h-9 w-9 p-0"
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {tool.label} <span className="text-muted-foreground">({tool.shortcut})</span>
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Annotation Count */}
        <div className="text-sm text-muted-foreground px-2">
          {annotationCount} {t('timeseries.annotationsCount')}
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Clear Annotations */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAnnotations}
              disabled={annotationCount === 0}
              className="h-9 w-9 p-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('timeseries.clearAnnotations')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
