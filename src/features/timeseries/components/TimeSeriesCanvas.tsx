import { useRef, useEffect, useState } from 'react';
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
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useCurrentTimeSeries } from '../hooks/useCurrentTimeSeries';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export function TimeSeriesCanvas() {
  const { t } = useTranslation();
  const { timeseries } = useCurrentTimeSeries();
  const { project } = useCurrentProject();
  const chartRef = useRef<ChartJS<'line'>>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  if (!timeseries) {
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
    labels: data.timestamps.map((ts, i) => ts.toString()),
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

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
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
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  };

  const handleZoomIn = () => {
    if (chartRef.current) {
      setZoomLevel((prev) => Math.min(prev * 1.2, 5));
    }
  };

  const handleZoomOut = () => {
    if (chartRef.current) {
      setZoomLevel((prev) => Math.max(prev / 1.2, 0.5));
    }
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    // Chart.js zoom reset would require zoom plugin
    // For now, just reset the zoom level state
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <Card className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{timeseries.name}</h3>
            <span className="text-sm text-muted-foreground">
              {data.timestamps.length} {t('timeseries.dataPoints')}
            </span>
          </div>
          <div className="flex gap-2">
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
        </div>
      </Card>

      {/* Chart */}
      <div className="flex-1 p-4 overflow-hidden">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>

      {/* Annotations Panel (placeholder for now) */}
      <Card className="p-4 border-t">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-sm">
              {t('timeseries.annotations')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {timeseries.annotations.length} {t('timeseries.annotationsCount')}
            </p>
          </div>
          <Button size="sm">{t('timeseries.addAnnotation')}</Button>
        </div>
      </Card>
    </div>
  );
}
