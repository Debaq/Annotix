import { useState, useEffect, useCallback } from 'react';
import { TtsSentence } from '@/lib/db';
import { ttsService } from '../services/ttsService';

export function useTtsSentences(projectId: string | undefined) {
  const [sentences, setSentences] = useState<TtsSentence[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await ttsService.getSentences(projectId);
      setSentences(data);
    } catch (err) {
      console.error('Failed to load TTS sentences:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (newSentences: TtsSentence[]) => {
    if (!projectId) return;
    setSentences(newSentences);
    await ttsService.saveSentences(projectId, newSentences);
  }, [projectId]);

  const stats = {
    total: sentences.length,
    recorded: sentences.filter(s => s.status === 'recorded').length,
    pending: sentences.filter(s => s.status === 'pending').length,
    skipped: sentences.filter(s => s.status === 'skipped').length,
  };

  return { sentences, setSentences: save, loading, reload: load, stats };
}
