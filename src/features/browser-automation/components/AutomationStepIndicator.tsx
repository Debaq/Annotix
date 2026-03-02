import { useTranslation } from 'react-i18next';
import type { AutomationStep } from '../types';

interface Props {
  step: AutomationStep;
  index: number;
  total: number;
  isCurrent: boolean;
}

export function AutomationStepIndicator({ step, index, total, isCurrent }: Props) {
  const { t } = useTranslation();

  const stateIcon = () => {
    switch (step.state) {
      case 'completed':
        return <i className="fas fa-check-circle text-green-500" />;
      case 'running':
        return <i className="fas fa-spinner fa-spin text-blue-500" />;
      case 'waiting_user':
        return <i className="fas fa-hand-paper text-amber-500" />;
      case 'failed':
        return <i className="fas fa-times-circle text-red-500" />;
      case 'skipped':
        return <i className="fas fa-forward text-zinc-400" />;
      default:
        return <i className="fas fa-circle text-zinc-600 text-[8px]" />;
    }
  };

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
        isCurrent
          ? 'bg-accent/50 font-medium'
          : step.state === 'completed'
          ? 'opacity-70'
          : ''
      }`}
    >
      <span className="w-4 flex justify-center">{stateIcon()}</span>
      <span className="flex-1 truncate">
        {t(step.name, { defaultValue: step.name })}
      </span>
      <span className="text-muted-foreground">
        {index + 1}/{total}
      </span>
    </div>
  );
}
