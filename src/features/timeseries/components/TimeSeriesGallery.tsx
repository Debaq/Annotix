import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Trash2 } from 'lucide-react';
import { useTimeSeries } from '../hooks/useTimeSeries';
import { useUIStore } from '../../core/store/uiStore';
import { CSVImporter } from './CSVImporter';

export function TimeSeriesGallery() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { timeseries, deleteTimeSeries, stats } = useTimeSeries();
  
  const handleSelect = (id: number) => {
    if (projectId) {
      navigate(`/projects/${projectId}/timeseries/${id}`);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('timeseries.deleteConfirm'))) {
      await deleteTimeSeries(id);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="flex gap-4">
        <Card className="p-4 flex-1">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">
            {t('timeseries.totalSeries')}
          </div>
        </Card>
        <Card className="p-4 flex-1">
          <div className="text-2xl font-bold">{stats.annotated}</div>
          <div className="text-sm text-muted-foreground">
            {t('timeseries.annotated')}
          </div>
        </Card>
        <Card className="p-4 flex-1">
          <div className="text-2xl font-bold">{stats.pending}</div>
          <div className="text-sm text-muted-foreground">
            {t('timeseries.pending')}
          </div>
        </Card>
      </div>

      {/* Import CSV */}
      <CSVImporter />

      {/* Time Series List */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {t('timeseries.seriesList')}
        </h3>

        {timeseries.length === 0 ? (
          <Card className="p-8 text-center">
            <LineChart className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t('timeseries.noSeriesYet')}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('timeseries.importCSVToStart')}
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {timeseries.map((ts) => (
              <Card
                key={ts.id}
                className="p-4 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => ts.id && handleSelect(ts.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LineChart className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{ts.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {ts.data.timestamps.length} {t('timeseries.dataPoints')}
                        {Array.isArray(ts.data.values[0]) &&
                          ` • ${(ts.data.values as number[][]).length} ${t('timeseries.series')}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ts.annotations.length > 0 && (
                      <Badge variant="secondary">
                        {ts.annotations.length} {t('timeseries.annotations')}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => ts.id && handleDelete(ts.id, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
