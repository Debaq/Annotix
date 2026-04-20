import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrainingEpochMetrics } from '../types';
import { analyzeTraining, type Observation, type ObservationSeverity } from '../utils/observationRules';

export type ObservationStyle = 'pro' | 'fun';

interface TrainingObservationsProps {
  metricsHistory: TrainingEpochMetrics[];
  style: ObservationStyle;
  onStyleChange: (s: ObservationStyle) => void;
}

const SEVERITY_CLASSES: Record<ObservationSeverity, { bg: string; text: string; icon: string; border: string }> = {
  ok:   { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30', icon: 'fa-circle-check' },
  info: { bg: 'bg-sky-500/10',     text: 'text-sky-500',     border: 'border-sky-500/30',     icon: 'fa-circle-info' },
  warn: { bg: 'bg-amber-500/10',   text: 'text-amber-500',   border: 'border-amber-500/30',   icon: 'fa-triangle-exclamation' },
  bad:  { bg: 'bg-red-500/10',     text: 'text-red-500',     border: 'border-red-500/30',     icon: 'fa-circle-xmark' },
};

const SEVERITY_ORDER: ObservationSeverity[] = ['bad', 'warn', 'ok', 'info'];

export function TrainingObservations({ metricsHistory, style, onStyleChange }: TrainingObservationsProps) {
  const { t } = useTranslation();

  const observations = useMemo(() => {
    const list = analyzeTraining(metricsHistory);
    return list.sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
  }, [metricsHistory]);

  const translate = (o: Observation): string => {
    const base = `training.observations.rules.${o.ruleKey}.${style}`;
    return t(base, { defaultValue: t(`training.observations.rules.${o.ruleKey}.pro`, o.params ?? {}), ...(o.params ?? {}) });
  };

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b shrink-0">
        <div className="flex items-center gap-2">
          <i className="fas fa-lightbulb text-amber-500 text-xs" />
          <span className="text-xs font-medium">{t('training.observations.title')}</span>
        </div>
        <div className="flex items-center rounded-md bg-background border text-[10px] overflow-hidden">
          <button
            type="button"
            onClick={() => onStyleChange('pro')}
            className={`px-2 py-0.5 transition-colors ${style === 'pro' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {t('training.observations.stylePro')}
          </button>
          <button
            type="button"
            onClick={() => onStyleChange('fun')}
            className={`px-2 py-0.5 transition-colors ${style === 'fun' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {t('training.observations.styleFun')}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        {observations.map((o) => {
          const cls = SEVERITY_CLASSES[o.severity];
          return (
            <div
              key={o.id}
              className={`flex gap-2 p-2 rounded-md border ${cls.bg} ${cls.border}`}
            >
              <i className={`fas ${cls.icon} ${cls.text} text-xs mt-0.5 shrink-0`} />
              <p className="text-[11px] leading-snug">{translate(o)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
