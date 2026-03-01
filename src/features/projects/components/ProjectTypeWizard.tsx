import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectType } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  computeRecommendations,
  getVisibleQuestions,
  PROJECT_TYPE_META,
  WIZARD_CONFIG,
  type Recommendation,
  type WizardOption,
} from '../data/wizardConfig';

interface ProjectTypeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectType: (type: ProjectType) => void;
}

export function ProjectTypeWizard({ open, onOpenChange, onSelectType }: ProjectTypeWizardProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(answers, WIZARD_CONFIG),
    [answers],
  );

  // Find the first unanswered visible question
  const currentQuestion = useMemo(
    () => visibleQuestions.find((q) => !(q.id in answers)),
    [visibleQuestions, answers],
  );

  // Compute results when all questions are answered
  const recommendations = useMemo<Recommendation[]>(() => {
    if (currentQuestion) return [];
    return computeRecommendations(answers);
  }, [answers, currentQuestion]);

  const showResults = !currentQuestion && Object.keys(answers).length > 0;

  // Current step index for progress display
  const answeredCount = visibleQuestions.filter((q) => q.id in answers).length;
  const totalSteps = showResults ? answeredCount + 1 : visibleQuestions.length;

  const handleSelectOption = useCallback((questionId: string, optionId: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: optionId };
      // Clear answers to questions that are no longer visible
      const stillVisible = getVisibleQuestions(next, WIZARD_CONFIG);
      const visibleIds = new Set(stillVisible.map((q) => q.id));
      for (const key of Object.keys(next)) {
        if (!visibleIds.has(key)) delete next[key];
      }
      return next;
    });
  }, []);

  const handleBack = useCallback(() => {
    if (showResults || answeredCount > 0) {
      // Find the last answered visible question and remove it
      const answered = visibleQuestions.filter((q) => q.id in answers);
      const last = answered[answered.length - 1];
      if (last) {
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[last.id];
          // Also clear anything that depended on this answer
          const stillVisible = getVisibleQuestions(next, WIZARD_CONFIG);
          const visibleIds = new Set(stillVisible.map((q) => q.id));
          for (const key of Object.keys(next)) {
            if (!visibleIds.has(key)) delete next[key];
          }
          return next;
        });
      }
    }
  }, [answers, visibleQuestions, answeredCount, showResults]);

  const handleSelectType = useCallback((type: ProjectType) => {
    onSelectType(type);
    onOpenChange(false);
    setAnswers({});
  }, [onSelectType, onOpenChange]);

  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) setAnswers({});
    onOpenChange(isOpen);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <i className="fas fa-wand-magic-sparkles mr-2"></i>
            {t('wizard.title')}
          </DialogTitle>
          <DialogDescription>{t('wizard.subtitle')}</DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < answeredCount
                  ? 'w-6 bg-primary'
                  : i === answeredCount
                    ? 'w-6 bg-primary/60'
                    : 'w-1.5 bg-muted-foreground/20'
              }`}
            />
          ))}
        </div>

        <div className="py-2">
          {/* Question view */}
          {currentQuestion && (
            <QuestionStep
              questionId={currentQuestion.id}
              options={currentQuestion.options}
              onSelect={(optId) => handleSelectOption(currentQuestion.id, optId)}
            />
          )}

          {/* Results view */}
          {showResults && (
            <ResultsStep
              recommendations={recommendations}
              onSelect={handleSelectType}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={answeredCount > 0 ? handleBack : () => handleClose(false)}
          >
            <i className={`fas ${answeredCount > 0 ? 'fa-arrow-left' : 'fa-xmark'} mr-2`}></i>
            {answeredCount > 0 ? t('common.back') : t('common.cancel')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {answeredCount} / {totalSteps}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Question Step
// ============================================================================

function QuestionStep({
  questionId,
  options,
  onSelect,
}: {
  questionId: string;
  options: WizardOption[];
  onSelect: (optionId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">
        {t(`wizard.questions.${questionId}.title`)}
      </h3>
      <div className="grid gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${opt.colorClass}`}>
              <i className={`fas ${opt.icon} text-sm`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {t(`wizard.questions.${questionId}.options.${opt.id}`)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`wizard.questions.${questionId}.optionsDesc.${opt.id}`)}
              </p>
            </div>
            <i className="fas fa-chevron-right text-xs text-muted-foreground/50"></i>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Results Step
// ============================================================================

function ResultsStep({
  recommendations,
  onSelect,
}: {
  recommendations: Recommendation[];
  onSelect: (type: ProjectType) => void;
}) {
  const { t } = useTranslation();

  if (recommendations.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <i className="fas fa-circle-question text-2xl mb-2"></i>
        <p className="text-sm">{t('wizard.noResults')}</p>
      </div>
    );
  }

  const topScore = recommendations[0].score;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{t('wizard.resultsTitle')}</h3>
      <div className="grid gap-2">
        {recommendations.map((rec, i) => {
          const meta = PROJECT_TYPE_META[rec.type];
          const isBest = rec.score === topScore;

          return (
            <button
              key={rec.type}
              type="button"
              onClick={() => onSelect(rec.type)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isBest ? 'border-primary/40 bg-primary/5' : ''
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.colorClass}`}>
                <i className={`fas ${meta.icon} text-sm`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">
                    {t(`project.types.${rec.type}.name`)}
                  </p>
                  {i === 0 && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <i className="fas fa-star text-[8px] mr-1"></i>
                      {t('wizard.bestMatch')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`wizard.reasons.${rec.type}`)}
                </p>
              </div>
              <Button size="sm" variant={isBest ? 'default' : 'outline'}>
                {t('wizard.useThis')}
              </Button>
            </button>
          );
        })}
      </div>
    </div>
  );
}
