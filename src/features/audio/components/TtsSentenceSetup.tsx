import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import {
  FileUp, Copy, Trash2, Plus, ChevronRight, ClipboardPaste,
} from 'lucide-react';
import { TtsSentence } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  projectId: string;
  sentences: TtsSentence[];
  onSentencesChange: (sentences: TtsSentence[]) => Promise<void>;
  loading: boolean;
  onNext: () => void;
  language: string;
  onLanguageChange: (lang: string) => void;
}

type Tab = 'file' | 'prompt';

const LANGUAGES = [
  { code: 'English', label: 'English' },
  { code: 'Spanish', label: 'Español' },
  { code: 'French', label: 'Français' },
  { code: 'German', label: 'Deutsch' },
  { code: 'Italian', label: 'Italiano' },
  { code: 'Portuguese', label: 'Português' },
  { code: 'Russian', label: 'Русский' },
  { code: 'Japanese', label: '日本語' },
  { code: 'Korean', label: '한국어' },
  { code: 'Chinese (Mandarin)', label: '中文' },
  { code: 'Arabic', label: 'العربية' },
  { code: 'Hindi', label: 'हिन्दी' },
  { code: 'Turkish', label: 'Türkçe' },
  { code: 'Dutch', label: 'Nederlands' },
  { code: 'Polish', label: 'Polski' },
  { code: 'Swedish', label: 'Svenska' },
  { code: 'Czech', label: 'Čeština' },
  { code: 'Greek', label: 'Ελληνικά' },
  { code: 'Romanian', label: 'Română' },
  { code: 'Catalan', label: 'Català' },
];
const DOMAINS = ['general', 'medical', 'tech', 'news', 'conversational', 'literature'];
const LENGTHS = ['short', 'medium', 'long'];

export function TtsSentenceSetup({ projectId, sentences, onSentencesChange, loading, onNext, language, onLanguageChange }: Props) {
  const { t } = useTranslation('audio');
  const [activeTab, setActiveTab] = useState<Tab>('file');
  const [count, setCount] = useState(100);
  const [domain, setDomain] = useState('general');
  const [length, setLength] = useState('medium');

  // Paste area
  const [pasteText, setPasteText] = useState('');

  const addSentences = useCallback(async (texts: string[]) => {
    const newSentences = texts
      .map(text => text.trim())
      .filter(text => text.length > 0)
      .map(text => ({
        id: crypto.randomUUID(),
        text,
        status: 'pending' as const,
      }));
    await onSentencesChange([...sentences, ...newSentences]);
  }, [sentences, onSentencesChange]);

  // ── File upload ────────────────────────────────────────────────────────
  const handleLoadFile = useCallback(async () => {
    const result = await open({
      multiple: false,
      filters: [{ name: 'Text', extensions: ['txt', 'csv'] }],
    });
    if (!result) return;
    const path = Array.isArray(result) ? result[0] : result;
    const content = await readTextFile(path);
    const lines = content.split('\n');
    await addSentences(lines);
  }, [addSentences]);

  // ── Prompt copy ───────────────────────────────────────────────────────
  const handleCopyPrompt = useCallback(() => {
    const lengthDesc = length === 'short' ? '5-10 words' : length === 'long' ? '20-30 words' : '10-20 words';

    const prompt = `IMPORTANT: ALL sentences MUST be written in ${language}. Do NOT write them in English (unless "${language}" IS English).

Generate exactly ${count} phonetically balanced sentences in the "${language}" language for a TTS (Text-to-Speech) dataset.

The target language is: ${language}
Every single sentence you output must be in ${language}. This is critical.

Requirements:
- Domain: ${domain}
- Sentence length: approximately ${lengthDesc} per sentence
- Cover diverse phonemes and phoneme combinations specific to ${language}
- Use natural, conversational phrasing typical of native ${language} speakers
- Avoid tongue twisters, unusual words, or overly complex constructions
- Include questions, exclamations, and statements for variety
- Ensure good distribution of sentence beginnings (don't always start the same way)

Output format:
- One sentence per line
- No numbering, bullets, or extra formatting
- Only the sentences, nothing else
- Remember: EVERY sentence must be in ${language}`;

    navigator.clipboard.writeText(prompt);
  }, [count, language, domain, length]);

  // ── Paste import ──────────────────────────────────────────────────────
  const handlePasteImport = useCallback(async () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.split('\n');
    await addSentences(lines);
    setPasteText('');
  }, [pasteText, addSentences]);

  // ── Clear all ─────────────────────────────────────────────────────────
  const handleClear = useCallback(async () => {
    await onSentencesChange([]);
  }, [onSentencesChange]);

  // ── Delete single ─────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    await onSentencesChange(sentences.filter(s => s.id !== id));
  }, [sentences, onSentencesChange]);

  // ── Add manual ────────────────────────────────────────────────────────
  const handleAddManual = useCallback(async () => {
    await addSentences(['']);
  }, [addSentences]);

  // ── Edit sentence text ────────────────────────────────────────────────
  const handleEditText = useCallback(async (id: string, text: string) => {
    await onSentencesChange(sentences.map(s => s.id === id ? { ...s, text } : s));
  }, [sentences, onSentencesChange]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Tab buttons */}
      <div className="flex gap-2">
        <TabButton active={activeTab === 'file'} onClick={() => setActiveTab('file')}
          icon={<FileUp size={16} />} label={t('tts.loadFile')} desc={t('tts.loadFileDesc')} />
        <TabButton active={activeTab === 'prompt'} onClick={() => setActiveTab('prompt')}
          icon={<Copy size={16} />} label={t('tts.generatePrompt')} desc={t('tts.generatePromptDesc')} />
      </div>

      {/* Tab content */}
      <div className="bg-[var(--annotix-white)] rounded-lg border border-[var(--annotix-border)] p-4">
        {activeTab === 'file' && (
          <div className="space-y-4">
            <Button onClick={handleLoadFile} className="annotix-btn annotix-btn-primary gap-2">
              <FileUp size={16} />
              {t('tts.loadFile')}
            </Button>
            <p className="text-xs text-[var(--annotix-gray)]">{t('tts.loadFileDesc')}</p>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div className="space-y-4">
            {/* Params for prompt */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--annotix-dark)] mb-1 block">{t('tts.language')}</label>
                <Select value={language} onValueChange={onLanguageChange}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--annotix-dark)] mb-1 block">{t('tts.sentenceCountLabel')}</label>
                <input
                  type="number"
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value) || 50)}
                  className="w-full px-2 py-1.5 text-sm rounded border border-[var(--annotix-border)] bg-[var(--annotix-white)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--annotix-dark)] mb-1 block">{t('tts.domain')}</label>
                <Select value={domain} onValueChange={setDomain}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOMAINS.map(d => (
                      <SelectItem key={d} value={d}>
                        {t(`tts.domain${d.charAt(0).toUpperCase() + d.slice(1)}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--annotix-dark)] mb-1 block">{t('tts.sentenceLength')}</label>
                <Select value={length} onValueChange={setLength}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LENGTHS.map(l => (
                      <SelectItem key={l} value={l}>
                        {t(`tts.length${l.charAt(0).toUpperCase() + l.slice(1)}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleCopyPrompt} className="gap-2" variant="outline">
              <Copy size={16} />
              {t('tts.generatePrompt')}
            </Button>

            <div className="border-t border-[var(--annotix-border)] pt-4">
              <label className="text-xs font-medium text-[var(--annotix-dark)] mb-1 block">
                <ClipboardPaste size={14} className="inline mr-1" />
                {t('tts.pasteResult')}
              </label>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={t('tts.pasteHere')}
                rows={6}
                className="w-full px-3 py-2 text-sm rounded border border-[var(--annotix-border)] bg-[var(--annotix-white)] resize-y"
              />
              <Button size="sm" onClick={handlePasteImport} disabled={!pasteText.trim()} className="mt-2 gap-1">
                <Plus size={14} />
                {t('tts.importSentences')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sentence list */}
      <div className="bg-[var(--annotix-white)] rounded-lg border border-[var(--annotix-border)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--annotix-border)]">
          <h3 className="text-sm font-semibold text-[var(--annotix-dark)]">
            {t('tts.sentences')} ({sentences.length})
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleAddManual} className="gap-1">
              <Plus size={14} />
              {t('tts.addManually')}
            </Button>
            {sentences.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleClear}
                className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 size={14} />
                {t('tts.clearSentences')}
              </Button>
            )}
          </div>
        </div>

        {sentences.length === 0 ? (
          <div className="py-12 text-center text-[var(--annotix-gray)]">
            <FileUp size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('tts.noSentences')}</p>
            <p className="text-xs mt-1 opacity-70">{t('tts.noSentencesHint')}</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-[var(--annotix-border)]">
            {sentences.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--annotix-light)] group">
                <span className="text-xs tabular-nums text-[var(--annotix-gray)] w-8 text-right flex-shrink-0">
                  {idx + 1}
                </span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.status === 'recorded' ? 'bg-green-500'
                  : s.status === 'skipped' ? 'bg-amber-500'
                  : 'bg-gray-300'
                }`} />
                <input
                  type="text"
                  value={s.text}
                  onChange={e => handleEditText(s.id, e.target.value)}
                  className="flex-1 min-w-0 px-2 py-0.5 text-sm bg-transparent border border-transparent
                    hover:border-[var(--annotix-border)] focus:border-[var(--annotix-primary)]
                    focus:outline-none focus:ring-1 focus:ring-[var(--annotix-primary)]/30 rounded"
                />
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-[var(--annotix-gray)] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Next button */}
      {sentences.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="annotix-btn annotix-btn-primary gap-2">
            {t('tts.step2')}
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label, desc }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-lg border transition-all text-center ${
        active
          ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/5 shadow-sm'
          : 'border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/50'
      }`}
    >
      <span className={active ? 'text-[var(--annotix-primary)]' : 'text-[var(--annotix-gray)]'}>{icon}</span>
      <span className={`text-sm font-medium ${active ? 'text-[var(--annotix-primary)]' : 'text-[var(--annotix-dark)]'}`}>
        {label}
      </span>
      <span className="text-[10px] text-[var(--annotix-gray)]">{desc}</span>
    </button>
  );
}
