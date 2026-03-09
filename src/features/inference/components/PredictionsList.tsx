import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PredictionEntry } from '../types';

interface PredictionsListProps {
  predictions: PredictionEntry[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onConvert: () => void;
  onClear: () => void;
}

export function PredictionsList({
  predictions,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onConvert,
  onClear,
}: PredictionsListProps) {
  const { t } = useTranslation('inference');

  const pending = predictions.filter((p) => p.status === 'pending');
  const accepted = predictions.filter((p) => p.status === 'accepted');
  const rejected = predictions.filter((p) => p.status === 'rejected');

  if (predictions.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        <i className="fas fa-search text-lg mb-2 block" />
        {t('noPredictions')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
          {pending.length} {t('pending')}
        </Badge>
        <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400">
          {accepted.length} {t('accepted')}
        </Badge>
        <Badge variant="secondary" className="bg-red-500/20 text-red-400">
          {rejected.length} {t('rejected')}
        </Badge>
      </div>

      {/* Acciones masivas */}
      <div className="flex gap-1">
        {pending.length > 0 && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={onAcceptAll}
            >
              <i className="fas fa-check mr-1" />
              {t('acceptAll')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={onRejectAll}
            >
              <i className="fas fa-times mr-1" />
              {t('rejectAll')}
            </Button>
          </>
        )}
        {accepted.length > 0 && (
          <Button
            size="sm"
            className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onConvert}
          >
            <i className="fas fa-exchange-alt mr-1" />
            {t('convertAll')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-7 text-gray-400 hover:text-gray-300 ml-auto"
          onClick={onClear}
        >
          <i className="fas fa-trash text-xs" />
        </Button>
      </div>

      {/* Lista de predicciones */}
      <ScrollArea className="max-h-64">
        <div className="space-y-1">
          {predictions.map((pred) => (
            <div
              key={pred.id}
              className={`flex items-center gap-2 p-2 rounded text-xs transition-colors ${
                pred.status === 'accepted'
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : pred.status === 'rejected'
                  ? 'bg-red-500/5 border border-red-500/10 opacity-50'
                  : 'bg-gray-800/50 border border-gray-700/50 hover:bg-gray-800'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-200 truncate">
                    {pred.className}
                  </span>
                  <span className="text-gray-500 font-mono">
                    {(pred.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {pred.status === 'pending' && (
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => onAccept(pred.id)}
                    className="w-6 h-6 rounded flex items-center justify-center bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                    title={t('acceptPrediction')}
                  >
                    <i className="fas fa-check text-[10px]" />
                  </button>
                  <button
                    onClick={() => onReject(pred.id)}
                    className="w-6 h-6 rounded flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    title={t('rejectPrediction')}
                  >
                    <i className="fas fa-times text-[10px]" />
                  </button>
                </div>
              )}

              {pred.status === 'accepted' && (
                <i className="fas fa-check-circle text-emerald-400 text-xs" />
              )}
              {pred.status === 'rejected' && (
                <i className="fas fa-times-circle text-red-400 text-xs" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
