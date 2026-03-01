import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TrainingEpochMetrics } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface TrainingMetricsChartProps {
  metricsHistory: TrainingEpochMetrics[];
}

export function TrainingMetricsChart({ metricsHistory }: TrainingMetricsChartProps) {
  const { t } = useTranslation();

  // Detect if this is a segmentation task (has meanIoU metrics)
  const isSegmentation = useMemo(
    () => metricsHistory.some((m) => m.meanIoU != null),
    [metricsHistory],
  );

  const lossData = useMemo(() => {
    const labels = metricsHistory.map((_, i) => `${i + 1}`);

    if (isSegmentation) {
      return {
        labels,
        datasets: [
          {
            label: 'Train Loss',
            data: metricsHistory.map((m) => m.trainLoss ?? null),
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.3,
            pointRadius: 1,
          },
          {
            label: 'Val Loss',
            data: metricsHistory.map((m) => m.valLoss ?? null),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3,
            pointRadius: 1,
          },
          {
            label: 'Dice Loss',
            data: metricsHistory.map((m) => m.diceLoss ?? null),
            borderColor: 'rgb(168, 85, 247)',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            tension: 0.3,
            pointRadius: 1,
          },
        ],
      };
    }

    return {
      labels,
      datasets: [
        {
          label: 'Box Loss',
          data: metricsHistory.map((m) => m.boxLoss ?? null),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          pointRadius: 1,
        },
        {
          label: 'Cls Loss',
          data: metricsHistory.map((m) => m.clsLoss ?? null),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          pointRadius: 1,
        },
        {
          label: 'DFL Loss',
          data: metricsHistory.map((m) => m.dflLoss ?? null),
          borderColor: 'rgb(168, 85, 247)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          tension: 0.3,
          pointRadius: 1,
        },
      ],
    };
  }, [metricsHistory, isSegmentation]);

  const mapData = useMemo(() => {
    const labels = metricsHistory.map((_, i) => `${i + 1}`);

    if (isSegmentation) {
      return {
        labels,
        datasets: [
          {
            label: 'mIoU',
            data: metricsHistory.map((m) => m.meanIoU ?? null),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.3,
            pointRadius: 1,
          },
          {
            label: 'Mean Accuracy',
            data: metricsHistory.map((m) => m.meanAccuracy ?? null),
            borderColor: 'rgb(234, 179, 8)',
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            tension: 0.3,
            pointRadius: 1,
          },
        ],
      };
    }

    return {
      labels,
      datasets: [
        {
          label: 'mAP50',
          data: metricsHistory.map((m) => m.mAP50 ?? null),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          pointRadius: 1,
        },
        {
          label: 'mAP50-95',
          data: metricsHistory.map((m) => m.mAP50_95 ?? null),
          borderColor: 'rgb(234, 179, 8)',
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          tension: 0.3,
          pointRadius: 1,
        },
        {
          label: 'Precision',
          data: metricsHistory.map((m) => m.precision ?? null),
          borderColor: 'rgb(6, 182, 212)',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          tension: 0.3,
          pointRadius: 1,
          hidden: true,
        },
        {
          label: 'Recall',
          data: metricsHistory.map((m) => m.recall ?? null),
          borderColor: 'rgb(249, 115, 22)',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          tension: 0.3,
          pointRadius: 1,
          hidden: true,
        },
      ],
    };
  }, [metricsHistory, isSegmentation]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 } as const,
    plugins: {
      legend: { position: 'top' as const, labels: { boxWidth: 12, font: { size: 10 } } },
    },
    scales: {
      x: { title: { display: true, text: t('training.monitor.epoch'), font: { size: 10 } } },
      y: { beginAtZero: true },
    },
  };

  if (metricsHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        {t('training.monitor.waitingMetrics')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="h-52">
        <h4 className="text-xs font-medium mb-1">{t('training.monitor.loss')}</h4>
        <Line data={lossData} options={options} />
      </div>
      <div className="h-52">
        <h4 className="text-xs font-medium mb-1">{t('training.monitor.metrics')}</h4>
        <Line data={mapData} options={options} />
      </div>
    </div>
  );
}
