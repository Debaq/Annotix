import { useState, useCallback } from 'react';
import type { TrainingConfig, AugmentationConfig } from '../types';
import { getDefaultConfig, AUGMENTATION_LEVELS } from '../utils/presets';
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
    (presetName: string) => {
      const aug = AUGMENTATION_LEVELS[presetName === 'quick' ? 'light' : presetName === 'full' ? 'heavy' : 'medium'];
      const presetValues: Record<string, Partial<TrainingConfig>> = {
        quick: { epochs: 50, batchSize: 16, patience: 10, augmentation: aug },
        balanced: { epochs: 100, batchSize: 16, patience: 25, augmentation: aug },
        full: { epochs: 300, batchSize: -1, patience: 50, augmentation: aug },
      };
      const values = presetValues[presetName];
      if (values) {
        setConfig((prev) => ({ ...prev, ...values }));
      }
    },
    []
  );

  const setAugmentationLevel = useCallback((level: string) => {
    const aug = AUGMENTATION_LEVELS[level];
    if (aug) {
      setConfig((prev) => ({ ...prev, augmentation: { ...aug } }));
    }
  }, []);

  return {
    config,
    updateConfig,
    updateAugmentation,
    applyPreset,
    setAugmentationLevel,
  };
}
