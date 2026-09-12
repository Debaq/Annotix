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
  Tag,
  Trash2
} from 'lucide-react';
import { TSAnnotationTool } from '../hooks/useTSAnnotations';
import { useShortcutKey } from '@/features/core/hooks/useShortcutKey';
import type { ClassDefinition, ProjectType } from '@/lib/db';
import { getTimeSeriesTools } from '../utils/tsToolsConfig';

// Mapeo de herramienta TS a shortcut ID
const TS_TOOL_SHORTCUT_MAP: Record<string, string> = {
  select: 'ts-tool-select',
  point: 'ts-tool-point',
  range: 'ts-tool-range',
  event: 'ts-tool-event',
  anomaly: 'ts-tool-anomaly',
  classification: 'ts-tool-classification',
};

function TSToolShortcutLabel({ toolId }: { toolId: string }) {
  const shortcutId = TS_TOOL_SHORTCUT_MAP[toolId];
  const key = useShortcutKey(shortcutId);
  return <span className="text-muted-foreground">({key})</span>;
}

interface TimeSeriesToolsProps {
  activeTool: TSAnnotationTool;
  onToolChange: (tool: TSAnnotationTool) => void;
  onClearAnnotations: () => void;
  annotationCount: number;
  projectType: ProjectType;
  classes: ClassDefinition[];
  /** Clase asignada a la serie completa, si el proyecto la usa */
  seriesClassId: number | null;
  onSetSeriesClass: (classId: number) => void;
}

const TOOL_ICONS: Record<TSAnnotationTool, typeof MousePointer2> = {
  select: MousePointer2,
  point: MapPin,
  range: MoveHorizontal,
  event: Zap,
  anomaly: AlertTriangle,
  classification: Tag,
};

export function TimeSeriesTools({
  activeTool,
  onToolChange,
  onClearAnnotations,
  annotationCount,
  projectType,
  classes,
  seriesClassId,
  onSetSeriesClass,
}: TimeSeriesToolsProps) {
  const { t } = useTranslation();

  // Cada tipo de proyecto ofrece solo las herramientas que le sirven, igual que
  // los proyectos de imagen. Antes se ofrecían las cinco para los nueve tipos,
  // incluidos los que no tienen nada que hacer con un rango o una anomalía.
  const availableTools = getTimeSeriesTools(projectType);
  const showClassification = availableTools.includes('classification');

  const tools = availableTools
    .filter((id) => id !== 'classification')
    .map((id) => ({
      id,
      icon: TOOL_ICONS[id],
      label: t(`timeseries.tools.${id}`),
    }));

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
                    {tool.label} <TSToolShortcutLabel toolId={tool.id} />
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Clasificación de la serie completa */}
        {showClassification && classes.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t('timeseries.seriesClass')}
              </span>
              <select
                className="h-8 rounded border border-input bg-background px-2 text-sm"
                value={seriesClassId ?? ''}
                onChange={(e) => {
                  if (e.target.value === '') return;
                  onSetSeriesClass(Number(e.target.value));
                }}
              >
                <option value="">{t('timeseries.selectClass')}</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

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
