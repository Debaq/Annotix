import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TrainingPresets } from './TrainingPresets';
import { TrainingModelSelector } from './TrainingModelSelector';
import { TrainingAdvancedConfig } from './TrainingAdvancedConfig';
import { TrainingAugmentation } from './TrainingAugmentation';
import { GpuIndicator } from './GpuIndicator';
import type { TrainingConfig, GpuInfo } from '../types';

interface TrainingSetupProps {
  projectType: string;
  config: TrainingConfig;
  gpuInfo: GpuInfo | null;
  gpuLoading: boolean;
  onConfigChange: (partial: Partial<TrainingConfig>) => void;
  onAugmentationChange: (partial: Partial<TrainingConfig['augmentation']>) => void;
  onPresetSelect: (preset: string) => void;
  onStart: () => void;
}

export function TrainingSetup({
  projectType,
  config,
  gpuInfo,
  gpuLoading,
  onConfigChange,
  onAugmentationChange,
  onPresetSelect,
  onStart,
}: TrainingSetupProps) {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = useState<string | null>('balanced');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handlePresetSelect = (preset: string) => {
    setSelectedPreset(preset);
    onPresetSelect(preset);
  };

  return (
    <div className="space-y-6">
      {/* GPU Info */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('training.config.title')}</h3>
        <GpuIndicator gpuInfo={gpuInfo} loading={gpuLoading} />
      </div>

      {/* Presets */}
      <div>
        <label className="text-sm font-medium mb-2 block">{t('training.presets.title')}</label>
        <TrainingPresets selected={selectedPreset} onSelect={handlePresetSelect} />
      </div>

      <Separator />

      {/* Model */}
      <TrainingModelSelector
        projectType={projectType}
        selectedVersion={config.yoloVersion}
        selectedSize={config.modelSize}
        onVersionChange={(v) => onConfigChange({ yoloVersion: v })}
        onSizeChange={(s) => onConfigChange({ modelSize: s })}
      />

      <Separator />

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <i className={`fas fa-chevron-${showAdvanced ? 'down' : 'right'} text-xs`} />
        {t('training.config.advanced')}
      </button>

      {showAdvanced && (
        <>
          <TrainingAdvancedConfig config={config} onChange={onConfigChange} />
          <Separator />
          <TrainingAugmentation augmentation={config.augmentation} onChange={onAugmentationChange} />
        </>
      )}

      {/* Start button */}
      <Button onClick={onStart} className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg">
        <i className="fas fa-play mr-2" />
        {t('training.start')}
      </Button>
    </div>
  );
}
