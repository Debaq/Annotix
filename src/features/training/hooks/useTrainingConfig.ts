import { useState, useCallback } from 'react';
import type { TrainingConfig, AugmentationConfig, ScenarioPresetId } from '../types';
import { getDefaultConfig, getPresetById } from '../utils/presets';
import { projectTypeToTask } from '../utils/modelMapping';

export function useTrainingConfig(projectType: string) {
  const [config, setConfig] = useState<TrainingConfig>(() => {
    const defaults = getDefaultConfig();
    return {
      ...defaults,
      task: projectTypeToTask(projectType),
    };
  });

  const updateConfig = useCallback((partial: Partial<TrainingConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const updateAugmentation = useCallback((partial: Partial<AugmentationConfig>) => {
    setConfig((prev) => ({
      ...prev,
      augmentation: { ...prev.augmentation, ...partial },
    }));
  }, []);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = getPresetById(presetId as ScenarioPresetId);
      if (preset) {
        setConfig((prev) => ({
          ...prev,
          ...preset.config,
          augmentation: { ...preset.config.augmentation },
        }));
      }
    },
    []
  );

  return {
    config,
    updateConfig,
    updateAugmentation,
    applyPreset,
  };
}
