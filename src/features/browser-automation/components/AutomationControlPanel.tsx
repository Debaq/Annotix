import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutomationProgress } from '../hooks/useAutomationProgress';
import { automationService } from '../services/automationService';
import { AutomationStepIndicator } from './AutomationStepIndicator';
import { AutomationLogViewer } from './AutomationLogViewer';
import { AutomationUserPrompt } from './AutomationUserPrompt';
import type { SessionState } from '../types';

interface Props {
  sessionId: string;
  onClose: () => void;
}

export function AutomationControlPanel({ sessionId, onClose }: Props) {
  const { t } = useTranslation();
  const { session, logs, result, error } = useAutomationProgress(sessionId);
  const [minimized, setMinimized] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  if (!session) return null;

  const isPaused = session.state === 'paused';
  const isRunning = session.state === 'running' || session.state === 'waiting_login';
  const isFinished = session.state === 'completed' || session.state === 'failed' || session.state === 'cancelled';

  const stateColor = (state: SessionState) => {
    switch (state) {
      case 'running': return 'bg-blue-500';
      case 'paused': return 'bg-yellow-500';
      case 'waiting_login': return 'bg-amber-500';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'cancelled': return 'bg-zinc-500';
      default: return 'bg-zinc-400';
    }
  };

  const providerLabel = () => {
    const key = `automation.providers.${session.provider}`;
    return t(key, { defaultValue: session.provider });
  };

  const handlePauseResume = async () => {
    if (isPaused) {
      await automationService.resumeAutomation(sessionId);
    } else {
      await automationService.pauseAutomation(sessionId);
    }
  };

  const handleCancel = async () => {
    await automationService.cancelAutomation(sessionId);
  };

  // Current step waiting for user
  const waitingStep = session.steps.find((s) => s.state === 'waiting_user');

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-xl p-3 w-72 cursor-pointer"
        onClick={() => setMinimized(false)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${stateColor(session.state)} ${isRunning ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-medium">{providerLabel()}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {session.currentStepIndex + 1}/{session.steps.length}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-background border rounded-xl shadow-2xl w-96 max-h-[500px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${stateColor(session.state)} ${isRunning ? 'animate-pulse' : ''}`} />
          <span className="text-sm font-semibold">{t('automation.controlPanel.title')}</span>
          <span className="text-xs text-muted-foreground">— {providerLabel()}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            title={t('automation.controlPanel.minimize')}
          >
            <i className="fas fa-minus text-xs" />
          </button>
          {isFinished && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title={t('automation.controlPanel.close')}
            >
              <i className="fas fa-times text-xs" />
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="px-4 py-1.5 text-xs text-muted-foreground border-b">
        {t(`automation.status.${session.state}`, { defaultValue: session.state })}
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5 max-h-[200px]">
        {session.steps.map((step, idx) => (
          <AutomationStepIndicator
            key={step.id}
            step={step}
            index={idx}
            total={session.steps.length}
            isCurrent={idx === session.currentStepIndex}
          />
        ))}
      </div>

      {/* User prompt */}
      {waitingStep?.userInstruction && (
        <AutomationUserPrompt instruction={waitingStep.userInstruction} />
      )}

      {/* Error */}
      {error && (
        <div className="mx-2 my-1 p-2.5 rounded-lg bg-red-500/15 border border-red-500/30">
          <div className="flex items-center gap-2">
            <i className="fas fa-exclamation-circle text-red-500 text-sm" />
            <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mx-2 my-1 p-2.5 rounded-lg bg-green-500/15 border border-green-500/30">
          <div className="flex items-center gap-2">
            <i className="fas fa-check-circle text-green-500 text-sm" />
            <span className="text-xs text-green-600 dark:text-green-400">
              {result.type === 'model_downloaded'
                ? t('automation.result.modelDownloaded', { path: result.path })
                : t('automation.result.llmResponse')}
            </span>
          </div>
          {result.type === 'llm_response' && (
            <p className="mt-1 text-xs text-foreground max-h-20 overflow-y-auto whitespace-pre-wrap">
              {result.text}
            </p>
          )}
        </div>
      )}

      {/* Logs toggle */}
      <div className="px-2 py-1">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <i className={`fas fa-chevron-${showLogs ? 'down' : 'right'} text-[8px]`} />
          {t('automation.controlPanel.logs')}
        </button>
      </div>
      {showLogs && <AutomationLogViewer logs={logs} />}

      {/* Controls */}
      {!isFinished && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t">
          <button
            onClick={handlePauseResume}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              isPaused
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            <i className={`fas fa-${isPaused ? 'play' : 'pause'}`} />
            {isPaused ? t('automation.resume') : t('automation.pause')}
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <i className="fas fa-stop" />
            {t('automation.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
