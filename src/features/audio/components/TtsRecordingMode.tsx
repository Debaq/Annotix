import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Mic, BarChart3, ArrowLeft, Check } from 'lucide-react';
import { useTtsSentences } from '../hooks/useTtsSentences';
import { TtsSentenceSetup } from './TtsSentenceSetup';
import { TtsRecorder } from './TtsRecorder';
import { TtsProgress } from './TtsProgress';
import { Button } from '@/components/ui/button';

interface Props {
  projectId: string;
  onBack: () => void;
}

const STEPS = ['step1', 'step2', 'step3'] as const;
const STEP_ICONS = [FileText, Mic, BarChart3];

export function TtsRecordingMode({ projectId, onBack }: Props) {
  const { t } = useTranslation('audio');
  const [activeStep, setActiveStep] = useState(0);
  const [language, setLanguage] = useState('English');
  const { sentences, setSentences, loading, reload, stats } = useTtsSentences(projectId);

  const canGoToRecord = sentences.length > 0;
  const canGoToProgress = stats.recorded > 0;

  const goToStep = useCallback((step: number) => {
    if (step === 1 && !canGoToRecord) return;
    if (step === 2 && !canGoToProgress && stats.recorded === 0) return;
    setActiveStep(step);
  }, [canGoToRecord, canGoToProgress, stats.recorded]);

  return (
    <div className="flex flex-col h-full bg-[var(--annotix-light)]">
      {/* Header */}
      <div className="px-6 py-3 bg-[var(--annotix-white)] border-b border-[var(--annotix-border)]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft size={16} />
            {t('tts.backToAnnotation')}
          </Button>
          <div className="flex-1" />
          <h2 className="text-sm font-semibold text-[var(--annotix-dark)]">
            {t('tts.title')}
          </h2>
          <div className="flex-1" />
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mt-3">
          {STEPS.map((step, idx) => {
            const Icon = STEP_ICONS[idx];
            const isActive = activeStep === idx;
            const isDone = idx === 0 ? canGoToRecord
              : idx === 1 ? canGoToProgress
              : false;
            return (
              <button
                key={step}
                onClick={() => goToStep(idx)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--annotix-primary)] text-white shadow-sm'
                    : isDone
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-[var(--annotix-gray-light)] text-[var(--annotix-gray)] hover:bg-[var(--annotix-border)]'
                }`}
              >
                {isDone && !isActive ? <Check size={16} /> : <Icon size={16} />}
                {t(`tts.${step}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeStep === 0 && (
          <TtsSentenceSetup
            projectId={projectId}
            sentences={sentences}
            onSentencesChange={setSentences}
            loading={loading}
            onNext={() => goToStep(1)}
            language={language}
            onLanguageChange={setLanguage}
          />
        )}
        {activeStep === 1 && (
          <TtsRecorder
            projectId={projectId}
            sentences={sentences}
            onSentencesChange={async () => { await reload(); }}
            stats={stats}
          />
        )}
        {activeStep === 2 && (
          <TtsProgress
            projectId={projectId}
            sentences={sentences}
            stats={stats}
            language={language}
          />
        )}
      </div>
    </div>
  );
}
