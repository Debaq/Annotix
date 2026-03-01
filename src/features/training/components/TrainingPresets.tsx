import { useTranslation } from 'react-i18next';
import { SCENARIO_PRESETS } from '../utils/presets';
import type { ScenarioPresetId } from '../types';

interface TrainingPresetsProps {
  selected: ScenarioPresetId | null;
  onSelect: (presetId: ScenarioPresetId) => void;
  currentModelSize?: string;
}

export function TrainingPresets({ selected, onSelect, currentModelSize }: TrainingPresetsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3">
      {SCENARIO_PRESETS.map((preset) => {
        const isSelected = selected === preset.id;
        const cfg = preset.config;
        return (
          <button
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            className={`p-3 rounded-lg border-2 transition-all text-left ${
              isSelected ? preset.selectedColor : preset.color
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <i className={`${preset.icon} text-sm`} />
              <span className="font-medium text-sm">
                {t(`training.presets.${preset.id}`)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">
              {t(`training.presets.${preset.id}Desc`)}
            </p>
            <div className="flex flex-wrap gap-1">
              <Tag label={`${cfg.imgsz}px`} />
              <Tag label={`${cfg.epochs}ep`} />
              <Tag label={`box:${cfg.box}`} />
              {cfg.freeze !== null && <Tag label={`freeze:${cfg.freeze}`} />}
            </div>
            {currentModelSize !== preset.suggestedModelSize && (
              <div className="mt-1.5 text-[10px] text-muted-foreground">
                {t('training.presets.suggested')}: {preset.suggestedModelSize.toUpperCase()}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted/60 text-muted-foreground">
      {label}
    </span>
  );
}
