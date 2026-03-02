import { useTranslation } from 'react-i18next';

interface Props {
  instruction: string;
}

export function AutomationUserPrompt({ instruction }: Props) {
  const { t } = useTranslation();

  return (
    <div className="mx-2 my-1 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30">
      <div className="flex items-center gap-2 mb-1">
        <i className="fas fa-exclamation-triangle text-amber-500 text-sm" />
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          {t('automation.status.waitingUser')}
        </span>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        {t(instruction, { defaultValue: instruction })}
      </p>
    </div>
  );
}
