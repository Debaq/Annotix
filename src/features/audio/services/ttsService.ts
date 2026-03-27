import { TtsSentence, LlmConfig } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const ttsService = {
  async getSentences(projectId: string): Promise<TtsSentence[]> {
    return tauriDb.getTtsSentences(projectId);
  },

  async saveSentences(projectId: string, sentences: TtsSentence[]): Promise<void> {
    return tauriDb.saveTtsSentences(projectId, sentences);
  },

  async saveRecording(
    projectId: string,
    sentenceId: string,
    audioBase64: string,
    fileExt: string,
    durationMs: number,
    sampleRate: number,
  ): Promise<string> {
    return tauriDb.saveTtsRecording(projectId, sentenceId, audioBase64, fileExt, durationMs, sampleRate);
  },

  async linkUpload(projectId: string, sentenceId: string, audioId: string): Promise<void> {
    return tauriDb.linkTtsUpload(projectId, sentenceId, audioId);
  },

  async getLlmConfig(): Promise<LlmConfig | null> {
    return tauriDb.getLlmConfig();
  },

  async saveLlmConfig(config: LlmConfig): Promise<void> {
    return tauriDb.saveLlmConfig(config);
  },

  async generateWithLlm(
    language: string,
    count: number,
    domain: string,
    length: string,
  ): Promise<string[]> {
    return tauriDb.generateTtsWithLlm(language, count, domain, length);
  },
};
