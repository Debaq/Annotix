// src/features/timeseries/components/TimeSeriesCanvas.tsx

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  InteractionItem,
} from 'chart.js';
import { getRelativePosition } from 'chart.js/helpers';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useCurrentTimeSeries } from '../hooks/useCurrentTimeSeries';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useTSAnnotations } from '../hooks/useTSAnnotations';
import { TimeSeriesTools } from './TimeSeriesTools';
import { TimeSeriesAnnotationsList } from './TimeSeriesAnnotationsList';
import {
  PointAnnotation,
  RangeAnnotation,
  EventAnnotation,
  AnomalyAnnotation,
} from '@/lib/db';
import { useUIStore } from '@/features/core/store/uiStore';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin,
  zoomPlugin
);

export function TimeSeriesCanvas() {
  const { t } = useTranslation();
  const { timeseries } = useCurrentTimeSeries();
  const { project } = useCurrentProject();
  const { activeClassId } = useUIStore();
  const chartRef = useRef<ChartJS<'line'>>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    annotations,
    selectedAnnotationId,
    activeTool,
    isDrawing,
    tempAnnotation,
    setActiveTool,
    startDrawing,
    updateDrawing,
    finishDrawing,
    cancelDrawing,
    selectAnnotation,
    deleteAnnotation,
    clearAnnotations,
  } = useTSAnnotations({
    timeseriesId: timeseries?.id || null,
  });

  if (!timeseries || !project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          {t('timeseries.noSeriesSelected')}
        </div>
      </div>
    );
  }

  const { data } = timeseries;
  const isMultivariate = Array.isArray(data.values[0]);

  // Prepare chart data
  const chartData = {
    labels: data.timestamps.map((ts) => ts.toString()),
    datasets: isMultivariate
      ? (data.values as number[][]).map((series, index) => ({
          label: data.columns?.[index] || `Series ${index + 1}`,
          data: series,
          borderColor: `hsl(${(index * 360) / (data.values as number[][]).length}, 70%, 50%)`,
          backgroundColor: `hsl(${(index * 360) / (data.values as number[][]).length}, 70%, 50%, 0.1)`,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.1,
        }))
      : [
          {
            label: 'Value',
            data: data.values as number[],
            borderColor: 'hsl(220, 70%, 50%)',
            backgroundColor: 'hsl(220, 70%, 50%, 0.1)',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.1,
          },
        ],
  };

  // Generate annotations config for Chart.js
  const getChartAnnotations = () => {
    const chartAnnotations: any = {};

    [...annotations, ...(tempAnnotation ? [tempAnnotation] : [])].forEach((ann, idx) => {
      const classColor = ann.classId
        ? project.classes.find((c) => c.id === ann.classId)?.color || '#666'
        : '#666';

      if (ann.type === 'point') {
        const pointData = ann.data as PointAnnotation;
        const timestampIndex = data.timestamps.indexOf(pointData.timestamp);
        if (timestampIndex !== -1) {
          chartAnnotations[`point-${ann.id || idx}`] = {
            type: 'point',
            xValue: timestampIndex,
            yValue: pointData.value || 0,
            backgroundColor: classColor,
            borderColor: classColor,
            borderWidth: 2,
            radius: 6,
          };
        }
      } else if (ann.type === 'range') {
        const rangeData = ann.data as RangeAnnotation;
        const startIndex = data.timestamps.indexOf(rangeData.startTimestamp);
        const endIndex = data.timestamps.indexOf(rangeData.endTimestamp);
        if (startIndex !== -1 && endIndex !== -1) {
          chartAnnotations[`range-${ann.id || idx}`] = {
            type: 'box',
            xMin: startIndex,
            xMax: endIndex,
            backgroundColor: `${classColor}33`,
            borderColor: classColor,
            borderWidth: 2,
          };
        }
      } else if (ann.type === 'event') {
        const eventData = ann.data as EventAnnotation;
        const timestampIndex = data.timestamps.indexOf(eventData.timestamp);
        if (timestampIndex !== -1) {
          chartAnnotations[`event-${ann.id || idx}`] = {
            type: 'line',
            xMin: timestampIndex,
            xMax: timestampIndex,
            borderColor: classColor,
            borderWidth: 3,
            borderDash: [5, 5],
            label: {
              display: true,
              content: eventData.eventType,
              position: 'start',
            },
          };
        }
      } else if (ann.type === 'anomaly') {
        const anomalyData = ann.data as AnomalyAnnotation;
        const timestampIndex = data.timestamps.indexOf(anomalyData.timestamp);
        if (timestampIndex !== -1) {
          chartAnnotations[`anomaly-${ann.id || idx}`] = {
            type: 'point',
            xValue: timestampIndex,
            yValue: 0,
            backgroundColor: 'rgba(255, 0, 0, 0.8)',
            borderColor: 'red',
            borderWidth: 2,
            radius: 8,
          };
        }
      }
    });

    return chartAnnotations;
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event, elements, chart) => {
      if (activeTool === 'select') return;

      const canvasPosition = getRelativePosition(event, chart);
      const dataX = chart.scales.x.getValueForPixel(canvasPosition.x);
      const dataY = chart.scales.y.getValueForPixel(canvasPosition.y);

      if (dataX === undefined || dataY === undefined) return;

      const timestampIndex = Math.round(dataX);
      if (timestampIndex < 0 || timestampIndex >= data.timestamps.length) return;

      const timestamp = data.timestamps[timestampIndex];

      if (!isDrawing) {
        // Start new annotation
        startDrawing(timestamp, dataY);
      } else {
        // Finish annotation (for range tool)
        finishDrawing(activeClassId || undefined);
      }
    },
    onHover: (event, elements, chart) => {
      if (activeTool === 'range' && isDrawing) {
        const canvasPosition = getRelativePosition(event, chart);
        const dataX = chart.scales.x.getValueForPixel(canvasPosition.x);

        if (dataX !== undefined) {
          const timestampIndex = Math.round(dataX);
          if (timestampIndex >= 0 && timestampIndex < data.timestamps.length) {
            const timestamp = data.timestamps[timestampIndex];
            updateDrawing(timestamp);
          }
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: timeseries.name,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
      annotation: {
        annotations: getChartAnnotations(),
      },
      zoom: {
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: 'x',
        },
        pan: {
          enabled: true,
          mode: 'x',
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Value',
        },
      },
    },
  };

  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  const handleZoomIn = () => {
    if (chartRef.current) {
      chartRef.current.zoom(1.2);
    }
  };

  const handleZoomOut = () => {
    if (chartRef.current) {
      chartRef.current.zoom(0.8);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawing) {
        cancelDrawing();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnotationId) {
          deleteAnnotation(selectedAnnotationId);
        }
      } else if (!e.ctrlKey && !e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setActiveTool('select');
            break;
          case 'p':
            setActiveTool('point');
            break;
          case 'r':
            setActiveTool('range');
            break;
          case 'e':
            setActiveTool('event');
            break;
          case 'a':
            setActiveTool('anomaly');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isDrawing,
    selectedAnnotationId,
    setActiveTool,
    cancelDrawing,
    deleteAnnotation,
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <TimeSeriesTools
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onClearAnnotations={clearAnnotations}
        annotationCount={annotations.length}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Chart Area */}
        <div className="flex-1 flex flex-col">
          {/* Zoom Controls */}
          <Card className="p-2 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{timeseries.name}</h3>
              <span className="text-xs text-muted-foreground">
                {data.timestamps.length} {t('timeseries.dataPoints')}
              </span>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetZoom}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </Card>

          {/* Chart */}
          <div className="flex-1 p-4 overflow-hidden">
            <Line ref={chartRef} data={chartData} options={options} />
          </div>

          {/* Instructions */}
          {activeTool !== 'select' && (
            <Card className="p-2 border-t bg-muted">
              <p className="text-xs text-center">
                {activeTool === 'point' && t('timeseries.instructions.point')}
                {activeTool === 'range' && t('timeseries.instructions.range')}
                {activeTool === 'event' && t('timeseries.instructions.event')}
                {activeTool === 'anomaly' && t('timeseries.instructions.anomaly')}
              </p>
            </Card>
          )}
        </div>

        {/* Annotations Sidebar */}
        <div className="w-80 border-l flex flex-col">
          <div className="p-3 border-b">
            <h4 className="font-semibold text-sm">{t('timeseries.annotations')}</h4>
          </div>
          <TimeSeriesAnnotationsList
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            classes={project.classes}
            onSelectAnnotation={selectAnnotation}
            onDeleteAnnotation={deleteAnnotation}
          />
        </div>
      </div>
    </div>
  );
}
