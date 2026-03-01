import { useTranslation } from 'react-i18next';
import { BACKEND_PARAMS, DEFAULT_VALUES, type ParamDefinition } from '../../data/defaultParams';

interface Props {
  backendId: string;
}

function formatDefault(param: ParamDefinition, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (param.type === 'checkbox') return value ? 'true' : 'false';
  if (param.type === 'select') {
    const opt = param.options?.find(o => o.value === String(value));
    return opt ? opt.label : String(value);
  }
  return String(value);
}

function formatRange(param: ParamDefinition): string {
  if (param.type === 'checkbox') return 'bool';
  if (param.type === 'select') return param.options?.map(o => o.label).join(', ') ?? '—';
  if (param.min !== undefined && param.max !== undefined) {
    const step = param.step ? ` (step ${param.step})` : '';
    return `${param.min} – ${param.max}${step}`;
  }
  return '—';
}

function formatType(param: ParamDefinition): string {
  if (param.type === 'checkbox') return 'bool';
  if (param.type === 'select') return 'enum';
  if (param.type === 'slider') return 'float';
  return 'number';
}

export function ParamsTable({ backendId }: Props) {
  const { t } = useTranslation();
  const params = BACKEND_PARAMS[backendId] ?? [];
  const defaults = DEFAULT_VALUES[backendId] ?? {};

  if (params.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--annotix-border)] overflow-hidden transition-colors">
      <table className="w-full text-sm">
        <thead className="bg-[var(--annotix-light)] transition-colors">
          <tr className="text-[11px] text-muted-foreground font-medium">
            <th className="text-left py-2 px-3">{t('settings.trainingModels.parameter')}</th>
            <th className="text-left py-2 px-3">{t('settings.trainingModels.type')}</th>
            <th className="text-left py-2 px-3">{t('settings.trainingModels.defaultValue')}</th>
            <th className="text-left py-2 px-3">{t('settings.trainingModels.range')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--annotix-border)]">
          {params.map(p => (
            <tr key={p.key} className="hover:bg-[var(--annotix-light)] transition-colors">
              <td className="py-1.5 px-3 font-mono text-[12px] text-[var(--annotix-dark)]">{p.key}</td>
              <td className="py-1.5 px-3 text-[11px] text-muted-foreground">{formatType(p)}</td>
              <td className="py-1.5 px-3 font-mono text-[12px] text-[var(--annotix-dark)]">{formatDefault(p, defaults[p.key])}</td>
              <td className="py-1.5 px-3 text-[11px] text-muted-foreground">{formatRange(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
