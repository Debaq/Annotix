// src/features/timeseries/components/TimeSeriesAnnotationsList.tsx

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from 'react-i18next';
import { Trash2, MapPin, MoveHorizontal, Zap, AlertTriangle, Tag } from 'lucide-react';
import {
  TimeSeriesAnnotation,
  PointAnnotation,
  RangeAnnotation,
  EventAnnotation,
  AnomalyAnnotation,
  ClassDefinition,
} from '@/lib/db';

interface TimeSeriesAnnotationsListProps {
  annotations: TimeSeriesAnnotation[];
  selectedAnnotationId: string | null;
  classes: ClassDefinition[];
  onSelectAnnotation: (annotationId: string | null) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

export function TimeSeriesAnnotationsList({
  annotations,
  selectedAnnotationId,
  classes,
  onSelectAnnotation,
  onDeleteAnnotation,
}: TimeSeriesAnnotationsListProps) {
  const { t } = useTranslation();

  const getAnnotationIcon = (type: TimeSeriesAnnotation['type']) => {
    switch (type) {
      case 'point':
        return MapPin;
      case 'range':
        return MoveHorizontal;
      case 'event':
        return Zap;
      case 'anomaly':
        return AlertTriangle;
      case 'classification':
        return Tag;
    }
  };

  const getAnnotationLabel = (annotation: TimeSeriesAnnotation) => {
    switch (annotation.type) {
      case 'point': {
        const data = annotation.data as PointAnnotation;
        return `${t('timeseries.tools.point')}: ${new Date(data.timestamp).toLocaleString()}`;
      }
      case 'range': {
        const data = annotation.data as RangeAnnotation;
        return `${t('timeseries.tools.range')}: ${new Date(data.startTimestamp).toLocaleString()} - ${new Date(data.endTimestamp).toLocaleString()}`;
      }
      case 'event': {
        const data = annotation.data as EventAnnotation;
        return `${t('timeseries.tools.event')}: ${data.eventType}`;
      }
      case 'anomaly': {
        const data = annotation.data as AnomalyAnnotation;
        return `${t('timeseries.tools.anomaly')}: ${data.score.toFixed(2)}`;
      }
      case 'classification':
        return t('timeseries.tools.classification');
    }
  };

  const getClassName = (classId?: number) => {
    if (!classId) return null;
    const classObj = classes.find((c) => c.id === classId);
    return classObj?.name || null;
  };

  if (annotations.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t('timeseries.noAnnotations')}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-1">
        {annotations.map((annotation) => {
          const Icon = getAnnotationIcon(annotation.type);
          const isSelected = annotation.id === selectedAnnotationId;
          const className = getClassName(annotation.classId);

          return (
            <div
              key={annotation.id}
              className={`
                flex items-center gap-2 p-2 rounded cursor-pointer transition-colors
                ${isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}
              `}
              onClick={() => onSelectAnnotation(isSelected ? null : annotation.id)}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {getAnnotationLabel(annotation)}
                </div>
                {className && (
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {className}
                  </Badge>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteAnnotation(annotation.id);
                }}
                className={`
                  h-7 w-7 p-0 flex-shrink-0
                  ${isSelected ? 'hover:bg-primary-foreground/20' : ''}
                `}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
