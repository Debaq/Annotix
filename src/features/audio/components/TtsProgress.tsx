import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle, Clock, SkipForward, Timer, BarChart3, Download, AlertCircle, Info,
} from 'lucide-react';
import { TtsSentence } from '@/lib/db';
import { analyzePhoneticCoverage, type PhoneticAnalysis } from '@/lib/tauriDb';
import { Button } from '@/components/ui/button';

interface Props {
  projectId: string;
  sentences: TtsSentence[];
  stats: { total: number; recorded: number; pending: number; skipped: number };
  language?: string;
}

export function TtsProgress({ projectId, sentences, stats, language = 'English' }: Props) {
  const { t } = useTranslation('audio');
  const [exporting, setExporting] = useState(false);

  // Duración estimada (~5s por grabación)
  const estimatedDurationMin = useMemo(() => {
    return Math.round((stats.recorded * 5) / 60);
  }, [stats.recorded]);

  // ── Análisis fonético via espeak-ng ────────────────────────────────────
  const [coverage, setCoverage] = useState<PhoneticAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const recordedTexts = useMemo(() =>
    sentences.filter(s => s.status === 'recorded').map(s => s.text),
    [sentences]
  );

  useEffect(() => {
    if (recordedTexts.length === 0) {
      setCoverage(null);
      return;
    }

    let cancelled = false;
    setAnalyzing(true);

    analyzePhoneticCoverage(recordedTexts, language).then(result => {
      if (!cancelled) setCoverage(result);
    }).catch(err => {
      console.error('Phonetic analysis failed:', err);
      if (!cancelled) setCoverage(null);
    }).finally(() => {
      if (!cancelled) setAnalyzing(false);
    });

    return () => { cancelled = true; };
  }, [recordedTexts, language]);

  const coveragePercent = coverage && coverage.inventory.length > 0
    ? Math.round((coverage.foundPhonemes.length / coverage.inventory.length) * 100)
    : 0;

  // ── Export LJSpeech ────────────────────────────────────────────────────
  const handleExportLjspeech = useCallback(async () => {
    const path = await save({
      defaultPath: 'tts_dataset.zip',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (!path) return;

    setExporting(true);
    try {
      await invoke('export_ljspeech', { projectId, outputPath: path });
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [projectId]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<CheckCircle size={20} className="text-green-500" />}
          label={t('tts.totalRecorded')}
          value={stats.recorded}
        />
        <StatCard
          icon={<Clock size={20} className="text-blue-500" />}
          label={t('tts.totalPending')}
          value={stats.pending}
        />
        <StatCard
          icon={<SkipForward size={20} className="text-amber-500" />}
          label={t('tts.totalSkipped')}
          value={stats.skipped}
        />
        <StatCard
          icon={<Timer size={20} className="text-purple-500" />}
          label={t('tts.totalDuration')}
          value={`~${estimatedDurationMin} min`}
        />
      </div>

      {/* Progress bar */}
      <div className="bg-[var(--annotix-white)] rounded-lg border border-[var(--annotix-border)] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[var(--annotix-dark)]">
            {t('tts.sentenceCount', { done: stats.recorded, total: stats.total })}
          </span>
          <span className="text-sm text-[var(--annotix-gray)]">
            {stats.total > 0 ? Math.round((stats.recorded / stats.total) * 100) : 0}%
          </span>
        </div>
        <div className="h-3 bg-[var(--annotix-gray-light)] rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500 transition-all"
            style={{ width: `${stats.total > 0 ? (stats.recorded / stats.total) * 100 : 0}%` }} />
          <div className="h-full bg-amber-400 transition-all"
            style={{ width: `${stats.total > 0 ? (stats.skipped / stats.total) * 100 : 0}%` }} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-[var(--annotix-gray)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full" /> {t('tts.totalRecorded')}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full" /> {t('tts.totalSkipped')}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-300 rounded-full" /> {t('tts.totalPending')}</span>
        </div>
      </div>

      {/* Phonetic coverage */}
      <div className="bg-[var(--annotix-white)] rounded-lg border border-[var(--annotix-border)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={18} className="text-[var(--annotix-primary)]" />
          <h3 className="text-sm font-semibold text-[var(--annotix-dark)]">
            {t('tts.phoneticCoverage')}
          </h3>
          {analyzing && (
            <span className="text-[10px] text-[var(--annotix-gray)] animate-pulse">analyzing...</span>
          )}
        </div>

        {coverage === null && !analyzing && recordedTexts.length === 0 && (
          <p className="text-xs text-[var(--annotix-gray)]">
            {t('tts.noSentencesHint')}
          </p>
        )}

        {coverage !== null && !coverage.available && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">espeak-ng not installed</p>
              <p className="mt-0.5 opacity-80">
                Install espeak-ng for accurate phonetic analysis.
                Linux: <code className="bg-amber-100 px-1 rounded">sudo apt install espeak-ng</code>
              </p>
            </div>
          </div>
        )}

        {coverage !== null && coverage.available && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-3 bg-[var(--annotix-gray-light)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--annotix-primary)] rounded-full transition-all"
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums text-[var(--annotix-dark)]">
                {coveragePercent}%
              </span>
            </div>

            <p className="text-xs text-[var(--annotix-gray)]">
              {t('tts.phonemesCovered', { covered: coverage.foundPhonemes.length, total: coverage.inventory.length })}
            </p>

            {/* Fonemas encontrados */}
            {coverage.foundPhonemes.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-[var(--annotix-dark)] mb-1">
                  {t('tts.phonemesCovered', { covered: coverage.foundPhonemes.length, total: coverage.inventory.length })}:
                </p>
                <div className="flex flex-wrap gap-1">
                  {coverage.foundPhonemes.map((ph) => (
                    <span key={ph} className="px-1.5 py-0.5 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded font-mono">
                      {ph}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Fonemas faltantes */}
            {coverage.missing.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-[var(--annotix-dark)] mb-1">{t('tts.missingPhonemes')}:</p>
                <div className="flex flex-wrap gap-1">
                  {coverage.missing.map((ph) => (
                    <span key={ph} className="px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 border border-red-200 rounded font-mono">
                      {ph}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recommendations */}
      <div className="bg-[var(--annotix-white)] rounded-lg border border-[var(--annotix-border)] p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle size={18} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-[var(--annotix-dark)]">
            {t('tts.datasetRecommendation')}
          </h3>
        </div>

        <Recommendation
          label="Piper"
          minutes={estimatedDurationMin}
          target={60}
          text={t('tts.recommendationPiper', { minutes: estimatedDurationMin })}
        />
        <Recommendation
          label="Coqui TTS"
          minutes={estimatedDurationMin}
          target={180}
          text={t('tts.recommendationCoqui')}
        />
        <Recommendation
          label="VITS"
          minutes={estimatedDurationMin}
          target={300}
          text={t('tts.recommendationVits', { minutes: estimatedDurationMin })}
        />
      </div>

      {/* Export */}
      <div className="bg-[var(--annotix-white)] rounded-lg border border-[var(--annotix-border)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Download size={18} className="text-[var(--annotix-primary)]" />
              <h3 className="text-sm font-semibold text-[var(--annotix-dark)]">
                {t('tts.exportLjspeech')}
              </h3>
            </div>
            <p className="text-xs text-[var(--annotix-gray)] mt-1">{t('tts.exportLjspeechDesc')}</p>
          </div>
          <Button
            onClick={handleExportLjspeech}
            disabled={exporting || stats.recorded === 0}
            className="annotix-btn annotix-btn-primary gap-2"
          >
            <Download size={16} />
            {exporting ? t('tts.exporting') : t('tts.exportLjspeech')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-[var(--annotix-white)] rounded-lg border border-[var(--annotix-border)] p-4">
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className="text-2xl font-bold text-[var(--annotix-dark)]">{value}</p>
      <p className="text-xs text-[var(--annotix-gray)]">{label}</p>
    </div>
  );
}

function Recommendation({ label, minutes, target, text }: {
  label: string;
  minutes: number;
  target: number;
  text: string;
}) {
  const pct = Math.min(100, Math.round((minutes / target) * 100));
  const isSufficient = minutes >= target;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--annotix-dark)]">{label}</span>
        <span className={`text-xs font-medium ${isSufficient ? 'text-green-600' : 'text-amber-600'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-[var(--annotix-gray-light)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isSufficient ? 'bg-green-500' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-[var(--annotix-gray)]">{text}</p>
    </div>
  );
}
