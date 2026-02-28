import { useTranslation } from 'react-i18next';

interface TrainingPresetsProps {
  selected: string | null;
  onSelect: (preset: string) => void;
}

const PRESETS = [
  {
    name: 'quick',
    icon: 'fas fa-bolt',
    color: 'border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10',
    selectedColor: 'border-yellow-500 bg-yellow-500/20',
  },
  {
    name: 'balanced',
    icon: 'fas fa-balance-scale',
    color: 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10',
    selectedColor: 'border-blue-500 bg-blue-500/20',
  },
  {
    name: 'full',
    icon: 'fas fa-trophy',
    color: 'border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10',
    selectedColor: 'border-purple-500 bg-purple-500/20',
  },
];

export function TrainingPresets({ selected, onSelect }: TrainingPresetsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-3 gap-3">
      {PRESETS.map((preset) => {
        const isSelected = selected === preset.name;
        return (
          <button
            key={preset.name}
            onClick={() => onSelect(preset.name)}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              isSelected ? preset.selectedColor : preset.color
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <i className={preset.icon} />
              <span className="font-medium text-sm">
                {t(`training.presets.${preset.name}`)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(`training.presets.${preset.name}Desc`)}
            </p>
          </button>
        );
      })}
    </div>
  );
}
