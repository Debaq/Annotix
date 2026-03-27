import { useState, useEffect } from 'react';
import { Audio } from '@/lib/db';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { audioService } from '../services/audioService';

export function useAudio() {
  const { project } = useCurrentProject();
  const [audioList, setAudioList] = useState<Audio[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!project?.id) {
      setAudioList([]);
      return;
    }

    setLoading(true);
    try {
      const data = await audioService.getByProjectId(project.id);
      setAudioList(data);
    } catch (error) {
      console.error('Failed to load audio:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [project?.id]);

  const deleteAudioItem = async (id: string) => {
    if (!project?.id) return;
    try {
      await audioService.delete(project.id, id);
      await load();
    } catch (error) {
      console.error('Failed to delete audio:', error);
      throw error;
    }
  };

  const getStats = () => {
    const total = audioList.length;
    const done = audioList.filter(
      (a) => a.metadata.status === 'done' || a.metadata.status === 'review'
    ).length;
    const pending = total - done;

    return { total, done, pending };
  };

  return {
    audioList,
    loading,
    reload: load,
    deleteAudio: deleteAudioItem,
    stats: getStats(),
  };
}
