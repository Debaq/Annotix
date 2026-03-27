import { Audio, AudioSegment, AudioEvent } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const audioService = {
  async getByProjectId(projectId: string): Promise<Audio[]> {
    return tauriDb.listAudioByProject(projectId);
  },

  async getById(projectId: string, id: string): Promise<Audio | undefined> {
    const record = await tauriDb.getAudio(projectId, id);
    return record ?? undefined;
  },

  async upload(
    projectId: string,
    filePath: string,
    durationMs: number,
    sampleRate: number,
    language?: string
  ): Promise<string> {
    return tauriDb.uploadAudio(projectId, filePath, durationMs, sampleRate, language);
  },

  async delete(projectId: string, id: string): Promise<void> {
    await tauriDb.deleteAudio(projectId, id);
  },

  async saveTranscription(
    projectId: string,
    audioId: string,
    transcription: string,
    speakerId?: string,
    language?: string
  ): Promise<void> {
    await tauriDb.saveTranscription(projectId, audioId, transcription, speakerId, language);
  },

  async saveAnnotation(
    projectId: string,
    audioId: string,
    data: {
      transcription?: string;
      speakerId?: string;
      language?: string;
      segments?: AudioSegment[];
      classId?: number | null;
      events?: AudioEvent[];
    }
  ): Promise<void> {
    await tauriDb.saveAudioAnnotation(projectId, audioId, data);
  },

  async getFilePath(projectId: string, audioId: string): Promise<string> {
    return tauriDb.getAudioFilePath(projectId, audioId);
  },

  async getAudioData(projectId: string, audioId: string): Promise<Uint8Array> {
    const bytes = await tauriDb.getAudioData(projectId, audioId);
    return new Uint8Array(bytes);
  },
};
