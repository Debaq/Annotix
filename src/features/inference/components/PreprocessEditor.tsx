import { useTranslation } from 'react-i18next';
import type { PreprocessConfig } from '../types';
import { DEFAULT_PREPROCESS } from '../types';

interface Props {
  value: PreprocessConfig;
  modelFormat: string;
  onChange: (next: PreprocessConfig | null) => void;
}

export function PreprocessEditor({ value, modelFormat, onChange }: Props) {
  const { t } = useTranslation();
  const v = value ?? DEFAULT_PREPROCESS;
  const active = v.clahe || v.fundusCrop;

  const patch = (p: Partial<PreprocessConfig>) => onChange({ ...v, ...p });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="annotix-label">{t('inference.preprocess.title', 'Preprocesamiento')}</label>
        {active && (
          <button
            onClick={() => onChange(null)}
            className="text-xs"
            style={{ color: '#ef4444' }}
          >
            {t('inference.preprocess.reset', 'Reset')}
          </button>
        )}
      </div>

      {modelFormat === 'onnx' && active && (
        <div
          className="text-xs p-2 rounded"
          style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}
        >
          <i className="fas fa-exclamation-triangle mr-1" />
          {t(
            'inference.preprocess.onnxWarn',
            'Modelos ONNX aún no soportan preprocesamiento nativo. Se ignorará.',
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={v.fundusCrop}
          onChange={(e) => patch({ fundusCrop: e.target.checked })}
        />
        <span>{t('inference.preprocess.fundusCrop', 'Recorte de fondo de ojo (círculo)')}</span>
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={v.clahe}
          onChange={(e) => patch({ clahe: e.target.checked })}
        />
        <span>{t('inference.preprocess.clahe', 'CLAHE')}</span>
      </label>

      {v.clahe && (
        <div className="pl-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--annotix-gray)' }}>
              {t('inference.preprocess.channel', 'Canal')}
            </span>
            <select
              value={v.channel}
              onChange={(e) => patch({ channel: e.target.value })}
              className="annotix-select"
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              <option value="l_lab">L (LAB)</option>
              <option value="all_bgr">BGR (todos)</option>
              <option value="gray">Gris</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs" style={{ color: 'var(--annotix-gray)' }}>
              clipLimit
            </span>
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={v.clipLimit}
              onChange={(e) => patch({ clipLimit: Number(e.target.value) || 2.0 })}
              className="annotix-input"
              style={{ fontSize: '0.75rem', padding: '4px 8px', width: 80 }}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs" style={{ color: 'var(--annotix-gray)' }}>
              tileGrid
            </span>
            <input
              type="number"
              min={1}
              max={32}
              step={1}
              value={v.tileGrid}
              onChange={(e) => patch({ tileGrid: Number(e.target.value) || 8 })}
              className="annotix-input"
              style={{ fontSize: '0.75rem', padding: '4px 8px', width: 80 }}
            />
          </div>
        </div>
      )}

      <div className="text-xs opacity-60">
        {t(
          'inference.preprocess.hint',
          'Debe coincidir con el preproc usado al entrenar. Si no, degrada.',
        )}
      </div>
    </div>
  );
}
