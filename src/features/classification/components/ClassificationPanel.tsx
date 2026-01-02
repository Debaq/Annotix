import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, X } from 'lucide-react';
import { useClassification } from '../hooks/useClassification';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useCurrentImage } from '../../gallery/hooks/useCurrentImage';
import { LabelSelector } from './LabelSelector';

export function ClassificationPanel() {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { image } = useCurrentImage();
  const {
    selectedLabels,
    toggleLabel,
    clearLabels,
    saveClassification,
    isMultiLabel,
  } = useClassification();

  if (!project || !image) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t('classification.noImageSelected')}
      </div>
    );
  }

  const selectedClasses = project.classes.filter((cls) =>
    selectedLabels.includes(cls.id)
  );

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isMultiLabel
              ? t('classification.multiLabel')
              : t('classification.singleLabel')}
          </h3>
          <Badge variant="outline">
            {selectedLabels.length} {t('classification.selected')}
          </Badge>
        </div>

        {/* Selected Labels Display */}
        {selectedLabels.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
            {selectedClasses.map((cls) => (
              <Badge
                key={cls.id}
                variant="secondary"
                className="flex items-center gap-1"
              >
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: cls.color }}
                />
                {cls.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Label Selector */}
        <LabelSelector
          classes={project.classes}
          selectedLabels={selectedLabels}
          onToggle={toggleLabel}
          multiLabel={isMultiLabel}
        />

        {/* Instructions */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
          <p className="text-blue-900 dark:text-blue-100">
            {isMultiLabel
              ? t('classification.multiLabelInstructions')
              : t('classification.singleLabelInstructions')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={saveClassification}
            className="flex-1"
            disabled={selectedLabels.length === 0}
          >
            <Save className="w-4 h-4 mr-2" />
            {t('common.save')}
          </Button>
          <Button
            onClick={clearLabels}
            variant="outline"
            disabled={selectedLabels.length === 0}
          >
            <X className="w-4 h-4 mr-2" />
            {t('common.clear')}
          </Button>
        </div>

        {/* Keyboard Shortcuts Info */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">{t('common.oneToNine')}</kbd>{' '}
            {t('shortcuts.selectClass')}
          </p>
          <p>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">{t('common.ctrlS')}</kbd>{' '}
            {t('shortcuts.save')}
          </p>
          <p>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">{t('common.arrowKeys')}</kbd>{' '}
            {t('shortcuts.navigateImages')}
          </p>
        </div>
      </div>
    </Card>
  );
}
