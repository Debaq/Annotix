import { useState, useEffect } from 'react';
import { Audio } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { audioService } from '../services/audioService';

export function useCurrentAudio() {
  const { currentAudioId, currentProjectId } = useUIStore();
  const [audio, setAudio] = useState<Audio | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!currentAudioId || !currentProjectId) {
      setAudio(null);
      return;
    }

    setLoading(true);
    try {
      const data = await audioService.getById(currentProjectId, currentAudioId);
      setAudio(data || null);
    } catch (error) {
      console.error('Failed to load current audio:', error);
      setAudio(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentAudioId, currentProjectId]);

  return {
    audio,
    loading,
    reload: load,
  };
}
